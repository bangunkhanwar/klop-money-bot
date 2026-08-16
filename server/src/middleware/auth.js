const crypto = require('crypto');
const { config } = require('../config');
const { verifySession } = require('../services/authService');

function requireAuth(req, res, next) {
    const token = req.cookies?.[config.sessionCookieName];
    if (!token) return res.status(401).json({ message: 'Silakan login terlebih dahulu.' });

    try {
        req.user = verifySession(token);
        return next();
    } catch {
        return res.status(401).json({ message: 'Sesi sudah berakhir. Silakan login kembali.' });
    }
}

function requireCsrf(req, res, next) {
    const cookieToken = String(req.cookies?.[config.csrfCookieName] || '');
    const headerToken = String(req.get('x-csrf-token') || '');
    if (!cookieToken || !headerToken) return res.status(403).json({ message: 'Token keamanan tidak tersedia. Silakan login kembali.' });

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);
    if (cookieBuffer.length !== headerBuffer.length || !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
        return res.status(403).json({ message: 'Token keamanan tidak valid. Silakan login kembali.' });
    }
    return next();
}

function requireCsrfForMutation(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    return requireCsrf(req, res, next);
}

module.exports = { requireAuth, requireCsrf, requireCsrfForMutation };
