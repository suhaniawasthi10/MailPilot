import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/encryption.js';

const emailConnectionSchema = new mongoose.Schema(
    {
        // Which app user owns this connection
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Which provider (google or microsoft)
        provider: {
            type: String,
            enum: ['google', 'microsoft'],
            required: true,
        },
        // The provider's unique account ID (e.g., Google sub ID)
        providerAccountId: {
            type: String,
            required: true,
        },
        // The email address of this connection
        emailAddress: {
            type: String,
            required: true,
        },
        // OAuth tokens for this specific connection (stored encrypted)
        accessToken: {
            type: String,
        },
        refreshToken: {
            type: String,
        },

        // --- Webhook / Watch fields ---
        // Google: resourceId returned by gmail.users.watch()
        watchResourceId: {
            type: String,
        },
        // Google: last known historyId for incremental sync
        // (so we only fetch emails that arrived AFTER the last sync)
        historyId: {
            type: String,
        },
        // Microsoft: subscription ID from Graph API
        watchSubscriptionId: {
            type: String,
        },
        // When the watch/subscription expires (Google: 7 days, Microsoft: ~3 days)
        watchExpiration: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate connections: a user can't connect the same provider account twice
// But CAN connect multiple different provider accounts (e.g., 3 different Gmail accounts)
emailConnectionSchema.index({ userId: 1, providerAccountId: 1 }, { unique: true });
// Index for fast webhook lookups — Microsoft notifications identify by subscriptionId
emailConnectionSchema.index({ watchSubscriptionId: 1 }, { sparse: true });

// Encrypt tokens before saving
// Note: Mongoose 9 removed the `next` callback from hooks — just return instead
emailConnectionSchema.pre('save', function () {
    if (this.isModified('accessToken') && this.accessToken) {
        this.accessToken = encrypt(this.accessToken);
    }
    if (this.isModified('refreshToken') && this.refreshToken) {
        this.refreshToken = encrypt(this.refreshToken);
    }
});

// Encrypt tokens on findOneAndUpdate
emailConnectionSchema.pre('findOneAndUpdate', function () {
    const update = this.getUpdate();
    if (update.accessToken) {
        update.accessToken = encrypt(update.accessToken);
    }
    if (update.refreshToken) {
        update.refreshToken = encrypt(update.refreshToken);
    }
});

// Decrypt tokens after reading from DB
emailConnectionSchema.post('find', function (docs) {
    for (const doc of docs) {
        if (doc.accessToken) doc.accessToken = decrypt(doc.accessToken);
        if (doc.refreshToken) doc.refreshToken = decrypt(doc.refreshToken);
    }
});

emailConnectionSchema.post('findOne', function (doc) {
    if (!doc) return;
    if (doc.accessToken) doc.accessToken = decrypt(doc.accessToken);
    if (doc.refreshToken) doc.refreshToken = decrypt(doc.refreshToken);
});

emailConnectionSchema.post('findOneAndUpdate', function (doc) {
    if (!doc) return;
    if (doc.accessToken) doc.accessToken = decrypt(doc.accessToken);
    if (doc.refreshToken) doc.refreshToken = decrypt(doc.refreshToken);
});

export default mongoose.model('EmailConnection', emailConnectionSchema);
