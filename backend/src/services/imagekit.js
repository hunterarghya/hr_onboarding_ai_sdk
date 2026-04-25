const ImageKit = require('imagekit');

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

/**
 * Uploads a base64 PDF to ImageKit
 * @param {string} base64Data - Raw base64 string
 * @param {string} filename - Desired filename
 * @returns {Promise<string>} - The URL of the uploaded file
 */
const uploadResume = async (base64Data, filename) => {
    try {
        console.log(`--- ImageKit: Uploading ${filename}... ---`);
        const response = await imagekit.upload({
            file: base64Data, // required
            fileName: filename, // required
            folder: '/resumes',
            useUniqueFileName: true
        });
        
        console.log(`--- ImageKit: Upload successful! URL: ${response.url} ---`);
        return response.url;
    } catch (error) {
        console.error('--- ImageKit Upload Error ---', error);
        return null;
    }
};

module.exports = { uploadResume };
