# HR Onboarding Platform

An AI-powered recruitment platform that scans your Gmail for job applications, parses resumes, and matches candidates to job roles using local LLMs (Ollama).

## Prerequisites
- Docker & Docker Compose
- Google Cloud Project with Gmail API and OAuth2 enabled
- [Ollama](https://ollama.com/) (Optional, if running locally, but included in Docker)

## Setup
1. **Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/).
   - Create a project.
   - Enable **Gmail API** and **Google People API**.
   - Create **OAuth 2.0 Client ID** (Web application).
   - Set Redirect URI to: `http://localhost:3000/auth/google/callback`.

2. **Environment Variables**:
   - Copy `.env.example` to `.env`.
   - Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

3. **Run the Platform**:
   ```bash
   docker-compose up --build
   ```

4. **Pull LLM Model**:
   If the Ollama container is running, you need to pull the model (e.g., llama3):
   ```bash
   docker exec -it hr-ollama ollama pull llama3
   ```

5. **Access**:
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:3000`

## Features
- **Google Login**: Secure authentication with Gmail permissions.
- **Job Role Management**: Create and track job requirements.
- **AI Scanning**: One-click scan of the top 10 emails.
- **Resume Matching**: Automatic PDF text extraction and LLM-based scoring (>= 60% match for shortlisting).
- **Shortlist Table**: View candidates with their match scores and details.

## Tech Stack
- **Frontend**: Vite, React, Vanilla CSS (Premium Design), Lucide Icons.
- **Backend**: Node.js, Express, Google APIs, AI SDK.
- **Database**: PostgreSQL (Candidates & Jobs), Redis (Session management ready).
- **AI**: Ollama (Local LLM), pdf-parse.
- **Infrastructure**: Docker, Docker Compose.
