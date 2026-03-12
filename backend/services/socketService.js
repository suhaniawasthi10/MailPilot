/**
 * Socket.io Service
 *
 * Sets up a WebSocket server alongside our Express HTTP server.
 * This lets us PUSH real-time updates to the browser instead of
 * the frontend having to poll every 10 seconds.
 *
 * How it works:
 * 1. Frontend connects with their JWT token
 * 2. We verify the token (same auth as REST API)
 * 3. We put the user in a "room" named after their userId
 * 4. When a webhook delivers a new email, we emit to that room
 * 5. Frontend receives the event and updates the UI instantly
 *
 * Why rooms?
 * Socket.io "rooms" let us broadcast to a specific user.
 * When user A gets a new email, only user A's browser gets notified —
 * not every connected user. We use their MongoDB userId as the room name.
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

/**
 * Initialize Socket.io and attach it to the HTTP server.
 *
 * @param {http.Server} httpServer - The Node.js HTTP server (from http.createServer)
 * @returns {Server} The Socket.io server instance
 */
export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            credentials: true,
        },
    });

    // --- Authentication middleware ---
    // Runs ONCE when a client first connects (not on every message).
    // The client sends their JWT as: io({ auth: { token: "xxx" } })
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Attach userId to the socket for later use
            socket.userId = decoded.id;
            next();
        } catch (err) {
            return next(new Error('Invalid token'));
        }
    });

    // --- Connection handler ---
    io.on('connection', (socket) => {
        // Join a room named after the user's ID
        // This way we can target events to specific users
        socket.join(socket.userId);
    });

    return io;
};

/**
 * Get the Socket.io server instance.
 * Used by other services (like webhookSyncService) to emit events.
 */
export const getIO = () => io;

/**
 * Emit an event to a specific user.
 *
 * @param {string} userId - The MongoDB user ID to target
 * @param {string} event - Event name (e.g., 'email:new')
 * @param {Object} data - Data to send with the event
 */
export const emitToUser = (userId, event, data) => {
    if (!io) return;
    io.to(userId.toString()).emit(event, data);
};
