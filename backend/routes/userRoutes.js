import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/user/signature
router.get('/signature', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('emailSignature');
        res.json({ signature: user?.emailSignature || '' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch signature' });
    }
});

// PUT /api/user/signature
router.put('/signature', protect, async (req, res) => {
    try {
        const { signature } = req.body;
        await User.findByIdAndUpdate(req.user.id, { emailSignature: signature || '' });
        res.json({ message: 'Signature saved' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to save signature' });
    }
});

export default router;
