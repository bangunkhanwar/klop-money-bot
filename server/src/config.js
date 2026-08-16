const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true });

function parseBoolean(value, fallback = false) {
    if (value === undefined) return fallback;
    return String(value).toLowerCase() === 'true';
}

function parseOrigins(value) {
    return String(value || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function parseTrustProxy(value) {
    if (value === undefined || value === '' || value === 'false') return false;
    if (value === 'true') return true;
    if (/^\d+$/.test(String(value))) return Number(value);
    return String(value);
}

function resolveServerPath(value, fallback) {
    const selected = value || fallback;
    return path.isAbsolute(selected) ? selected : path.resolve(serverRoot, selected);
}

const config = {
    env: process.env.NODE_ENV || 'development',
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 3000),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    clientOrigins: parseOrigins(process.env.CLIENT_ORIGINS),
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
    sessionSecret: process.env.SESSION_SECRET || '',
    sessionCookieName: process.env.SESSION_COOKIE_NAME || 'klop_session',
    csrfCookieName: 'klop_csrf',
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 2),
    ownerNumber: process.env.OWNER_NUMBER || '',
    ownerLid: process.env.OWNER_LID || '',
    botAccountNumber: process.env.BOT_ACCOUNT_NUMBER || '',
    termsUrl: process.env.TERMS_URL || '',
    botEnabled: parseBoolean(process.env.BOT_ENABLED, true),
    whatsappDisableSandbox: parseBoolean(process.env.WHATSAPP_DISABLE_SANDBOX, false),
    chromeExecutablePath: process.env.WHATSAPP_CHROME_PATH || '',
    paths: {
        serverRoot,
        credentials: resolveServerPath(process.env.GOOGLE_CREDENTIALS_PATH, 'private/credentials.json'),
        whitelist: path.join(serverRoot, 'data', 'whitelist.json'),
        whatsappAuth: path.join(serverRoot, '.wwebjs_auth'),
        whatsappCache: path.join(serverRoot, '.wwebjs_cache'),
    },
};

function validateConfig() {
    const errors = [];
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) errors.push('PORT tidak valid');
    if (!config.spreadsheetId) errors.push('GOOGLE_SPREADSHEET_ID belum diisi');
    if (!config.sessionSecret || config.sessionSecret.length < 32) errors.push('SESSION_SECRET minimal 32 karakter');
    if (!Number.isInteger(config.sessionTtlHours) || config.sessionTtlHours < 1 || config.sessionTtlHours > 24) {
        errors.push('SESSION_TTL_HOURS harus antara 1 sampai 24');
    }
    if (!fs.existsSync(config.paths.credentials)) errors.push(`Kredensial Google tidak ditemukan: ${config.paths.credentials}`);
    if (config.botEnabled && !config.botAccountNumber) errors.push('BOT_ACCOUNT_NUMBER belum diisi');
    if (config.botEnabled && !/^\d{8,20}$/.test(config.botAccountNumber.replace(/\D/g, ''))) {
        errors.push('BOT_ACCOUNT_NUMBER tidak valid');
    }
    if (config.botEnabled && !config.ownerNumber) errors.push('OWNER_NUMBER belum diisi');
    if (config.botEnabled && !/^\d{8,20}$/.test(config.ownerNumber.replace(/\D/g, ''))) {
        errors.push('OWNER_NUMBER tidak valid');
    }
    if (config.botEnabled && config.ownerNumber && config.ownerNumber.replace(/\D/g, '') === config.botAccountNumber.replace(/\D/g, '')) {
        errors.push('OWNER_NUMBER harus berbeda dari BOT_ACCOUNT_NUMBER');
    }
    if (config.env === 'production' && (!config.termsUrl || /contoh\.com/i.test(config.termsUrl))) {
        errors.push('TERMS_URL production wajib memakai alamat resmi');
    }
    if (errors.length) throw new Error(`Konfigurasi tidak valid:\n- ${errors.join('\n- ')}`);
}

module.exports = { config, validateConfig };
