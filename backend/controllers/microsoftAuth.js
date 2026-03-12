/**
 * Microsoft Auth Controller
 *
 * Handles Microsoft OAuth2 flow using MSAL (Microsoft Authentication Library).
 * Supports both LOGIN (first-time) and CONNECT (add to existing user) flows,
 * mirroring the Google auth pattern.
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import EmailConnection from '../models/EmailConnection.js';
import { msalClient, MICROSOFT_SCOPES as SCOPES, MICROSOFT_REDIRECT_URI as REDIRECT_URI } from '../config/microsoft.js';
import { registerMicrosoftSubscription } from '../services/watchService.js';

// @desc    Redirect user to Microsoft login (first-time)
// @route   GET /auth/microsoft
const microsoftLogin = async (req, res) => {
    try {
        const authUrl = await msalClient.getAuthCodeUrl({
            scopes: SCOPES,
            redirectUri: REDIRECT_URI,
            prompt: 'consent',
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('Microsoft login error:', error.message);
        res.status(500).json({ message: 'Failed to initiate Microsoft login' });
    }
};

// @desc    Connect an additional Microsoft account to logged-in user
// @route   GET /auth/microsoft/connect
const microsoftConnect = async (req, res) => {
    try {
        const token = req.query.token;

        if (!token) {
            return res.status(400).json({ message: 'Token query param is required' });
        }

        const authUrl = await msalClient.getAuthCodeUrl({
            scopes: SCOPES,
            redirectUri: REDIRECT_URI,
            prompt: 'consent',
            state: token,  // Pass JWT as state — callback will decode it
        });

        res.redirect(authUrl);
    } catch (error) {
        console.error('Microsoft connect error:', error.message);
        res.status(500).json({ message: 'Failed to initiate Microsoft connect' });
    }
};

// @desc    Handle Microsoft OAuth callback (login OR connect)
// @route   GET /auth/microsoft/callback
const microsoftCallback = async (req, res) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).json({ message: 'Authorization code missing' });
        }

        // Exchange code for tokens
        const tokenResponse = await msalClient.acquireTokenByCode({
            code,
            scopes: SCOPES,
            redirectUri: REDIRECT_URI,
        });

        const accessToken = tokenResponse.accessToken;

        // Get user info from Microsoft Graph
        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const userInfo = await userResponse.json();

        let user;

        if (state) {
            // --- CONNECT flow: adding account to existing user ---
            const decoded = jwt.verify(state, process.env.JWT_SECRET);
            user = await User.findById(decoded.id);

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
        } else {
            // --- LOGIN flow: create or find user ---
            // Use Microsoft ID to find existing user, or create new one
            user = await User.findOneAndUpdate(
                { providerId: `microsoft_${userInfo.id}` },
                {
                    providerId: `microsoft_${userInfo.id}`,
                    email: userInfo.mail || userInfo.userPrincipalName,
                    name: userInfo.displayName,
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // Create or update EmailConnection
        const connection = await EmailConnection.findOneAndUpdate(
            { userId: user._id, providerAccountId: userInfo.id },
            {
                userId: user._id,
                provider: 'microsoft',
                providerAccountId: userInfo.id,
                emailAddress: userInfo.mail || userInfo.userPrincipalName,
                accessToken: accessToken,
                refreshToken: tokenResponse.refreshToken || undefined,
            },
            { upsert: true, returnDocument: 'after' }
        );

        // Register Microsoft webhook subscription (non-blocking)
        registerMicrosoftSubscription(connection).catch((err) =>
            console.error('Microsoft subscription registration failed:', err.message)
        );

        // Generate JWT
        const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: '7d',
        });

        res.redirect(`${process.env.FRONTEND_URL}?token=${jwtToken}`);
    } catch (error) {
        console.error('Microsoft callback error:', error.message);
        res.status(500).json({ message: 'Microsoft OAuth callback failed' });
    }
};

export { microsoftLogin, microsoftConnect, microsoftCallback };
