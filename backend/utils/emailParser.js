/**
 * Shared email parsing helpers.
 * Used by both emailController (manual sync) and webhookSyncService (auto sync).
 */

// Extract plain text body from a Gmail message payload.
// Gmail messages can have a simple body or a multipart structure (text + HTML).
// We prefer the text/plain part; fall back to the snippet if nothing found.
export const getEmailBody = (payload) => {
    let body = '';
    if (payload.parts) {
        payload.parts.forEach((part) => {
            if (part.mimeType === 'text/plain' && part.body.data) {
                body += Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
        });
    } else if (payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    return body || payload.snippet;
};

// Extract a specific header value (e.g., "Subject", "From") from Gmail headers array.
export const getHeader = (headers, name) => {
    const header = headers.find((h) => h.name === name);
    return header ? header.value : '';
};
