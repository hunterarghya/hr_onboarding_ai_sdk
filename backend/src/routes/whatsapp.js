const express = require('express');
const router = express.Router();
const { getWhatsAppStatus, getGroups } = require('../services/whatsapp');

// Get WhatsApp Connection Status & QR Code
router.get('/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

// Get List of Groups
router.get('/groups', async (req, res) => {
  try {
    const groups = await getGroups();
    res.json(groups);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

module.exports = router;
