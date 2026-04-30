import express from 'express';
import auth from '../middleware/auth.js';
import User from '../models/User.js';
import EmailConnection from '../models/EmailConnection.js';
import { deleteConnectionFully } from '../services/connectionCleanupService.js';

const router = express.Router();

// GET /api/user/signature
router.get('/signature', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('emailSignature');
        res.json({ signature: user?.emailSignature || '' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch signature' });
    }
});

// PUT /api/user/signature
router.put('/signature', auth, async (req, res) => {
    try {
        const { signature } = req.body;
        await User.findByIdAndUpdate(req.user.id, { emailSignature: signature || '' });
        res.json({ message: 'Signature saved' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to save signature' });
    }
});

// DELETE /api/user — wipe the account: every connection's vectors, emails,
// commitments, provider subscriptions, then the User row itself.
// Per-connection failures are logged but don't block the rest.
router.delete('/', auth, async (req, res) => {
    try {
        const connections = await EmailConnection.find({ userId: req.user.id });
        for (const connection of connections) {
            try {
                await deleteConnectionFully(connection);
            } catch (err) {
                console.error(`Failed to fully delete connection ${connection._id}:`, err.message);
            }
        }

        await User.findByIdAndDelete(req.user.id);
        res.json({ message: 'Account deleted' });
    } catch (error) {
        console.error('Delete account error:', error.message);
        res.status(500).json({ message: 'Failed to delete account' });
    }
});

export default router;
