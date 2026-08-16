const crypto = require('crypto');
const { google } = require('googleapis');
const { config } = require('../config');
const { normalizePhone } = require('./authService');
const { canonicalPhone, isSameIdentity } = require('./identityService');

const SHEET_SCHEMAS = {
    Sheet1: ['Timestamp', 'Tipe', 'Kategori', 'Nominal', 'Pesan Asli', 'Pelapor', 'Household ID', 'transaction_id', 'scope', 'status', 'updated_at', 'source'],
    Pairing: ['wa_number', 'household_id', 'partner', 'status', 'paired_at', 'code_hash', 'expires_at'],
    Users: ['user_id', 'whatsapp_number', 'display_name', 'email', 'birth_date', 'city', 'status', 'created_at', 'updated_at', 'avatar_data_url'],
    Workspaces: ['workspace_id', 'name', 'type', 'owner_user_id', 'currency', 'report_period', 'reminders_enabled', 'created_at', 'updated_at'],
    Members: ['membership_id', 'workspace_id', 'user_id', 'role', 'status', 'joined_at'],
    Budgets: ['budget_id', 'workspace_id', 'month', 'category', 'amount', 'created_at', 'updated_at', 'status'],
};

const DEFAULT_BUDGETS = [
    ['Lainnya', 300000], ['Tagihan', 900000], ['Kebutuhan Pokok', 1200000],
    ['Makanan & Minuman', 1500000], ['Hiburan', 400000], ['Pendidikan', 300000],
    ['Transportasi', 600000], ['Belanja', 450000], ['Kesehatan', 350000],
];

const DEFAULT_CATEGORIES = [
    'Makanan & Minuman', 'Transportasi', 'Kebutuhan Pokok', 'Belanja', 'Tagihan', 'Kesehatan',
    'Pendidikan', 'Hiburan', 'Gaji', 'Bonus', 'Transfer', 'Lainnya',
];

let sheetsClientPromise;

function getSheetsClient() {
    if (!sheetsClientPromise) {
        sheetsClientPromise = (async () => {
            const auth = new google.auth.GoogleAuth({
                keyFile: config.paths.credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            return google.sheets({ version: 'v4', auth: await auth.getClient() });
        })();
    }
    return sheetsClientPromise;
}

function quoteSheet(title) {
    return `'${String(title).replace(/'/g, "''")}'`;
}

function columnName(number) {
    let result = '';
    for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) {
        result = String.fromCharCode(((value - 1) % 26) + 65) + result;
    }
    return result;
}

function createId(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
}

function stableUserId(phone) {
    return `USR-${crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16)}`;
}

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function isValidMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}

function parseAmount(value) {
    const amount = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(amount) ? amount : 0;
}

async function readRows(title, lastColumn) {
    const sheets = await getSheetsClient();
    const end = lastColumn || columnName(SHEET_SCHEMAS[title]?.length || 26);
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${quoteSheet(title)}!A:${end}`,
    });
    return response.data.values || [];
}

async function appendRows(title, rows) {
    if (!rows.length) return null;
    const sheets = await getSheetsClient();
    return sheets.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: `${quoteSheet(title)}!A:${columnName(Math.max(...rows.map((row) => row.length)))}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: rows },
    });
}

async function ensureDatabaseSchema() {
    const sheets = await getSheetsClient();
    const metadata = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId, fields: 'sheets.properties' });
    const existing = new Set((metadata.data.sheets || []).map((sheet) => sheet.properties.title));
    const missing = Object.keys(SHEET_SCHEMAS).filter((title) => !existing.has(title));

    if (missing.length) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: config.spreadsheetId,
            resource: { requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { rowCount: 1000, columnCount: 20 } } } })) },
        });
    }

    for (const [title, schema] of Object.entries(SHEET_SCHEMAS)) {
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: config.spreadsheetId, range: `${quoteSheet(title)}!1:1` });
        const existingHeader = response.data.values?.[0] || [];
        const mergedHeader = [...existingHeader];
        let changed = existingHeader.length === 0;
        schema.forEach((header, index) => {
            if (!mergedHeader[index]) {
                mergedHeader[index] = header;
                changed = true;
            } else if (mergedHeader[index] !== header) {
                console.warn(`Header ${title}!${columnName(index + 1)} dipertahankan: "${mergedHeader[index]}"`);
            }
        });
        if (changed) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheetId,
                range: `${quoteSheet(title)}!A1:${columnName(mergedHeader.length)}1`,
                valueInputOption: 'RAW',
                resource: { values: [mergedHeader] },
            });
        }
    }
    console.log(`Google Sheets siap. Tab baru: ${missing.length ? missing.join(', ') : 'tidak ada'}.`);
    return { addedSheets: missing };
}

