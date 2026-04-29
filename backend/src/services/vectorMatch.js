/**
 * Vector Matching Service
 * Uses Qdrant + BAAI/bge-small-en-v1.5 embeddings for resume-to-JD matching.
 * Replaces the LLM-based matchResume function.
 */

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'job_descriptions';
const VECTOR_SIZE = 384; // bge-small-en-v1.5 output dimension

// Singleton Qdrant client
const qdrant = new QdrantClient({ url: QDRANT_URL });

// ---- Embedding Model (lazy-loaded singleton) ----
let pipeline = null;
let tokenizer = null;

const getEmbeddingPipeline = async () => {
  if (pipeline) return pipeline;
  console.log('--- [Vector] Loading embedding model: BAAI/bge-small-en-v1.5 ---');
  const { pipeline: createPipeline } = await import('@xenova/transformers');
  pipeline = await createPipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');
  console.log('--- [Vector] Embedding model loaded ---');
  return pipeline;
};

/**
 * Generate an embedding vector for a given text string.
 * @param {string} text
 * @returns {Promise<number[]>} 384-dimensional vector
 */
const embed = async (text) => {
  const pipe = await getEmbeddingPipeline();
  // Truncate input to avoid OOM on very long texts
  const truncated = text.substring(0, 8000);
  const output = await pipe(truncated, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
};

// ---- Qdrant Collection Management ----

/**
 * Initialize the Qdrant collection. Idempotent — safe to call multiple times.
 */
const initCollection = async () => {
  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          full: { size: VECTOR_SIZE, distance: 'Cosine' },
          skills: { size: VECTOR_SIZE, distance: 'Cosine' },
          experience: { size: VECTOR_SIZE, distance: 'Cosine' },
        }
      });
      console.log(`--- [Vector] Created Qdrant collection: ${COLLECTION_NAME} ---`);
    } else {
      console.log(`--- [Vector] Qdrant collection already exists: ${COLLECTION_NAME} ---`);
    }
  } catch (err) {
    console.error('--- [Vector] Error initializing Qdrant collection:', err.message);
  }
};

/**
 * Upsert a job description into Qdrant.
 * Embeds the full JD, the skills section, and the experience requirement separately
 * for weighted scoring.
 *
 * @param {object} job - The job_roles row from Postgres
 */
const upsertJobDescription = async (job) => {
  try {
    const fullText = `${job.role}. ${job.skills || ''}. ${job.qualification || ''}. ${job.experience || ''}. ${job.location || ''}`;
    const skillsText = job.skills || job.role;
    const experienceText = job.experience || 'Any experience';

    const [fullVec, skillsVec, expVec] = await Promise.all([
      embed(fullText),
      embed(skillsText),
      embed(experienceText),
    ]);

    await qdrant.upsert(COLLECTION_NAME, {
      wait: true,
      points: [{
        id: job.id,
        vector: {
          full: fullVec,
          skills: skillsVec,
          experience: expVec,
        },
        payload: {
          role: job.role,
          skills: job.skills,
          experience: job.experience,
          shortlist_mode: job.shortlist_mode,
          min_score: job.min_score,
          criteria_weights: job.criteria_weights || null,
        }
      }]
    });
    console.log(`--- [Vector] Upserted JD: ${job.role} (id: ${job.id}) ---`);
  } catch (err) {
    console.error(`--- [Vector] Error upserting JD ${job.role}:`, err.message);
  }
};

/**
 * Remove a job description from Qdrant.
 * @param {number} jobId
 */
const removeJobDescription = async (jobId) => {
  try {
    await qdrant.delete(COLLECTION_NAME, { wait: true, points: [jobId] });
    console.log(`--- [Vector] Removed JD id: ${jobId} ---`);
  } catch (err) {
    console.error(`--- [Vector] Error removing JD ${jobId}:`, err.message);
  }
};

// ---- Scoring ----

/**
 * Normalize a raw cosine similarity to a 0-100 score.
 * Uses a floor threshold approach:
 *   Below 0.55 = 0 (reject zone)
 *   0.55 to 0.95 = 0–100 (usable zone)
 *   Above 0.95 = 100
 *
 * @param {number} similarity - Raw cosine similarity (0 to 1)
 * @returns {number} Normalized score (0 to 100)
 */
const normalizeScore = (similarity) => {
  const FLOOR = 0.55;
  const CEILING = 0.95;
  if (similarity <= FLOOR) return 0;
  if (similarity >= CEILING) return 100;
  return Math.round(((similarity - FLOOR) / (CEILING - FLOOR)) * 100);
};

