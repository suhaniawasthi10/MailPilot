import express from 'express';
import { googleLogin, googleConnect, googleCallback, getProfile } from '../controllers/authController.js';
import { microsoftLogin, microsoftConnect, microsoftCallback } from '../controllers/microsoftAuth.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// Google OAuth routes
router.get('/google', googleLogin);
router.get('/google/connect', googleConnect);
router.get('/google/callback', googleCallback);

// Microsoft OAuth routes
router.get('/microsoft', microsoftLogin);
router.get('/microsoft/connect', microsoftConnect);
router.get('/microsoft/callback', microsoftCallback);

// Protected routes
router.get('/profile', auth, getProfile);

export default router;