async function appendToSheet(data) {
    const timestamp = data[0] || new Date().toISOString();
    const description = String(data[4] || '').slice(0, 500);
    const scope = /\(pribadi\)|pos pribadi/i.test(description) ? 'personal' : 'shared';
    const row = [timestamp, data[1] || 'Pengeluaran', data[2] || 'Lainnya', parseAmount(data[3]), description,
        data[5] || '', data[6] || '', data[7] || createId('TRX'), data[8] || scope, 'active', timestamp, data[11] || 'whatsapp'];
    const response = await appendRows('Sheet1', [row]);
    const updatedRange = response?.data?.updates?.updatedRange || '';
    const rowNumber = Number(updatedRange.match(/![A-Z]+(\d+):/)?.[1] || updatedRange.match(/![A-Z]+(\d+)$/)?.[1] || 0);
    return { rowNumber, transactionId: row[7], response };
}

async function savePairingToSheet(waNumber, workspaceId, partner, status = 'paired', security = {}) {
    await appendRows('Pairing', [[
        waNumber,
        workspaceId,
        partner,
        status,
        new Date().toISOString(),
        security.codeHash || '',
        security.expiresAt || '',
    ]]);
    return true;
}

function toStringCell(value) {
    return { userEnteredValue: { stringValue: String(value ?? '') } };
}

async function completePairingToSheet(waNumber, partner, householdId, oldWorkspaceIds = []) {
    if (!waNumber || !partner || !householdId) throw new Error('Data pairing tidak lengkap');

    const personalIds = new Set(
        oldWorkspaceIds
            .map((value) => String(value || '').trim().toLowerCase())
            .filter((value) => value && value !== householdId.toLowerCase())
    );
    const [transactions, sheets] = await Promise.all([
        readRows('Sheet1', 'L'),
        getSheetsClient(),
    ]);
    const metadata = await sheets.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        fields: 'sheets.properties(sheetId,title)',
    });
    const sheetIds = Object.fromEntries(
        (metadata.data.sheets || []).map((sheet) => [sheet.properties.title, sheet.properties.sheetId])
    );
    if (sheetIds.Pairing === undefined || sheetIds.Sheet1 === undefined) {
        throw new Error('Tab Pairing atau Sheet1 tidak ditemukan');
    }

    const pairedAt = new Date().toISOString();
    const pairingRows = [
        [waNumber, householdId, partner, 'paired', pairedAt, '', ''],
        [partner, householdId, waNumber, 'paired', pairedAt, '', ''],
    ];
    const requests = [{
        appendCells: {
            sheetId: sheetIds.Pairing,
            rows: pairingRows.map((row) => ({ values: row.map(toStringCell) })),
            fields: 'userEnteredValue',
        },
    }];

    let migratedTransactions = 0;
    transactions.slice(1).forEach((row, index) => {
        if (!personalIds.has(String(row[6] || '').trim().toLowerCase())) return;
        requests.push({
            updateCells: {
                range: {
                    sheetId: sheetIds.Sheet1,
                    startRowIndex: index + 1,
                    endRowIndex: index + 2,
                    startColumnIndex: 6,
                    endColumnIndex: 7,
                },
                rows: [{ values: [toStringCell(householdId)] }],
                fields: 'userEnteredValue',
            },
        });
        migratedTransactions += 1;
    });

    // Satu batchUpdate membuat pencatatan pasangan dan migrasi transaksi lama
    // berhasil bersama-sama atau seluruhnya ditolak oleh Google Sheets.
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        resource: { requests },
    });
    return { householdId, migratedTransactions };
}

async function migrateHouseholdId(oldWorkspaceId, newWorkspaceId) {
    if (!oldWorkspaceId || !newWorkspaceId || oldWorkspaceId === newWorkspaceId) return { updated: 0 };
    const rows = await readRows('Sheet1', 'L');
    const updates = [];
    rows.slice(1).forEach((row, index) => {
        if (String(row[6] || '').toLowerCase() === String(oldWorkspaceId).toLowerCase()) {
            updates.push({ range: `${quoteSheet('Sheet1')}!G${index + 2}`, values: [[newWorkspaceId]] });
        }
    });
    if (!updates.length) return { updated: 0 };
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: config.spreadsheetId, resource: { valueInputOption: 'RAW', data: updates } });
    return { updated: updates.length };
}

