const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client = null;
let qrCodeData = null;
let status = 'initializing'; 
let initialized = false;

const AUTH_PATH = './whatsapp-auth';

const cleanupLocks = (dir) => {
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        cleanupLocks(fullPath);
      } else if (file === 'SingletonLock') {
        try { fs.unlinkSync(fullPath); } catch (err) { }
      }
    }
  } catch (e) { }
};

const initWhatsApp = () => {
  if (initialized) return;
  initialized = true;
  console.log('--- WhatsApp: Initialization Sequence Started ---');
  try { cleanupLocks(AUTH_PATH); } catch (err) { }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      headless: true
    }
  });

  client.on('qr', (qr) => { status = 'qr'; qrcode.toDataURL(qr, (err, url) => { qrCodeData = url; }); });
  client.on('ready', () => { status = 'ready'; console.log('--- WhatsApp: Client is READY ---'); });
  client.on('authenticated', () => { if (status !== 'ready') status = 'authenticated'; });
  client.on('disconnected', () => { status = 'initializing'; initialized = false; setTimeout(() => initWhatsApp(), 5000); });

  client.initialize().catch(err => { status = 'error'; });
};

const getWhatsAppStatus = () => ({ status, qrCodeData });

const getGroups = async () => {
  if (status !== 'ready') return [];
  try {
    const chats = await client.getChats();
    return chats.filter(chat => chat.isGroup).map(chat => ({ id: chat.id._serialized, name: chat.name }));
  } catch (err) { return []; }
};

const fetchPDFsFromGroup = async (groupId) => {
  if (status !== 'ready') return [];
  console.log(`--- WhatsApp: Scanning Group ${groupId} (Doc-Based) ---`);
  
  try {
    // STRICTLY ACCORDING TO DOCUMENTATION
    const chat = await client.getChatById(groupId);
    console.log(`--- WhatsApp: Fetching messages for ${chat.name} ---`);
    
    const messages = await chat.fetchMessages({ limit: 100 });
    console.log(`--- WhatsApp: Found ${messages.length} messages. Checking media... ---`);

    const attachments = [];

    for (const msg of messages) {
      // Documentation: "You can detect which messages have attached media by checking its hasMedia property"
      if (msg.hasMedia) {
        // Documentation: "Actually download the data by using downloadMedia method"
        try {
          const media = await msg.downloadMedia();
          
          if (media && media.data) {
             // We only want PDFs for this specific HR application
             if (media.mimetype === 'application/pdf' || (media.filename && media.filename.toLowerCase().endsWith('.pdf'))) {
                console.log(`--- WhatsApp: ✅ Downloaded: ${media.filename || 'PDF'} ---`);
                attachments.push({
                  filename: media.filename || 'resume.pdf',
                  data: media.data,
                  sender: msg.author || msg.from,
                  source: 'WhatsApp'
                });
             }
          }
        } catch (downloadErr) {
          console.error(`--- WhatsApp: ❌ downloadMedia Error: ${downloadErr.message} ---`);
        }
      }
    }

    return attachments;
  } catch (err) {
    console.error('--- WhatsApp Global Error ---', err);
    return [];
  }
};

module.exports = { initWhatsApp, getWhatsAppStatus, fetchPDFsFromGroup, getGroups };
