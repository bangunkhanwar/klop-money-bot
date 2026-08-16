const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config');

const loginCodes = new Map();
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizePhone(value) {
    let clean = String(value || '').replace(/\D/g, '');
    if (clean.startsWith('0')) clean = `62${clean.slice(1)}`;
    return clean;
}

function hashCode(phone, code) {
    return crypto.createHmac('sha256', config.sessionSecret).update(`${phone}:${code}`).digest('hex');
}

function createLoginCode(whatsappNumber, context = {}) {
    const phone = normalizePhone(whatsappNumber);
    if (!phone) throw new Error('Nomor WhatsApp tidak valid');

    const code = String(crypto.randomInt(100000, 1000000));
    loginCodes.set(phone, {
        codeHash: hashCode(phone, code),
        expiresAt: Date.now() + CODE_TTL_MS,
        attempts: 0,
        context,
    });

    return { code, expiresInMinutes: CODE_TTL_MS / 60000 };
}

function verifyLoginCode(whatsappNumber, code) {
    const phone = normalizePhone(whatsappNumber);
    const entry = loginCodes.get(phone);
    if (!entry) return { ok: false, reason: 'Kode tidak ditemukan. Minta kode baru melalui WhatsApp.' };
    if (Date.now() > entry.expiresAt) {
        loginCodes.delete(phone);
        return { ok: false, reason: 'Kode sudah kedaluwarsa. Minta kode baru melalui WhatsApp.' };
    }
    entry.attempts += 1;
    if (entry.attempts > MAX_ATTEMPTS) {
        loginCodes.delete(phone);
        return { ok: false, reason: 'Terlalu banyak percobaan. Minta kode baru melalui WhatsApp.' };
    }

    const suppliedHash = hashCode(phone, String(code || ''));
    const valid = crypto.timingSafeEqual(Buffer.from(entry.codeHash), Buffer.from(suppliedHash));
    if (!valid) return { ok: false, reason: 'Kode login tidak benar.' };

    loginCodes.delete(phone);
    return { ok: true, phone, context: entry.context };
}

function createSession(payload) {
    return jwt.sign(payload, config.sessionSecret, { expiresIn: `${config.sessionTtlHours}h`, issuer: 'klop-money' });
}

function verifySession(token) {
    return jwt.verify(token, config.sessionSecret, { issuer: 'klop-money' });
}

function getCookieOptions() {
    const production = config.env === 'production';
    return {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' : 'lax',
        maxAge: config.sessionTtlHours * 60 * 60 * 1000,
        path: '/',
    };
}

function createCsrfToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function getCsrfCookieOptions() {
    return { ...getCookieOptions(), httpOnly: false };
}

module.exports = {
    normalizePhone,
    createLoginCode,
    verifyLoginCode,
    createSession,
    verifySession,
    getCookieOptions,
    createCsrfToken,
    getCsrfCookieOptions,
};