async function updateTransactionFields(rowNumber, fields) {
    const selectedRow = Number(rowNumber);
    if (!Number.isInteger(selectedRow) || selectedRow < 2) return false;
    const mapping = { timestamp: 'A', type: 'B', category: 'C', amount: 'D', raw_message: 'E', scope: 'I', status: 'J' };
    const data = Object.entries(fields).filter(([key]) => mapping[key])
        .map(([key, value]) => ({ range: `${quoteSheet('Sheet1')}!${mapping[key]}${selectedRow}`, values: [[value]] }));
    data.push({ range: `${quoteSheet('Sheet1')}!K${selectedRow}`, values: [[new Date().toISOString()]] });
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: config.spreadsheetId, resource: { valueInputOption: 'RAW', data } });
    return true;
}

async function clearTransactionRow(rowNumber) {
    return updateTransactionFields(rowNumber, { status: 'deleted' });
}

function mapTransaction(row, rowNumber) {
    if (!row[0]) return null;
    const description = row[4] || '';
    return {
        id: row[7] || `legacy-${rowNumber}`, rowNumber, timestamp: row[0], type: row[1] || 'Pengeluaran',
        category: row[2] || 'Lainnya', amount: parseAmount(row[3]), description, reporter: row[5] || '',
        workspaceId: row[6] || '', scope: row[8] || (/\(pribadi\)|pos pribadi/i.test(description) ? 'personal' : 'shared'),
        status: row[9] || 'active', updatedAt: row[10] || row[0], source: row[11] || 'whatsapp',
    };
}

async function getAllTransactions() {
    const rows = await readRows('Sheet1', 'L');
    return rows.slice(1).map((row, index) => mapTransaction(row, index + 2)).filter(Boolean);
}

function protectPrivateTransaction(transaction, viewerPhone) {
    const isOwner = isSameIdentity(transaction.reporter, viewerPhone);
    if (transaction.scope !== 'personal' || isOwner) return { ...transaction, isLocked: false, canEdit: isOwner };
    return { ...transaction, category: 'Pribadi', description: 'Terkunci', isLocked: true, canEdit: false };
}

async function listTransactions({ workspaceId, viewerPhone, month, limit } = {}) {
    const selectedMonth = isValidMonth(month) ? month : null;
    const max = Number(limit) > 0 ? Math.min(Number(limit), 500) : 500;
    return (await getAllTransactions()).filter((item) => item.status !== 'deleted')
        .filter((item) => !workspaceId || item.workspaceId.toLowerCase() === workspaceId.toLowerCase())
        .filter((item) => !selectedMonth || String(item.timestamp).slice(0, 7) === selectedMonth)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, max)
        .map((item) => protectPrivateTransaction(item, viewerPhone));
}

async function findTransactionById(id) {
    return (await getAllTransactions()).find((item) => item.id === id) || null;
}

async function createTransaction({ workspaceId, reporter, type, category, amount, description, scope, timestamp }) {
    const selectedType = type === 'Pemasukan' ? 'Pemasukan' : 'Pengeluaran';
    const selectedScope = scope === 'personal' ? 'personal' : 'shared';
    const value = parseAmount(amount);
    if (value <= 0) throw new Error('Nominal harus lebih dari 0');
    const parsedTimestamp = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(parsedTimestamp.getTime())) throw new Error('Tanggal transaksi tidak valid');
    const result = await appendToSheet([parsedTimestamp.toISOString(), selectedType, String(category || 'Lainnya').slice(0, 80),
        value, String(description || '').slice(0, 500), reporter, workspaceId, createId('TRX'), selectedScope, '', '', 'web']);
    return findTransactionById(result.transactionId);
}

