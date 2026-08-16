const express = require('express');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { requireAuth, requireCsrf, requireCsrfForMutation } = require('../middleware/auth');
const {
    verifyLoginCode,
    createSession,
    createCsrfToken,
    getCookieOptions,
    getCsrfCookieOptions,
    normalizePhone,
} = require('../services/authService');
const {
    ensureUserContext,
    listTransactions,
    createTransaction,
    updateTransactionById,
    deleteTransactionById,
    getDashboard,
    getBudgetSummary,
    saveBudgets,
    getAllowedCategories,
    getProfile,
    updateProfile,
} = require('../services/googleSheetsService');

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const CATEGORY_PATTERN = /^[^<>\u0000-\u001F]{1,80}$/u;
const AVATAR_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function isValidAmount(value, allowZero = false) {
    const amount = Number(value);
    return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && amount <= 1_000_000_000_000;
}

function isValidAvatar(value) {
    if (value === '' || value === undefined) return true;
    const text = String(value || '');
    if (text.length > 45_000) return false;
    const match = text.match(AVATAR_PATTERN);
    return Boolean(match && Buffer.from(match[1], 'base64').length <= 33_000);
}

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createApiRouter() {
    const router = express.Router();
    const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

    router.use((req, res, next) => {
        if (!req.body) req.body = {};
        next();
    });

    router.post('/auth/verify', loginLimiter, asyncRoute(async (req, res) => {
        const { whatsappNumber, code } = req.body || {};
        if (!/^\d{8,20}$/.test(normalizePhone(whatsappNumber)) || !/^\d{6}$/.test(String(code || ''))) {
            return res.status(400).json({ message: 'Nomor WhatsApp dan kode 6 digit wajib diisi.' });
        }
        const verification = verifyLoginCode(whatsappNumber, code);
        if (!verification.ok) return res.status(401).json({ message: verification.reason });

        const context = await ensureUserContext(verification.phone, verification.context.workspaceId);
        const token = createSession({
            phone: context.phone,
            userId: context.userId,
            workspaceId: context.workspaceId,
            displayName: context.displayName,
        });
        const csrfToken = createCsrfToken();
        res.cookie(config.sessionCookieName, token, getCookieOptions());
        res.cookie(config.csrfCookieName, csrfToken, getCsrfCookieOptions());
        return res.json({ user: await getProfile(context.phone, context.workspaceId), csrfToken });
    }));

    router.get('/auth/csrf', requireAuth, (req, res) => {
        const csrfToken = req.cookies?.[config.csrfCookieName] || createCsrfToken();
        res.cookie(config.csrfCookieName, csrfToken, getCsrfCookieOptions());
        return res.json({ csrfToken });
    });

    router.post('/auth/logout', requireAuth, requireCsrf, (req, res) => {
        res.clearCookie(config.sessionCookieName, { ...getCookieOptions(), maxAge: 0 });
        res.clearCookie(config.csrfCookieName, { ...getCsrfCookieOptions(), maxAge: 0 });
        res.json({ message: 'Berhasil keluar.' });
    });

    router.get('/auth/me', requireAuth, asyncRoute(async (req, res) => {
        const profile = await getProfile(req.user.phone, req.user.workspaceId);
        res.json({ user: profile });
    }));

    router.use(requireAuth);
    router.use(requireCsrfForMutation);

    router.get('/dashboard', asyncRoute(async (req, res) => {
        res.json(await getDashboard(req.user.workspaceId, req.user.phone, req.query.month));
    }));

    router.get('/categories', asyncRoute(async (req, res) => {
        res.json({ categories: await getAllowedCategories(req.user.workspaceId) });
    }));

    router.get('/transactions', asyncRoute(async (req, res) => {
        const transactions = await listTransactions({
            workspaceId: req.user.workspaceId,
            viewerPhone: req.user.phone,
            month: req.query.month,
            limit: req.query.limit,
        });
        res.json({ transactions });
    }));

    router.get('/transactions/:id', asyncRoute(async (req, res) => {
        const transactions = await listTransactions({ workspaceId: req.user.workspaceId, viewerPhone: req.user.phone, limit: 500 });
        const transaction = transactions.find((item) => item.id === req.params.id);
        if (!transaction) return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        return res.json({ transaction });
    }));

    router.post('/transactions', asyncRoute(async (req, res) => {
        const categories = await getAllowedCategories(req.user.workspaceId);
        if (!categories.includes(req.body.category) || !isValidAmount(req.body.amount)) {
            return res.status(400).json({ message: 'Kategori atau nominal transaksi tidak valid.' });
        }
        const transaction = await createTransaction({
            workspaceId: req.user.workspaceId,
            reporter: req.user.phone,
            type: req.body.type,
            category: req.body.category,
            amount: req.body.amount,
            description: req.body.description,
            scope: req.body.scope,
            timestamp: req.body.timestamp,
        });
        res.status(201).json({ transaction });
    }));

    router.put('/transactions/:id', asyncRoute(async (req, res) => {
        const categories = req.body.category === undefined ? null : await getAllowedCategories(req.user.workspaceId);
        if ((req.body.category !== undefined && !categories.includes(req.body.category)) ||
            (req.body.amount !== undefined && !isValidAmount(req.body.amount))) {
            return res.status(400).json({ message: 'Kategori atau nominal transaksi tidak valid.' });
        }
        const visible = await listTransactions({ workspaceId: req.user.workspaceId, viewerPhone: req.user.phone, limit: 500 });
        if (!visible.some((item) => item.id === req.params.id)) return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        const transaction = await updateTransactionById(req.params.id, req.user.phone, req.body || {});
        if (!transaction) return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        return res.json({ transaction });
    }));

    router.delete('/transactions/:id', asyncRoute(async (req, res) => {
        const visible = await listTransactions({ workspaceId: req.user.workspaceId, viewerPhone: req.user.phone, limit: 500 });
        if (!visible.some((item) => item.id === req.params.id)) return res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        await deleteTransactionById(req.params.id, req.user.phone);
        return res.json({ message: 'Transaksi berhasil dihapus dari tampilan.' });
    }));

    router.get('/budgets', asyncRoute(async (req, res) => {
        const transactions = await listTransactions({ workspaceId: req.user.workspaceId, viewerPhone: req.user.phone, month: req.query.month, limit: 500 });
        const budgets = await getBudgetSummary(req.user.workspaceId, req.query.month, transactions);
        res.json({ month: req.query.month, budgets });
    }));

    router.put('/budgets', asyncRoute(async (req, res) => {
        if (!MONTH_PATTERN.test(String(req.body.month || '')) || !Array.isArray(req.body.budgets) || req.body.budgets.length > 50 ||
            req.body.budgets.some((budget) => !CATEGORY_PATTERN.test(String(budget.category || '').trim()) || !isValidAmount(budget.amount, true))) {
            return res.status(400).json({ message: 'Data budget tidak valid.' });
        }
        await saveBudgets(req.user.workspaceId, req.body.month, req.body.budgets);
        const transactions = await listTransactions({ workspaceId: req.user.workspaceId, viewerPhone: req.user.phone, month: req.body.month, limit: 500 });
        const budgets = await getBudgetSummary(req.user.workspaceId, req.body.month, transactions);
        res.json({ budgets });
    }));

    router.get('/account', asyncRoute(async (req, res) => {
        res.json({ profile: await getProfile(req.user.phone, req.user.workspaceId) });
    }));

    router.put('/account', asyncRoute(async (req, res) => {
        const identityFields = ['phone', 'whatsappNumber', 'wa_number'];
        if (identityFields.some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field))) {
            return res.status(403).json({ message: 'Nomor WhatsApp tidak dapat diubah sendiri. Hubungi owner/admin atau developer.' });
        }
        if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email))) {
            return res.status(400).json({ message: 'Format email tidak valid.' });
        }
        if (!isValidAvatar(req.body.avatarDataUrl)) {
            return res.status(400).json({ message: 'Foto profil tidak valid atau ukurannya terlalu besar.' });
        }
        if (req.body.currency !== undefined && req.body.currency !== 'IDR') {
            return res.status(400).json({ message: 'Mata uang belum didukung.' });
        }
        if (req.body.reportPeriod !== undefined && !['weekly', 'monthly'].includes(req.body.reportPeriod)) {
            return res.status(400).json({ message: 'Format laporan tidak valid.' });
        }
        if (req.body.remindersEnabled !== undefined && typeof req.body.remindersEnabled !== 'boolean') {
            return res.status(400).json({ message: 'Pengaturan pengingat tidak valid.' });
        }
        res.json({ profile: await updateProfile(req.user.phone, req.body || {}, req.user.workspaceId) });
    }));

    return router;
}

module.exports = { createApiRouter, isValidAvatar };
