const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('./config');
const { createApiRouter } = require('./routes/api');

function createApp({ getBotStatus = () => ({ state: 'unavailable', connected: false }) } = {}) {
    const app = express();
    app.set('trust proxy', config.trustProxy);
    app.disable('x-powered-by');
    app.use(helmet({ crossOriginResourcePolicy: false }));
    app.use(cors({
        credentials: true,
        origin(origin, callback) {
            if (!origin || config.clientOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Origin tidak diizinkan.'));
        },
    }));
    app.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));
    app.use(express.json({ limit: '100kb' }));
    app.use(cookieParser());

    app.get('/', (req, res) => res.json({ name: 'Klop Money API', status: 'active' }));
    app.get('/api/health', (req, res) => res.json({ status: 'ok', bot: getBotStatus(), timestamp: new Date().toISOString() }));
    app.use('/api', createApiRouter());

    app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan.' }));
    app.use((error, req, res, next) => {
        console.error(error.message);
        if (res.headersSent) return next(error);
        const status = error.statusCode || (error.message === 'Origin tidak diizinkan.' ? 403 : 500);
        return res.status(status).json({ message: status >= 500 ? 'Terjadi kesalahan pada server.' : error.message });
    });

    return app;
}

module.exports = { createApp };