async function updateTransactionById(id, viewerPhone, fields) {
    const transaction = await findTransactionById(id);
    if (!transaction || transaction.status === 'deleted') return null;
    if (!isSameIdentity(transaction.reporter, viewerPhone)) {
        const error = new Error('Anda hanya dapat mengubah transaksi milik sendiri.'); error.statusCode = 403; throw error;
    }
    const updates = {};
    if (fields.type) updates.type = fields.type === 'Pemasukan' ? 'Pemasukan' : 'Pengeluaran';
    if (fields.category) updates.category = String(fields.category).slice(0, 80);
    if (fields.amount !== undefined) { const value = parseAmount(fields.amount); if (value <= 0) throw new Error('Nominal harus lebih dari 0'); updates.amount = value; }
    if (fields.description !== undefined) updates.raw_message = String(fields.description).slice(0, 500);
    if (fields.scope) updates.scope = fields.scope === 'personal' ? 'personal' : 'shared';
    if (fields.timestamp) {
        const parsedTimestamp = new Date(fields.timestamp);
        if (Number.isNaN(parsedTimestamp.getTime())) throw new Error('Tanggal transaksi tidak valid');
        updates.timestamp = parsedTimestamp.toISOString();
    }
    await updateTransactionFields(transaction.rowNumber, updates);
    return findTransactionById(id);
}

async function deleteTransactionById(id, viewerPhone) {
    const transaction = await findTransactionById(id);
    if (!transaction || transaction.status === 'deleted') return false;
    if (!isSameIdentity(transaction.reporter, viewerPhone)) {
        const error = new Error('Anda hanya dapat menghapus transaksi milik sendiri.'); error.statusCode = 403; throw error;
    }
    await clearTransactionRow(transaction.rowNumber);
    return true;
}

async function getPairings() {
    const rows = await readRows('Pairing', 'G');
    return rows.slice(1).filter((row) => row[0]).map((row) => ({
        wa_number: row[0] || '',
        household_id: row[1] || '',
        partner: row[2] || '',
        status: row[3] || '',
        paired_at: row[4] || '',
        code_hash: row[5] || '',
        expires_at: row[6] || '',
    }));
}

async function ensureUserContext(whatsappNumber, preferredWorkspaceId) {
    const phone = normalizePhone(whatsappNumber);
    if (!phone) throw new Error('Nomor WhatsApp tidak valid');
    const userId = stableUserId(phone);
    const pairings = await getPairings();
    const pairing = [...pairings].reverse().find((item) => item.status === 'paired' && [item.wa_number, item.partner].some((value) => normalizePhone(value) === phone));
    const workspaceId = preferredWorkspaceId || pairing?.household_id || `DEFAULT-${phone}`;
    const now = new Date().toISOString();
    const users = await readRows('Users', 'J');
    let userRow = users.slice(1).find((row) => normalizePhone(row[1]) === phone);
    if (!userRow) { userRow = [userId, phone, `Pengguna ${phone.slice(-4)}`, '', '', '', 'active', now, now, '']; await appendRows('Users', [userRow]); }
    const workspaces = await readRows('Workspaces', 'I');
    let workspaceRow = workspaces.slice(1).find((row) => row[0] === workspaceId);
    if (!workspaceRow) { workspaceRow = [workspaceId, pairing ? 'Keuangan Bersama' : 'Keuangan Pribadi', pairing ? 'shared' : 'personal', userId, 'IDR', 'monthly', 'true', now, now]; await appendRows('Workspaces', [workspaceRow]); }
    const members = await readRows('Members', 'F');
    if (!members.slice(1).some((row) => row[1] === workspaceId && row[2] === userId)) {
        await appendRows('Members', [[createId('MEM'), workspaceId, userId, workspaceRow[3] === userId ? 'owner' : 'member', 'active', now]]);
    }
    return { phone, userId, workspaceId, displayName: userRow[2] || `Pengguna ${phone.slice(-4)}`, workspaceName: workspaceRow[1] || 'Klop Money', workspaceType: workspaceRow[2] || 'personal' };
}

async function getBudgetSummary(workspaceId, month, transactions) {
    const selectedMonth = isValidMonth(month) ? month : currentMonth();
    const rows = await readRows('Budgets', 'H');
    const saved = rows.slice(1).filter((row) => row[1] === workspaceId && row[2] === selectedMonth && (row[7] || 'active') !== 'inactive');
    const definitions = saved.length ? saved.map((row) => [row[3], parseAmount(row[4]), row[0]]) : DEFAULT_BUDGETS;
    const expenses = transactions.filter((item) => item.type === 'Pengeluaran');
    return definitions.map(([category, amount, id]) => {
        const spent = expenses.filter((item) => item.category === category).reduce((total, item) => total + item.amount, 0);
        return { id: id || null, category, amount, spent, percentage: amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0 };
    });
}

