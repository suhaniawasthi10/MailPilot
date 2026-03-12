import express from 'express';
import { googleWebhook, microsoftWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// Google Pub/Sub push notifications — no auth, no rate limit
router.post('/google', googleWebhook);

// Microsoft Graph change notifications — no auth, no rate limit
router.post('/microsoft', microsoftWebhook);

export default router;
