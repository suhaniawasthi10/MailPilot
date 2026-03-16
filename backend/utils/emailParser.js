/**
 * Shared email parsing helpers.
 * Used by both emailController (manual sync) and webhookSyncService (auto sync).
 */

// Extract email body from a Gmail message payload.
// Prefers text/html for rich content (images, formatting).
// Falls back to text/plain, then snippet.
export const getEmailBody = (payload) => {
    let htmlBody = '';
    let textBody = '';

    const extractParts = (parts) => {
        for (const part of parts) {
            if (part.parts) {
                extractParts(part.parts);
            } else if (part.mimeType === 'text/html' && part.body.data) {
                htmlBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
            } else if (part.mimeType === 'text/plain' && part.body.data) {
                textBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
        }
    };

    if (payload.parts) {
        extractParts(payload.parts);
    } else if (payload.body.data) {
        if (payload.mimeType === 'text/html') {
            htmlBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        } else {
            textBody = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
    }

    return htmlBody || textBody || payload.snippet;
};

// Extract a specific header value (e.g., "Subject", "From") from Gmail headers array.
export const getHeader = (headers, name) => {
    const header = headers.find((h) => h.name === name);
    return header ? header.value : '';
};