async function saveBudgets(workspaceId, month, budgets) {
    const selectedMonth = isValidMonth(month) ? month : currentMonth();
    const rows = await readRows('Budgets', 'H');
    const now = new Date().toISOString();
    const updates = []; const inserts = [];
    const selectedCategories = new Set(budgets.map((budget) => String(budget.category || '').trim()).filter(Boolean));
    rows.slice(1).forEach((row, index) => {
        if (row[1] === workspaceId && row[2] === selectedMonth && !selectedCategories.has(String(row[3] || '').trim()) && (row[7] || 'active') !== 'inactive') {
            updates.push({ range: `${quoteSheet('Budgets')}!G${index + 2}:H${index + 2}`, values: [[now, 'inactive']] });
        }
    });
    for (const budget of budgets) {
        const category = String(budget.category || '').trim().slice(0, 80); const amount = Math.max(0, parseAmount(budget.amount));
        if (!category) continue;
        const index = rows.slice(1).findIndex((row) => row[1] === workspaceId && row[2] === selectedMonth && row[3] === category);
        if (index >= 0) updates.push({ range: `${quoteSheet('Budgets')}!E${index + 2}:H${index + 2}`, values: [[amount, rows[index + 1][5] || now, now, 'active']] });
        else inserts.push([createId('BGT'), workspaceId, selectedMonth, category, amount, now, now, 'active']);
    }
    if (updates.length) { const sheets = await getSheetsClient(); await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: config.spreadsheetId, resource: { valueInputOption: 'RAW', data: updates } }); }
    if (inserts.length) await appendRows('Budgets', inserts);
    return true;
}

async function getAllowedCategories(workspaceId) {
    const rows = await readRows('Budgets', 'H');
    const custom = rows.slice(1)
        .filter((row) => row[1] === workspaceId && (row[7] || 'active') !== 'inactive')
        .map((row) => String(row[3] || '').trim())
        .filter(Boolean);
    return [...new Set([...DEFAULT_CATEGORIES, ...custom])];
}

async function getDashboard(workspaceId, viewerPhone, month) {
    const selectedMonth = isValidMonth(month) ? month : currentMonth();
    const transactions = await listTransactions({ workspaceId, viewerPhone, month: selectedMonth, limit: 500 });
    const income = transactions.filter((item) => item.type === 'Pemasukan').reduce((sum, item) => sum + item.amount, 0);
    const expense = transactions.filter((item) => item.type === 'Pengeluaran').reduce((sum, item) => sum + item.amount, 0);
    const daysInMonth = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
    const budgets = await getBudgetSummary(workspaceId, selectedMonth, transactions);
    const userRows = await readRows('Users', 'J');
    const userProfiles = new Map(userRows.slice(1).map((row) => [normalizePhone(row[1]), { displayName: row[2] || '', avatarDataUrl: row[9] || '' }]));
    const contributions = Object.values(transactions.reduce((groups, item) => {
        const key = canonicalPhone(item.reporter) || item.reporter || 'unknown';
        const profile = userProfiles.get(key);
        if (!groups[key]) groups[key] = { reporter: key, name: profile?.displayName || `Pengguna ${key.slice(-4)}`, avatarDataUrl: profile?.avatarDataUrl || '', count: 0, income: 0, expense: 0 };
        groups[key].count += 1; if (item.type === 'Pemasukan') groups[key].income += item.amount; else groups[key].expense += item.amount; return groups;
    }, {}));
    return { month: selectedMonth, summary: { income, expense, balance: income - expense, transactionCount: transactions.length, averageDailyExpense: Math.round(expense / daysInMonth) }, budgets, contributions, recentTransactions: transactions.slice(0, 5) };
}

async function getProfile(whatsappNumber, preferredWorkspaceId) {
    const context = await ensureUserContext(whatsappNumber, preferredWorkspaceId);
    const users = await readRows('Users', 'J'); const row = users.slice(1).find((item) => item[0] === context.userId) || [];
    const pairings = await getPairings(); const pairing = [...pairings].reverse().find((item) => item.household_id === context.workspaceId && item.status === 'paired');
    const partnerPhone = pairing ? [pairing.wa_number, pairing.partner].map(normalizePhone).find((phone) => phone && phone !== context.phone) : '';
    const partnerRow = partnerPhone ? users.slice(1).find((item) => normalizePhone(item[1]) === partnerPhone) : null;
    const workspaces = await readRows('Workspaces', 'I');
    const workspace = workspaces.slice(1).find((item) => item[0] === context.workspaceId) || [];
    return { ...context, email: row[3] || '', birthDate: row[4] || '', city: row[5] || '', avatarDataUrl: row[9] || '',
        currency: workspace[4] || 'IDR', reportPeriod: workspace[5] || 'monthly', remindersEnabled: String(workspace[6] ?? 'true') !== 'false',
        partner: partnerPhone ? { name: partnerRow?.[2] || `Pengguna ${partnerPhone.slice(-4)}`, phoneMasked: `•••• ${partnerPhone.slice(-4)}`, avatarDataUrl: partnerRow?.[9] || '' } : null };
}

