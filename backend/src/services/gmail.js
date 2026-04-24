const { google } = require('googleapis');

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
 * Extracts raw attachments (PDFs) from a message parts.
 */
const getAttachments = async (tokens, messageId, parts) => {
  const gmail = getGmailService(tokens);
  const attachments = [];

  for (const part of parts) {
    if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
      console.log(`--- Gmail: Collecting raw PDF: ${part.filename} ---`);
      const attachId = part.body.attachmentId;
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachId,
      });

      // We return the raw base64 data to be processed centrally
      attachments.push({
        filename: part.filename,
        data: response.data.data // Raw base64 from Gmail API
      });
    } else if (part.parts) {
      const nested = await getAttachments(tokens, messageId, part.parts);
      attachments.push(...nested);
    }
  }

  return attachments;
};

module.exports = { fetchEmails, getAttachments };
