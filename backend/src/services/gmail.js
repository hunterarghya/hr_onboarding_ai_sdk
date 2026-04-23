const { google } = require('googleapis');
const pdf = require('pdf-parse');

const getGmailService = (tokens) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

/**
 * Fetches the top 10 emails from the inbox.
 */
const fetchEmails = async (tokens) => {
  console.log('Fetching top 10 emails from Gmail...');
  const gmail = getGmailService(tokens);
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 10,
  });

  const messages = response.data.messages || [];
  const fullMessages = [];

  for (const message of messages) {
    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
    });
    fullMessages.push(fullMsg.data);
  }

  return fullMessages;
};

/**
 * Extracts attachments (PDFs) from a message.
 */
const getAttachments = async (tokens, messageId, parts) => {
  const gmail = getGmailService(tokens);
  const attachments = [];

  for (const part of parts) {
    console.log(`Checking part: filename="${part.filename}", mimeType="${part.mimeType}"`);
    if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
      const attachId = part.body.attachmentId;
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachId,
      });

      const data = Buffer.from(response.data.data, 'base64');
      const pdfData = await pdf(data);
      attachments.push({
        filename: part.filename,
        text: pdfData.text
      });
    } else if (part.parts) {
      const nested = await getAttachments(tokens, messageId, part.parts);
      attachments.push(...nested);
    }
  }

  return attachments;
};

module.exports = { fetchEmails, getAttachments };