async function updateProfile(whatsappNumber, fields, preferredWorkspaceId) {
    if (['phone', 'whatsappNumber', 'wa_number'].some((field) => Object.prototype.hasOwnProperty.call(fields || {}, field))) {
        const error = new Error('Nomor WhatsApp tidak dapat diubah melalui profil pengguna.');
        error.statusCode = 403;
        throw error;
    }
    const context = await ensureUserContext(whatsappNumber, preferredWorkspaceId);
    const rows = await readRows('Users', 'J'); const index = rows.slice(1).findIndex((row) => row[0] === context.userId);
    if (index < 0) throw new Error('Profil pengguna tidak ditemukan');
    const current = rows[index + 1]; const displayName = String(fields.displayName ?? current[2] ?? '').trim().slice(0, 80);
    const email = String(fields.email ?? current[3] ?? '').trim().slice(0, 120); const birthDate = String(fields.birthDate ?? current[4] ?? '').trim().slice(0, 20); const city = String(fields.city ?? current[5] ?? '').trim().slice(0, 80);
    const avatarDataUrl = fields.avatarDataUrl === undefined ? String(current[9] || '') : String(fields.avatarDataUrl || '');
    if (!displayName) throw new Error('Nama tidak boleh kosong');
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({ spreadsheetId: config.spreadsheetId, range: `${quoteSheet('Users')}!C${index + 2}:J${index + 2}`, valueInputOption: 'RAW',
        resource: { values: [[displayName, email, birthDate, city, current[6] || 'active', current[7] || new Date().toISOString(), new Date().toISOString(), avatarDataUrl]] } });

    const workspaceRows = await readRows('Workspaces', 'I');
    const workspaceIndex = workspaceRows.slice(1).findIndex((row) => row[0] === context.workspaceId);
    if (workspaceIndex >= 0 && (fields.currency !== undefined || fields.reportPeriod !== undefined || fields.remindersEnabled !== undefined)) {
        const workspace = workspaceRows[workspaceIndex + 1];
        const currency = fields.currency === 'IDR' ? 'IDR' : (workspace[4] || 'IDR');
        const reportPeriod = ['weekly', 'monthly'].includes(fields.reportPeriod) ? fields.reportPeriod : (workspace[5] || 'monthly');
        const remindersEnabled = fields.remindersEnabled === undefined ? String(workspace[6] ?? 'true') : String(Boolean(fields.remindersEnabled));
        await sheets.spreadsheets.values.update({ spreadsheetId: config.spreadsheetId, range: `${quoteSheet('Workspaces')}!E${workspaceIndex + 2}:I${workspaceIndex + 2}`, valueInputOption: 'RAW',
            resource: { values: [[currency, reportPeriod, remindersEnabled, workspace[7] || new Date().toISOString(), new Date().toISOString()]] } });
    }
    return getProfile(whatsappNumber, preferredWorkspaceId);
}

async function getRawTransactionData(workspaceId) {
    const rows = await readRows('Sheet1', 'L');
    if (!workspaceId) return rows;
    return [rows[0] || SHEET_SCHEMAS.Sheet1, ...rows.slice(1).filter((row) => String(row[6] || '').toLowerCase() === workspaceId.toLowerCase() && (row[9] || 'active') !== 'deleted')];
}

module.exports = { SHEET_SCHEMAS, ensureDatabaseSchema, appendToSheet, savePairingToSheet, completePairingToSheet, migrateHouseholdId, updateTransactionFields,
    clearTransactionRow, getRawTransactionData, getPairings, ensureUserContext, listTransactions, findTransactionById, createTransaction,
    updateTransactionById, deleteTransactionById, getDashboard, getBudgetSummary, saveBudgets, getAllowedCategories, getProfile, updateProfile };
