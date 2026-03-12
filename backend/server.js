import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import commitmentRoutes from './routes/commitmentRoutes.js';
import connectionRoutes from './routes/connectionRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';
import { startWatchRenewalScheduler } from './services/watchService.js';
import { initSocket } from './services/socketService.js';
import { startCleanupScheduler } from './services/cleanupService.js';

const app = express();
// Wrap Express in a raw HTTP server — required for Socket.io
// Socket.io upgrades HTTP connections to WebSocket, which needs
// access to the underlying HTTP server (not just Express)
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

// Routes (with rate limiting)
app.use('/auth', authLimiter, authRoutes);
app.use('/api/emails', apiLimiter, emailRoutes);
app.use('/api/commitments', apiLimiter, commitmentRoutes);
app.use('/api/connections', apiLimiter, connectionRoutes);

// Webhook routes — NO auth, NO rate limiting (called by Google/Microsoft servers)
app.use('/webhooks', webhookRoutes);

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'MailPilot API is running' });
});

// Connect to DB and start server
connectDB().then(() => {
    // Initialize Socket.io BEFORE listening — attaches to the HTTP server
    initSocket(httpServer);

    // Use httpServer.listen() instead of app.listen()
    // This starts BOTH the Express REST API and the WebSocket server
    // on the same port — no need for a separate WebSocket port
    httpServer.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    // Start renewing expiring watches every 6 hours
    startWatchRenewalScheduler();

    // Auto-delete completed commitments older than 30 days (runs daily)
    startCleanupScheduler();
});