/**
 * Match a resume against all stored job descriptions.
 * Returns the best matching role and a normalized score.
 *
 * @param {string} resumeText - Full raw resume text
 * @param {object} sections - {skills, projects, experience} from resumeParser
 * @param {object[]} jobRoles - Array of job_roles rows from Postgres (for criteria_weights lookup)
 * @returns {Promise<{target_role: string, score: number}>}
 */
const matchResumeToJobs = async (resumeText, sections, jobRoles) => {
  try {
    // 1. Embed the full resume
    const resumeVec = await embed(resumeText);

    // 2. Search Qdrant for closest JD using the "full" vector
    const searchResult = await qdrant.search(COLLECTION_NAME, {
      vector: { name: 'full', vector: resumeVec },
      limit: 3, // Get top 3 matches for comparison
      with_payload: true,
    });

    if (!searchResult || searchResult.length === 0) {
      return { target_role: 'Open', score: 0 };
    }

    const topMatch = searchResult[0];
    const topScore = topMatch.score; // Raw cosine similarity

    // 3. Check if the top match is strong enough to be a real match
    //    If even the best match is below 0.55, it's an "Open" candidate
    if (topScore < 0.55) {
      return { target_role: 'Open', score: normalizeScore(topScore) };
    }

    const targetRole = topMatch.payload.role;
    const jobId = topMatch.id;

    // 4. Find the job in the Postgres data for criteria_weights
    const job = jobRoles.find(j => j.id === jobId);
    const criteriaWeights = job?.criteria_weights;

    let finalScore;

    // 5. If criteria_weights are specified, compute weighted score
    if (criteriaWeights && Object.keys(criteriaWeights).length > 0) {
      // Embed resume sections
      const sectionEmbeddings = {};

      if (criteriaWeights.skills !== undefined && sections.skills) {
        sectionEmbeddings.skills = await embed(sections.skills);
      }
      if (criteriaWeights.projects !== undefined && sections.projects) {
        sectionEmbeddings.projects = await embed(sections.projects);
      }
      if (criteriaWeights.experience !== undefined && sections.experience) {
        sectionEmbeddings.experience = await embed(sections.experience);
      }

      // Get the JD's stored vectors for comparison
      const jobPoint = await qdrant.retrieve(COLLECTION_NAME, {
        ids: [jobId],
        with_vector: true,
      });

      if (jobPoint && jobPoint.length > 0) {
        const jobVectors = jobPoint[0].vector;
        let weightedSum = 0;
        let totalWeight = 0;

        // Skills similarity
        if (criteriaWeights.skills !== undefined && sectionEmbeddings.skills) {
          const sim = cosineSimilarity(sectionEmbeddings.skills, jobVectors.skills);
          weightedSum += criteriaWeights.skills * sim;
          totalWeight += criteriaWeights.skills;
        }

        // Projects similarity (compare against full JD since we don't have a separate projects vector)
        if (criteriaWeights.projects !== undefined && sectionEmbeddings.projects) {
          const sim = cosineSimilarity(sectionEmbeddings.projects, jobVectors.full);
          weightedSum += criteriaWeights.projects * sim;
          totalWeight += criteriaWeights.projects;
        }

        // Experience similarity
        if (criteriaWeights.experience !== undefined && sectionEmbeddings.experience) {
          const sim = cosineSimilarity(sectionEmbeddings.experience, jobVectors.experience);
          weightedSum += criteriaWeights.experience * sim;
          totalWeight += criteriaWeights.experience;
        }

        // If we got at least one weighted component, use the weighted score
        if (totalWeight > 0) {
          const weightedSimilarity = weightedSum / totalWeight;
          finalScore = normalizeScore(weightedSimilarity);
        } else {
          finalScore = normalizeScore(topScore);
        }
      } else {
        finalScore = normalizeScore(topScore);
      }
    } else {
      // No criteria weights — just use the raw full similarity
      finalScore = normalizeScore(topScore);
    }

    return { target_role: targetRole, score: finalScore };
  } catch (err) {
    console.error('--- [Vector] Error in matchResumeToJobs:', err.message);
    return { target_role: 'Open', score: 0 };
  }
};

/**
 * Compute cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Similarity between 0 and 1
 */
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

module.exports = {
  initCollection,
  upsertJobDescription,
  removeJobDescription,
  matchResumeToJobs,
  embed,
  normalizeScore,
};
