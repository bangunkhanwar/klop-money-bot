const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const crypto = require('crypto');
const { config } = require('../config');
const { createLoginCode } = require('../services/authService');
const { appendToSheet, savePairingToSheet, completePairingToSheet, updateTransactionFields, clearTransactionRow } = require('../services/googleSheetsService');
const { getReport, getFullReport, loadPairingFromSheet } = require('../services/googleSheetsQuery');

// ===============================================
// 1. KONFIGURASI WHITELIST & OWNER
// ===============================================
const WHITELIST_FILE = config.paths.whitelist;

// Nomor owner (sekaligus operator/admin) dalam format internasional TANPA "+" dan tanpa "0" di depan
// (mis. 082246891241 -> 6282246891241)
const OWNER_NUMBER = config.ownerNumber;

// Opsional: kalau WhatsApp mengirim pesan owner dalam bentuk LID (bukan nomor telepon,
// biasa terjadi karena fitur privasi WhatsApp), isi LID owner di sini supaya tetap
// dikenali sebagai owner. Kosongkan ('') kalau tidak dipakai.
const OWNER_LID = config.ownerLid;
const BOT_ACCOUNT_NUMBER = config.botAccountNumber;
const UNKNOWN_SENDER_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

function maskIdentifier(value) {
    const clean = getCleanNumber(String(value || ''));
    if (clean.length < 7) return '***';
    return `${clean.slice(0, 3)}${'*'.repeat(Math.min(clean.length - 6, 8))}${clean.slice(-3)}`;
}

function loadWhitelist() {
    try {
        if (fs.existsSync(WHITELIST_FILE)) {
            return JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('❌ Error load whitelist:', error);
        return {};
    }
}

function saveWhitelist(whitelist) {
    try {
        fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelist, null, 2));
        console.log('✅ Whitelist disimpan');
        return true;
    } catch (error) {
        console.error('❌ Error save whitelist:', error);
        return false;
    }
}

function getCleanNumber(number) {
    let clean = number.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = `62${clean.substring(1)}`;
    return clean;
}

function getRegistrationIdentifier(value) {
    const rawIdentifier = String(value || '').trim().split('@')[0].replace(/[^0-9]/g, '');
    if (/^08\d{7,12}$/.test(rawIdentifier)) return `62${rawIdentifier.substring(1)}`;
    if (/^\d{8,20}$/.test(rawIdentifier)) return rawIdentifier;
    return '';
}

// Owner dikenali lewat nomor telepon ATAU LID (kalau dikonfigurasi).
// Owner HANYA boleh menjalankan perintah admin (/add, /remove, /list) —
// tidak pernah ikut alur laporan/pairing/transaksi.
function isOwner(sender) {
    const cleanNumber = getCleanNumber(sender);
    if (cleanNumber === OWNER_NUMBER) return true;
    if (OWNER_LID && cleanNumber === OWNER_LID) return true;
    return getWhitelistEntry(sender)?.data?.role === 'owner';
}

function isActiveWhitelistEntry(entry) {
    return Boolean(entry && !['inactive', 'blocked'].includes(entry.status));
}

function isBlockedSender(sender) {
    if (isWhitelisted(sender)) return false;
    const status = getWhitelistEntry(sender)?.data?.status;
    return ['inactive', 'blocked'].includes(status);
}

function getCanonicalWhitelistKey(number, whitelist) {
    const cleanNumber = getCleanNumber(number);
    const direct = whitelist[cleanNumber];
    if (direct?.phone && whitelist[getCleanNumber(direct.phone)]) return getCleanNumber(direct.phone);
    for (const [key, entry] of Object.entries(whitelist)) {
        if (entry?.lid === cleanNumber && /^62\d{8,13}$/.test(key)) return key;
    }
    return cleanNumber;
}

function isWhitelisted(number) {
    const cleanNumber = getCleanNumber(number);
    const whitelist = loadWhitelist();
    if (isActiveWhitelistEntry(whitelist[cleanNumber])) return true;
    const lid = number.split('@')[0];
    if (isActiveWhitelistEntry(whitelist[lid])) return true;
    for (const key in whitelist) {
        if (isActiveWhitelistEntry(whitelist[key]) && whitelist[key].lid && whitelist[key].lid === lid) return true;
    }
    return false;
}

async function resolveKnownLid(message) {
    const sender = String(message.from || '');
    if (!sender.endsWith('@lid') || isWhitelisted(sender)) return;

    try {
        let phone = '';
        if (typeof client.getContactLidAndPhone === 'function') {
            try {
                const [mapping] = await client.getContactLidAndPhone([sender]);
                phone = getCleanNumber(mapping?.pn || '');
            } catch (mappingError) {
                console.warn(`Pemetaan LID resmi belum tersedia: ${mappingError.message}`);
            }
        }
        if (!phone) {
            const contact = await message.getContact();
            phone = getCleanNumber(contact?.number || '');
        }
        if (!phone) return;

        const whitelist = loadWhitelist();
        if (!isActiveWhitelistEntry(whitelist[phone])) return;
        whitelist[phone].lid = sender.split('@')[0];
        whitelist[phone].identity_verified_at = new Date().toISOString();
        saveWhitelist(whitelist);
        console.log(`✅ LID dipetakan ke pengguna terdaftar ${maskIdentifier(phone)}`);
    } catch (error) {
        console.error(`Gagal memetakan LID pengguna: ${error.message}`);
    }
}

function addToWhitelist(number, addedBy, label = '', onboarding = 'done') {
    const cleanNumber = getCleanNumber(number);
    const whitelist = loadWhitelist();
    const existing = whitelist[cleanNumber] || {};
    whitelist[cleanNumber] = {
        ...existing,
        added_by: addedBy,
        added_at: existing.added_at || new Date().toISOString(),
        label: label || cleanNumber,
        onboarding, // 'pending_consent' untuk user baru dari /add, 'done' untuk yang lain (mis. join via kode pairing)
        status: 'active'
    };
    for (const entry of Object.values(whitelist)) {
        if ((existing.lid && entry?.lid === existing.lid) || getCleanNumber(entry?.phone || '') === cleanNumber) {
            entry.status = 'active';
        }
    }
    return saveWhitelist(whitelist);
}

// ===============================================
// 1b. ONBOARDING (khusus user yang baru ditambahkan admin lewat /add)
//     Catatan: alur ini BEDA dengan user yang join lewat kode pairing —
//     itu akan dibuatkan alurnya sendiri secara terpisah.
// ===============================================
const TERMS_URL = config.termsUrl;

const ONBOARDING_WELCOME_TEXT =
`Selamat datang di Klop Money.

Ini asisten keuangan yang membantu kamu dan pasangan mencatat pengeluaran bersama lewat chat WhatsApp. Cukup kirim pesan seperti biasa, nanti asisten ini yang catat dan kabari pasanganmu.

Yang perlu kamu tahu:
- Detail pos pribadi bisa disembunyikan dari pasangan
- Data kamu tidak dijual atau disalahgunakan
- Kamu bisa berhenti kapan saja

Baca dulu ketentuan lengkapnya di sini:
${TERMS_URL}

Kalau sudah baca dan setuju, balas:
SETUJU

Setelah itu kita lanjut ke cara pakai dan proses menyambungkan akun kalian.`;

const ONBOARDING_STEP2_TEXT =
`Cara pakainya:

1. Kamu dan pasangan chat ke asisten ini masing-masing
2. Sambungkan akun kalian berdua
3. Setelah tersambung, catat pengeluaran lewat chat biasa

Contoh:
- "Beli kopi 28rb"
- "Bayar listrik 350.000"
- "Makan siang 85rb (pribadi)"

Asisten ini otomatis baca nominal dan kategorinya. Kalau pesan kurang jelas, akan ditanya dulu.

Catatan:
- Tulis (pribadi) kalau mau detailnya disembunyikan dari pasangan
- Tanpa tulisan itu, otomatis dianggap pos bersama dan pasangan dapat notifikasi

Siap sambungkan akun kamu dengan pasangan sekarang?`;

const ONBOARDING_NUDGE_SIAP_TEXT = 'Siap sambungkan akun kamu dengan pasangan sekarang? Balas SIAP kalau sudah siap.';

const JOIN_VIA_CODE_WELCOME_TEXT =
`Selamat datang di Klop Money.

Kode sambungmu valid dan akunmu berhasil dihubungkan dengan pasangan. Sekarang kalian berada dalam satu household keuangan bersama.

Household ID: {{HOUSEHOLD_ID}}

Data transaksi yang sebelumnya sudah dicatat pasanganmu telah digabungkan ke household ini. Setelah kamu menyetujui ketentuan, transaksi baru dari kalian berdua juga akan masuk ke dataset bersama yang sama.

Cara mencatat, tinggal chat biasa seperti:
- "Beli kopi 28rb"
- "Bayar listrik 350.000"
- "Makan siang 85rb (pribadi)"

Catatan:
- Tulis (pribadi) kalau mau detailnya disembunyikan dari pasangan
- Tanpa tulisan itu, dianggap pos bersama dan pasangan ikut dapat notifikasi

Privasi tetap dijaga. Detail transaksi pribadi hanya dapat dilihat oleh pemilik transaksi, sedangkan transaksi bersama dapat dilihat oleh kalian berdua.

Baca ketentuan privasi dan penggunaan data di sini:
${TERMS_URL}

Kalau sudah membaca dan menyetujui ketentuan tersebut, balas:
SETUJU

Sebelum kamu membalas SETUJU, pesan lain tidak akan dicatat sebagai transaksi.`;

const JOIN_VIA_CODE_ACCEPTED_TEXT =
`Terima kasih, persetujuanmu sudah dicatat.

Akunmu sekarang aktif di household bersama pasangan. Mulai sekarang kamu bisa mencatat transaksi lewat chat biasa.

Contoh:
- "Beli kopi 28rb"
- "Bayar listrik 350.000"
- "Makan siang 85rb (pribadi)"

Ketik "rekap hari ini" untuk melihat laporan pertama kalian.`;

function buildJoinViaCodeWelcomeText(sender, knownHouseholdId = '') {
    const householdId = knownHouseholdId || findHouseholdBySender(sender)?.householdId || 'tersimpan';
    return JOIN_VIA_CODE_WELCOME_TEXT.replace('{{HOUSEHOLD_ID}}', householdId);
}

// ===============================================
// 2. INISIALISASI BOT
// ===============================================

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.paths.whatsappAuth, rmMaxRetries: 10 }),
    puppeteer: {
        headless: 'new',
        executablePath: config.chromeExecutablePath || undefined,
        args: [
            ...(config.whatsappDisableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920x1080'
        ],
        timeout: 120000
    }
});

let botState = 'starting';
let connectedBotNumber = '';
let botReadyAtSeconds = 0;

client.on('qr', (qr) => {
    botState = 'waiting_for_qr';
    console.log('📱 SCAN QR CODE INI DENGAN WHATSAPP:');
    console.log(`Akun yang diizinkan: ${maskIdentifier(BOT_ACCOUNT_NUMBER)}`);
    qrcode.generate(qr, { small: true });
});

// Struktur pairingData:
// - pairingData[KODE]        -> { wa_number, status: 'waiting'|'paired', household_id, created_at, partner? }
// - pairingData[`user_${wa}`] -> { wa_number, household_id, status: 'paired', partner }
const pairingData = {};
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const pairingAttemptsBySender = new Map();
const pairingCodesInProgress = new Set();

// Transaksi terakhir yang SUDAH tersimpan per sender -> dipakai fitur "edit"/"hapus"
const lastTransactionBySender = {};
const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 menit

// Transaksi yang BELUM tersimpan karena kurang jelas, nunggu user konfirmasi/ralat/batal
const pendingTransactionBySender = {};
const PENDING_CONFIRM_TTL_MS = 10 * 60 * 1000; // 10 menit

client.on('ready', async () => {
    connectedBotNumber = getCleanNumber(client.info?.wid?._serialized || client.info?.wid?.user || '');
    if (!connectedBotNumber || connectedBotNumber !== getCleanNumber(BOT_ACCOUNT_NUMBER)) {
        botState = 'account_mismatch';
        console.error(`❌ Akun WhatsApp tidak sesuai. Diharapkan ${maskIdentifier(BOT_ACCOUNT_NUMBER)}, terhubung ${maskIdentifier(connectedBotNumber)}.`);
        console.error('Sesi ditolak untuk mencegah bot mengambil alih akun yang salah.');
        try { await client.logout(); } catch (error) { console.error(`Gagal logout akun yang salah: ${error.message}`); }
        try { await client.destroy(); } catch {}
        return;
    }

    botState = 'ready';
    botReadyAtSeconds = Math.floor(Date.now() / 1000);
    console.log('✅ BOT KLOP MONEY SIAP!');
    try {
        const savedPairings = await loadPairingFromSheet();

        // Kumpulkan dulu semua nomor yang statusnya sudah 'paired' di sheet manapun —
        // dipakai sebagai pengaman supaya kode 'waiting' milik orang yang SUDAH selesai
        // tersambung tidak ikut "hidup lagi" saat di-reload (mencegah kode dipakai ulang).
        const alreadyPaired = new Set(
            savedPairings.filter(p => p.status === 'paired').map(p => p.wa_number)
        );

        let waitingCount = 0;
        savedPairings.forEach(pair => {
            if (pair.status === 'paired') {
                pairingData[`user_${pair.wa_number}`] = {
                    wa_number: pair.wa_number,
                    household_id: pair.household_id,
                    status: 'paired',
                    partner: pair.partner
                };
            } else if (pair.status === 'waiting' && pair.code_hash && !alreadyPaired.has(pair.wa_number)) {
                const expiresAt = new Date(pair.expires_at).getTime();
                if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
                    pairingData[`code_${pair.code_hash}`] = {
                        wa_number: pair.wa_number,
                        status: 'waiting',
                        household_id: null,
                        created_at: pair.paired_at,
                        expires_at: pair.expires_at
                    };
                    waitingCount++;
                }
            }
        });

        console.log(`📋 ${alreadyPaired.size} pasangan & ${waitingCount} kode sambung (belum dipakai) dimuat dari Google Sheets`);
    } catch (error) {
        console.error('❌ Error memuat pairing:', error.message);
    }
});

client.on('auth_failure', (message) => {
    botState = 'auth_failure';
    console.error(`❌ Autentikasi WhatsApp gagal: ${message}`);
});

client.on('disconnected', (reason) => {
    botState = 'disconnected';
    connectedBotNumber = '';
    botReadyAtSeconds = 0;
    console.error(`⚠️ WhatsApp terputus: ${reason}`);
});

function generatePairingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
        code += chars[crypto.randomInt(0, chars.length)];
    }
    return code;
}

function hashPairingCode(code) {
    return crypto.createHmac('sha256', config.sessionSecret).update(`pairing:${code}`).digest('hex');
}

function canAttemptPairing(sender) {
    const now = Date.now();
    const current = pairingAttemptsBySender.get(sender);
    if (!current || now - current.startedAt > PAIRING_CODE_TTL_MS) {
        pairingAttemptsBySender.set(sender, { count: 1, startedAt: now });
        return true;
    }
    current.count += 1;
    return current.count <= PAIRING_MAX_ATTEMPTS;
}

// Cari household milik sender (kalau sudah pairing), dari data di memori.
function findHouseholdBySender(sender) {
    const senderIdentities = new Set(getIdentityNumbers(sender));
    for (const key in pairingData) {
        const p = pairingData[key];
        const sameIdentity = getIdentityNumbers(p.wa_number).some((identifier) => senderIdentities.has(identifier));
        if (p.status === 'paired' && (sameIdentity || key === `user_${sender}`)) {
            return { householdId: p.household_id, partner: p.partner };
        }
    }
    return null;
}

// Coba proses teks sebagai kode pairing 8 karakter. Dipakai baik oleh user yang
// SUDAH terdaftar maupun BELUM terdaftar (khusus jalur "pasangan join pakai kode").
// Return true kalau kode tsb sudah ditangani (dan balasan sudah dikirim), false kalau
// bukan kode yang dikenal (biar alur lain yang menangani, mis. pesan "belum terdaftar").
async function tryJoinWithPairingCode(sender, code, message) {
    const pairingKey = `code_${hashPairingCode(code)}`;
    const pair = pairingData[pairingKey];
    if (!pair) return false; // bukan kode yang pernah dibuat, bukan urusan fungsi ini

    const senderIdentitySet = new Set(getIdentityNumbers(sender));
    const isOwnCode = getIdentityNumbers(pair.wa_number).some((identifier) => senderIdentitySet.has(identifier));
    if (isOwnCode) {
        await message.reply('Kamu tidak bisa pakai kode sambungmu sendiri.');
        return true;
    }

    if (!isWhitelisted(pair.wa_number)) {
        await message.reply('Pemilik kode ini sudah tidak memiliki akses aktif. Minta owner mendaftarkannya kembali sebelum membuat kode baru.');
        return true;
    }

    const senderHousehold = findHouseholdBySender(sender);
    if (senderHousehold) {
        await message.reply(`Akunmu sudah terhubung ke Household ID ${senderHousehold.householdId}. Satu akun hanya dapat terhubung dengan satu pasangan.`);
        return true;
    }

    const ownerHousehold = findHouseholdBySender(pair.wa_number);
    if (ownerHousehold) {
        await message.reply('Pemilik kode ini sudah terhubung dengan pasangan. Minta kode sambung baru dari akun yang belum berpasangan.');
        return true;
    }

    if (pair.status !== 'waiting') {
        await message.reply(`Kode ${code} sudah dipakai atau tidak berlaku lagi. Satu kode sambung hanya bisa dipakai sekali oleh satu pasangan.`);
        return true;
    }

    const expiresAt = new Date(pair.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        delete pairingData[pairingKey];
        await message.reply(`Kode ${code} sudah kedaluwarsa. Minta pasanganmu membuat kode baru.`);
        return true;
    }

    if (pairingCodesInProgress.has(pairingKey)) {
        await message.reply('Kode sambung ini sedang diproses. Tunggu beberapa detik, lalu periksa kembali status pasanganmu.');
        return true;
    }
    pairingCodesInProgress.add(pairingKey);

    try {
        // Kode valid -> tulis kedua pasangan dan migrasikan semua transaksi personal
        // (nomor utama maupun alias LID) dalam satu operasi atomik Google Sheets.
        const householdId = `HH-${crypto.randomUUID()}`;
        const personalWorkspaceIds = getPersonalWorkspaceIds(pair.wa_number, sender);
        const result = await completePairingToSheet(pair.wa_number, sender, householdId, personalWorkspaceIds);

        for (const candidate of Object.values(pairingData)) {
            if (candidate.wa_number === pair.wa_number && candidate.status === 'waiting') {
                candidate.status = 'paired';
                candidate.household_id = householdId;
                candidate.partner = sender;
            }
        }
        pairingData[`user_${pair.wa_number}`] = {
            wa_number: pair.wa_number,
            household_id: householdId,
            status: 'paired',
            partner: sender
        };
        pairingData[`user_${sender}`] = {
            wa_number: sender,
            household_id: householdId,
            status: 'paired',
            partner: pair.wa_number
        };
        pairingAttemptsBySender.delete(sender);

        // Kode pairing valid adalah undangan dari user yang sudah terdaftar. Pihak kedua
        // boleh masuk, tetapi fitur transaksi tetap terkunci sampai membalas SETUJU.
        const consentStateSaved = !isWhitelisted(sender)
            ? addToWhitelist(sender, `kode-sambung:${pair.wa_number}`, 'Pasangan (gabung via kode sambung)', 'pending_join_consent')
            : setOnboardingStatus(getWhitelistEntry(sender).key, 'pending_join_consent');
        if (!consentStateSaved) {
            console.error(`Pairing ${householdId} tersimpan, tetapi status persetujuan pasangan gagal disimpan.`);
            await message.reply('Akun kalian sudah tersambung, tetapi status persetujuan belum dapat disimpan. Jangan kirim transaksi dulu dan hubungi owner untuk pemeriksaan.');
            return true;
        }

        console.log(`✅ Pairing selesai: ${maskIdentifier(pair.wa_number)} + ${maskIdentifier(sender)}, ${result.migratedTransactions} transaksi dimigrasikan`);
        await message.reply(buildJoinViaCodeWelcomeText(sender, householdId));

        return true;
    } finally {
        pairingCodesInProgress.delete(pairingKey);
    }
}

// Cari entri whitelist milik sender (by nomor bersih ATAU lid), sekalian tahu key-nya
// supaya bisa update field onboarding-nya.
function getWhitelistEntry(sender) {
    const cleanNumber = getCleanNumber(sender);
    const whitelist = loadWhitelist();
    if (whitelist[cleanNumber]) return { key: cleanNumber, data: whitelist[cleanNumber] };
    const lid = sender.split('@')[0];
    if (whitelist[lid]) return { key: lid, data: whitelist[lid] };
    for (const key in whitelist) {
        if (whitelist[key].lid && whitelist[key].lid === lid) return { key, data: whitelist[key] };
    }
    return null;
}

function getIdentityNumbers(sender) {
    const identifiers = new Set();
    const addIdentifier = (value) => {
        const clean = getCleanNumber(String(value || ''));
        if (/^\d{8,20}$/.test(clean)) identifiers.add(clean);
    };
    addIdentifier(sender);
    const entry = getWhitelistEntry(sender);
    addIdentifier(entry?.key);
    addIdentifier(entry?.data?.phone);
    addIdentifier(entry?.data?.lid);
    return [...identifiers];
}

function getPersonalWorkspaceIds(...senders) {
    return [...new Set(senders.flatMap(getIdentityNumbers).map((identifier) => `DEFAULT-${identifier}`))];
}

function getLoginPhoneForSender(sender) {
    const entry = getWhitelistEntry(sender);
    const configuredPhone = entry?.data?.phone || entry?.key;
    if (/^62\d{8,13}$/.test(String(configuredPhone || ''))) return String(configuredPhone);
    return getCleanNumber(sender);
}

function setOnboardingStatus(entryKey, status) {
    const whitelist = loadWhitelist();
    if (whitelist[entryKey]) {
        whitelist[entryKey].onboarding = status;
        return saveWhitelist(whitelist);
    }
    return false;
}

// Generate kode pairing baru untuk sender dan kirimkan. Dipakai baik oleh perintah
// manual ("pasangkan saya") maupun alur onboarding setelah user balas SIAP.
async function generateAndSendPairingCode(sender, message) {
    const existing = findHouseholdBySender(sender);
    if (existing) {
        await message.reply(
            `Kamu sudah terhubung dengan pasangan (Household ID: ${existing.householdId}).\n\n` +
            `Satu kode sambung hanya untuk dua orang, jadi tidak perlu bikin kode baru lagi.`
        );
        return;
    }

    const code = generatePairingCode();
    const codeHash = hashPairingCode(code);
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    pairingData[`code_${codeHash}`] = {
        wa_number: sender,
        status: 'waiting',
        household_id: null,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
    };

    // Simpan juga ke Google Sheets (bukan cuma di memory), supaya kode ini tidak hilang
    // kalau asisten kebetulan restart sebelum sempat dipakai pasangannya.
    await savePairingToSheet(sender, '', '', 'waiting', { codeHash, expiresAt });

    await message.reply(
        `Ini kode sambungmu:\n\n` +
        `*${code}*\n\n` +
        `Kirim kode ini hanya ke pasanganmu. Kode berlaku 10 menit dan hanya dapat dipakai sekali.`
    );
}

// Menangani alur onboarding (khusus user yang ditambahkan admin lewat /add).
// Return true kalau pesan ini "diserap" oleh alur onboarding (jangan diproses lebih lanjut).
async function handleOnboarding(sender, text, message) {
    const entry = getWhitelistEntry(sender);
    if (!entry) return false; // safety net, seharusnya tidak terjadi (caller sudah cek whitelist)

    // User lama (ditambahkan sebelum fitur onboarding ini ada) tidak punya field `onboarding`
    // sama sekali -> anggap 'done' supaya mereka tidak tiba-tiba diminta onboarding ulang.
    const status = entry.data.onboarding || 'done';

    if (status === 'pending_join_consent') {
        if (text.trim().toUpperCase() === 'SETUJU') {
            setOnboardingStatus(entry.key, 'done');
            await message.reply(JOIN_VIA_CODE_ACCEPTED_TEXT);
        } else {
            await message.reply(buildJoinViaCodeWelcomeText(sender));
        }
        return true;
    }

    if (status === 'pending_consent') {
        if (text.trim().toUpperCase() === 'SETUJU') {
            setOnboardingStatus(entry.key, 'pending_pairing_ready');
            await message.reply(ONBOARDING_STEP2_TEXT);
        } else {
            await message.reply(ONBOARDING_WELCOME_TEXT);
        }
        return true;
    }

    if (status === 'pending_pairing_ready') {
        if (text.trim().toUpperCase() === 'SIAP') {
            setOnboardingStatus(entry.key, 'done');
            await generateAndSendPairingCode(sender, message);
        } else {
            await message.reply(ONBOARDING_NUDGE_SIAP_TEXT);
        }
        return true;
    }

    return false; // status 'done' -> lanjut ke fitur normal
}

// Cari SEMUA angka nominal yang mungkin di teks (bukan cuma yang pertama), supaya kita bisa
// deteksi kalau ada lebih dari satu angka berbeda -> berarti pesannya ambigu, bukan asal tebak.
function findAmountMatches(text) {
    const regex = /(\d+)(?:\.|,)?(\d{3})?\s*(rb|ribu|k|jt|juta)?/gi;
    const matches = [];
    let m;
    while ((m = regex.exec(text)) !== null) {
        let amount = parseInt(m[1]);
        if (m[2]) amount = parseInt(m[1] + m[2]);
        if (m[3] && /jt|juta/i.test(m[3])) amount *= 1000000;
        else if (m[3] && /rb|ribu|k/i.test(m[3])) amount *= 1000;
        if (!isNaN(amount)) matches.push({ amount, text: m[0].trim() });
        if (m.index === regex.lastIndex) regex.lastIndex++; // jaga-jaga hindari infinite loop
    }
    return matches;
}

// Parsing inti teks transaksi. Dipakai baik untuk transaksi baru maupun untuk fitur "edit".
// Return null kalau tidak ada angka sama sekali (berarti bukan transaksi).
function parseTransactionText(text) {
    const allMatches = findAmountMatches(text);
    if (allMatches.length === 0) return null;

    const isIncome = /masuk|income|gaji|bonus|transfer|dapat|terima|pemasukan/i.test(text);
    const transactionType = isIncome ? 'Pemasukan' : 'Pengeluaran';
    const amount = allMatches[0].amount; // kandidat utama = angka pertama (perilaku lama)

    let cleanText = text.replace(/\d+(?:\.|,)?\d*\s*(rb|ribu|k|jt|juta)?/gi, '')
        .replace(/[.,]/g, '').trim().toLowerCase();
    cleanText = cleanText.replace(/masuk|income|gaji|bonus|transfer|dapat|terima|pemasukan/g, '').trim();

    let category = null; // null = tidak ketemu keyword kategori apapun
    for (const [keyword, mappedCategory] of Object.entries(categoryMap)) {
        if (cleanText.includes(keyword)) {
            category = mappedCategory;
            break;
        }
    }

    return { amount, transactionType, category, isIncomeDetected: isIncome, allMatches };
}

// Cek alasan-alasan kenapa sebuah transaksi dianggap "kurang jelas".
// Return array kosong kalau sudah cukup jelas untuk langsung dicatat.
function checkAmbiguity(parsed, rawText) {
    const reasons = [];

    const distinctAmounts = [...new Set(parsed.allMatches.map(m => m.amount))];
    if (distinctAmounts.length > 1) reasons.push('nominal');

    const hasIncomeSignal = /masuk|income|gaji|bonus|transfer|dapat|terima|pemasukan/i.test(rawText);
    const hasExpenseSignal = /beli|bayar|belanja|keluar|pengeluaran/i.test(rawText);
    if (hasIncomeSignal && hasExpenseSignal) reasons.push('jenis');

    if (parsed.category === null) reasons.push('kategori');

    return reasons;
}

// Simpan transaksi yang sudah pasti (baik langsung jelas, maupun sudah dikonfirmasi user)
// ke Google Sheets, dan catat sebagai "transaksi terakhir" supaya bisa di-edit/hapus nanti.
async function recordTransaction(sender, message, transactionType, category, amount, rawText) {
    const household = findHouseholdBySender(sender);
    let householdId = household ? household.householdId : null;

    if (!householdId) {
        householdId = `DEFAULT-${getCleanNumber(sender)}`;
        await message.reply(`Kamu belum terhubung dengan pasangan. Kirim "pasangkan saya" untuk mulai menyambungkan akun.\n\nTransaksi ini tetap dicatat untuk kamu sendiri dulu. Nanti kalau sudah tersambung, catatan lama otomatis digabung ke akun bersama kalian.`);
    }

    const timestamp = new Date().toISOString();
    const { rowNumber } = await appendToSheet([timestamp, transactionType, category, amount, rawText, getLoginPhoneForSender(sender), householdId]);

    lastTransactionBySender[sender] = {
        rowNumber,
        amount,
        category,
        transactionType,
        rawText,
        householdId,
        timestamp: Date.now()
    };

    await message.reply(`Tercatat. ${transactionType} Rp${amount.toLocaleString()} untuk ${category}.`);
}

const categoryMap = {
    // --- Makanan & Minuman ---
    'makan': 'Makanan & Minuman', 'ayam': 'Makanan & Minuman', 'nasi': 'Makanan & Minuman',
    'bakso': 'Makanan & Minuman', 'mie': 'Makanan & Minuman', 'sushi': 'Makanan & Minuman',
    'pizza': 'Makanan & Minuman', 'burger': 'Makanan & Minuman', 'goreng': 'Makanan & Minuman',
    'resto': 'Makanan & Minuman', 'restoran': 'Makanan & Minuman', 'warung': 'Makanan & Minuman',
    'cafe': 'Makanan & Minuman', 'kopi': 'Makanan & Minuman', 'jajan': 'Makanan & Minuman',
    'boba': 'Makanan & Minuman', 'minuman': 'Makanan & Minuman',

    // --- Transportasi ---
    'transport': 'Transportasi', 'gojek': 'Transportasi', 'grab': 'Transportasi',
    'ojol': 'Transportasi', 'taxi': 'Transportasi', 'taksi': 'Transportasi',
    'bensin': 'Transportasi', 'bbm': 'Transportasi', 'parkir': 'Transportasi',
    'tol': 'Transportasi', 'kereta': 'Transportasi', 'train': 'Transportasi', 'bus': 'Transportasi',

    // --- Kebutuhan Pokok (sembako & keperluan harian rumah tangga) ---
    'sembako': 'Kebutuhan Pokok', 'beras': 'Kebutuhan Pokok', 'minyak goreng': 'Kebutuhan Pokok',
    'gula': 'Kebutuhan Pokok', 'telur': 'Kebutuhan Pokok', 'sayur': 'Kebutuhan Pokok',
    'buah': 'Kebutuhan Pokok', 'susu': 'Kebutuhan Pokok', 'popok': 'Kebutuhan Pokok',
    'galon': 'Kebutuhan Pokok', 'gas': 'Kebutuhan Pokok', 'sabun': 'Kebutuhan Pokok',

    // --- Belanja (retail umum, bukan kebutuhan pokok harian) ---
    'belanja': 'Belanja', 'swalayan': 'Belanja', 'supermarket': 'Belanja',
    'minimarket': 'Belanja', 'indomaret': 'Belanja', 'alfamart': 'Belanja',
    'borma': 'Belanja', 'toko': 'Belanja', 'mall': 'Belanja',
    'pakaian': 'Belanja', 'baju': 'Belanja', 'sepatu': 'Belanja', 'celana': 'Belanja',
    'tas': 'Belanja', 'elektronik': 'Belanja',

    // --- Pendidikan ---
    'pendidikan': 'Pendidikan', 'kursus': 'Pendidikan', 'buku': 'Pendidikan',
    'sekolah': 'Pendidikan', 'kuliah': 'Pendidikan', 'spp': 'Pendidikan', 'les': 'Pendidikan',

    // --- Tagihan (termasuk langganan digital berulang) ---
    'listrik': 'Tagihan', 'air': 'Tagihan', 'pdam': 'Tagihan', 'internet': 'Tagihan',
    'wifi': 'Tagihan', 'telpon': 'Tagihan', 'telepon': 'Tagihan', 'pulsa': 'Tagihan',
    'cicilan': 'Tagihan', 'bpjs': 'Tagihan', 'asuransi': 'Tagihan',
    'langganan': 'Tagihan',

    // --- Kesehatan ---
    'obat': 'Kesehatan', 'dokter': 'Kesehatan', 'klinik': 'Kesehatan',
    'rumah sakit': 'Kesehatan', 'rs': 'Kesehatan', 'vitamin': 'Kesehatan', 'apotek': 'Kesehatan',

    // --- Hiburan (termasuk liburan/wisata, bukan cuma hiburan harian) ---
    'liburan': 'Hiburan', 'wisata': 'Hiburan', 'hotel': 'Hiburan',
    'tiket pesawat': 'Hiburan', 'staycation': 'Hiburan', 'travel': 'Hiburan',
    'nonton': 'Hiburan', 'netflix': 'Hiburan', 'spotify': 'Hiburan',
    'game': 'Hiburan', 'bioskop': 'Hiburan',

    // --- Lainnya (catch-all) ---

    // --- Pemasukan (Kredit): Gaji, Bonus, Transfer, Lainnya ---
    'gaji': 'Gaji', 'salary': 'Gaji',
    'bonus': 'Bonus', 'thr': 'Bonus', 'insentif': 'Bonus',
    'transfer': 'Transfer', 'kiriman': 'Transfer',
    'dapat': 'Lainnya', 'terima': 'Lainnya', 'hadiah': 'Lainnya'
};

// ===============================================
// MAIN LOGIC
// ===============================================
const senderMessageWindows = new Map();
const unknownSenderNotifications = new Map();

function isSenderRateLimited(sender) {
    const now = Date.now();
    const current = senderMessageWindows.get(sender);
    if (!current || now - current.startedAt > 60_000) {
        senderMessageWindows.set(sender, { count: 1, startedAt: now });
        return false;
    }
    current.count += 1;
    return current.count > 20;
}

async function notifyOwnerAboutUnknownSender(sender, text) {
    const senderId = String(sender || '').split('@')[0];
    if (!/^\d{8,20}$/.test(senderId)) return;

    const now = Date.now();
    const lastNotificationAt = unknownSenderNotifications.get(senderId) || 0;
    if (now - lastNotificationAt < UNKNOWN_SENDER_NOTIFICATION_COOLDOWN_MS) return;

    const ownerChatId = OWNER_LID ? `${OWNER_LID}@lid` : `${OWNER_NUMBER}@c.us`;
    const safeMessage = String(text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 500);
    const notification =
        'Ada user baru mencoba chat.\n\n' +
        `ID: ${senderId}\n` +
        `Pesan: ${JSON.stringify(safeMessage)}\n\n` +
        'Cara daftar, tinggal salin ini:\n' +
        `/add ${senderId} Nama\n\n` +
        `Penting: pakai ID persis seperti di atas (${senderId}). Jangan pakai nomor HP asli orang ini. ` +
        'Kalau WhatsApp menampilkan ID ini (bukan nomor HP normal), asisten ini cuma bisa mengenali user ini lewat ID tersebut, ' +
        'bukan lewat nomor HP-nya. Kalau pakai nomor HP, user tetap akan dianggap tidak terdaftar.';

    await client.sendMessage(ownerChatId, notification);
    unknownSenderNotifications.set(senderId, now);
    console.log(`✅ Notifikasi user baru dikirim ke owner: ${maskIdentifier(senderId)}`);
}

async function handleIncomingMessage(message) {
    if (message.fromMe) return;

    const sender = String(message.from || '');
    if (!/@(?:c\.us|lid)$/.test(sender)) return;
    if (message.type && message.type !== 'chat') return;
    const messageTimestamp = Number(message.timestamp || 0);
    if (botReadyAtSeconds && messageTimestamp > 0 && messageTimestamp < botReadyAtSeconds - 5) return;

    const text = String(message.body || '').trim();
    if (isSenderRateLimited(sender)) return;

    await resolveKnownLid(message);
    console.log(`📩 Pesan teks diterima dari ${maskIdentifier(sender)}`);

    const isWebLoginCommand = /^(login|masuk)(\s+(web|aplikasi|dashboard))?$/i.test(text);

    // =============================================
    // 1. OWNER (SEKALIGUS OPERATOR/ADMIN) — DIKUNCI KE MODE OPERASIONAL
    //    Owner tidak ikut laporan/transaksi/pairing melalui chat,
    //    apapun isi pesannya.
    // =============================================
    const operatorRole = isOwner(sender) ? 'owner' : null;
    if (operatorRole) {
        if (isWebLoginCommand) {
            const loginPhone = getLoginPhoneForSender(sender);
            const { code, expiresInMinutes } = createLoginCode(loginPhone, { workspaceId: `DEFAULT-${loginPhone}` });
            await message.reply(
                `Kode login Klop Money kamu: *${code}*\n\n` +
                `Kode berlaku ${expiresInMinutes} menit dan hanya dapat dipakai sekali.`
            );
            return;
        }

        // ---- /add ----
        if (text.startsWith('/add ')) {
            const parts = text.split(' ');
            if (parts.length < 2) {
                await message.reply('Cara pakai:\n`/add ID_DARI_NOTIFIKASI Nama`');
                return;
            }
            const number = getRegistrationIdentifier(parts[1]);
            const label = parts.slice(2).join(' ') || number;
            if (!number) {
                await message.reply('ID tidak valid. Gunakan nomor lengkap 08xxx/628xxx atau salin ID numerik persis dari notifikasi user baru.');
                return;
            }
            if (number === BOT_ACCOUNT_NUMBER) {
                await message.reply('Nomor bot tidak dapat ditambahkan sebagai user.');
                return;
            }
            if (addToWhitelist(number, sender, label, 'pending_consent')) {
                await message.reply(`Berhasil ditambahkan.\n\nNomor: ${number}\nLabel: ${label}\n\n(Pastikan angka di atas sama persis dengan ID yang muncul di notifikasi user baru, kalau beda user tetap tidak akan dikenali.)\n\nUser otomatis dapat pesan sambutan begitu dia chat asisten ini.`);
            } else {
                await message.reply('Gagal menambahkan nomor.');
            }
            return;
        }

        // ---- /list ----
        if (text === '/list') {
            const whitelist = loadWhitelist();
            const entries = Object.entries(whitelist).filter(([, data]) => isActiveWhitelistEntry(data));
            if (entries.length === 0) {
                await message.reply('Belum ada nomor terdaftar.');
                return;
            }
            let reply = 'Daftar nomor terdaftar:\n\n';
            entries.forEach(([number, data]) => {
                reply += `- ${number} (${data.label})\n`;
            });
            await message.reply(reply);
            return;
        }

        // ---- /remove ----
        if (text.startsWith('/remove ')) {
            const parts = text.split(' ');
            if (parts.length < 2) {
                await message.reply('Cara pakai:\n`/remove ID_DARI_DAFTAR`');
                return;
            }
            const requestedNumber = getRegistrationIdentifier(parts[1]);
            if (!requestedNumber) {
                await message.reply('ID tidak valid. Salin ID persis dari `/list`.');
                return;
            }
            const whitelist = loadWhitelist();
            const number = getCanonicalWhitelistKey(requestedNumber, whitelist);
            const targetRole = whitelist[number]?.role;
            if (['owner', 'developer'].includes(targetRole)) {
                await message.reply('Akses tetap owner atau developer tidak dapat dinonaktifkan melalui chat.');
                return;
            }
            if (isActiveWhitelistEntry(whitelist[number])) {
                const targetLid = whitelist[number].lid;
                for (const [key, entry] of Object.entries(whitelist)) {
                    if (key === number || getCleanNumber(entry?.phone || '') === number || (targetLid && (key === targetLid || entry?.lid === targetLid))) {
                        entry.status = 'inactive';
                        entry.disabled_by = sender;
                        entry.disabled_at = new Date().toISOString();
                    }
                }
                saveWhitelist(whitelist);
                await message.reply(`Akses nomor ${number} berhasil dinonaktifkan. Riwayat audit tetap dipertahankan.`);
            } else {
                await message.reply(`Nomor ${number} tidak ditemukan.`);
            }
            return;
        }

        // ---- /help ----
        if (text === '/help' || text === '/menu') {
            await message.reply(
                'Perintah owner/admin:\n\n' +
                '`/add ID Nama` - tambah atau aktifkan user\n' +
                '`/remove ID` - nonaktifkan user\n' +
                '`/list` - lihat daftar user terdaftar'
            );
            return;
        }

        // ---- Selain perintah admin di atas, owner tidak diproses lebih jauh ----
        await message.reply(
            `Kamu login sebagai ${operatorRole}.\n\n` +
            'Perintah yang tersedia: `/add`, `/remove`, `/list`, `/help`\n\n' +
            'Akun operasional tidak mencatat transaksi atau laporan keuangan. Gunakan akun user atau developer untuk pengujian transaksi.'
        );
        return;
    }

    // Nomor yang dinonaktifkan owner tidak dapat mengaktifkan diri melalui pairing.
    // Owner harus menjalankan /add untuk memberi akses kembali.
    if (isBlockedSender(sender)) {
        console.log(`⛔ Pesan diabaikan dari akses nonaktif: ${maskIdentifier(sender)}`);
        return;
    }

    // =============================================
    // 2. COBA SEBAGAI KODE PAIRING DULU
    //    (berlaku untuk siapa saja, terdaftar ATAU belum —
    //    ini jalur khusus "pasangan join pakai kode dari user pertama")
    // =============================================
    const isCodeFormat = new RegExp(`^[A-Z0-9]{${PAIRING_CODE_LENGTH}}$`, 'i').test(text);
    if (isCodeFormat) {
        if (!canAttemptPairing(sender)) return;
        const handled = await tryJoinWithPairingCode(sender, text.toUpperCase(), message);
        if (handled) return;
        // Kalau bukan kode yang dikenal, lanjut ke pengecekan whitelist normal di bawah.
    }

    // =============================================
    // 3. CEK WHITELIST
    // =============================================
    if (!isWhitelisted(sender)) {
        console.log(`⛔ Pesan dari nomor tidak terdaftar: ${maskIdentifier(sender)}`);
        try {
            await notifyOwnerAboutUnknownSender(sender, text);
        } catch (error) {
            console.error(`Gagal mengirim notifikasi user baru ke owner: ${error.message}`);
        }
        return;
    }

    if (!text) return;

    // =============================================
    // 3b. ONBOARDING (khusus user baru dari /add admin)
    //     Selama belum SETUJU + SIAP, semua pesan lain "diserap" di sini
    //     dan tidak diproses sebagai laporan/transaksi/pairing manual.
    // =============================================
    const onboardingHandled = await handleOnboarding(sender, text, message);
    if (onboardingHandled) return;

    // =============================================
    // 4. KODE LOGIN WEB (5 menit dan hanya sekali pakai)
    // =============================================
    if (isWebLoginCommand) {
        const household = findHouseholdBySender(sender);
        const loginPhone = getLoginPhoneForSender(sender);
        const workspaceId = household ? household.householdId : `DEFAULT-${loginPhone}`;
        const { code, expiresInMinutes } = createLoginCode(loginPhone, { workspaceId });
        await message.reply(
            `Kode login Klop Money kamu: *${code}*\n\n` +
            `Masukkan kode ini di aplikasi web. Kode berlaku ${expiresInMinutes} menit dan hanya dapat dipakai sekali.\n\n` +
            'Jangan berikan kode ini kepada siapa pun.'
        );
        return;
    }

    // =============================================
    // 5. GENERATE KODE PAIRING (untuk user yang sudah terdaftar)
    // =============================================
    const isPairingCommand = /(pasangkan|pairing|gabung|join)/i.test(text);

    if (isPairingCommand && !isCodeFormat) {
        await generateAndSendPairingCode(sender, message);
        return;
    }

    // =============================================
    // 5. LAPORAN
    // =============================================
    const isReportQuery = /(laporan|rekap|total|berapa|summary|ringkasan|^pemasukan|^pengeluaran|^uang|^saldo|^sisa)/i.test(text);
    const isToday = /(hari ini|today|hr ini|tdi|sekarang)/i.test(text);
    const isMonth = /(bulan ini|this month|sebulan|bln ini)/i.test(text);
    const isWeek = /(minggu ini|this week|pekan ini|mggu ini)/i.test(text);
    const isIncomeQuery = /(pemasukan|income|uang masuk|gaji|bonus|terima|dapat)/i.test(text);
    const isExpenseQuery = /(pengeluaran|expense|uang keluar|belanja|keluar|bayar|beli)/i.test(text);

    if (isReportQuery) {
        const household = findHouseholdBySender(sender);
        const householdId = household ? household.householdId : `DEFAULT-${getCleanNumber(sender)}`;

        let period = 'today';
        if (isMonth) period = 'month';
        else if (isWeek) period = 'week';

        let type = null;
        if (isIncomeQuery && !isExpenseQuery) type = 'Pemasukan';
        else if (isExpenseQuery && !isIncomeQuery) type = 'Pengeluaran';

        const report = type
            ? await getReport(type, period, householdId, sender)
            : await getFullReport(period, householdId, sender);
        await message.reply(report);
        return;
    }

    // =============================================
    // 6. KONFIRMASI TRANSAKSI YANG KEMARIN "KURANG JELAS"
    //    (bot sudah nanya, sekarang nunggu user jawab ya/batal/ralat)
    // =============================================
    const pendingConfirm = pendingTransactionBySender[sender];
    if (pendingConfirm) {
        const isExpired = (Date.now() - pendingConfirm.timestamp) > PENDING_CONFIRM_TTL_MS;
        if (isExpired) {
            delete pendingTransactionBySender[sender]; // sudah basi, anggap tidak ada -> lanjut ke bawah seperti biasa
        } else {
            const normalized = text.trim().toLowerCase();
            const isYes = /^(ya|iya|y|benar|betul|bener|oke|ok|yoi|siap|sip|lanjut)\b/.test(normalized);
            const isNo = /^(batal|batalkan|hapus|tidak|nggak|ga|gak|bukan|salah)\b/.test(normalized);

            if (isYes) {
                delete pendingTransactionBySender[sender];
                await recordTransaction(sender, message, pendingConfirm.transactionType, pendingConfirm.category, pendingConfirm.amount, pendingConfirm.rawText);
                return;
            }
            if (isNo) {
                delete pendingTransactionBySender[sender];
                await message.reply('Oke, tidak jadi dicatat.');
                return;
            }
            // Bukan ya/batal -> anggap user mau membetulkan pesannya.
            // Buang draft lama, lanjut proses pesan baru ini dari awal seperti transaksi baru.
            delete pendingTransactionBySender[sender];
        }
    }

    // =============================================
    // 7. EDIT / HAPUS TRANSAKSI TERAKHIR YANG SUDAH TERSIMPAN
    // =============================================
    const isEditCommand = /^(edit|ralat|revisi|koreksi)\b/i.test(text.trim());
    const isCancelLastCommand = /^(hapus|batal|batalkan)\b/i.test(text.trim());

    if (isEditCommand) {
        const last = lastTransactionBySender[sender];
        if (!last || !last.rowNumber) {
            await message.reply('Tidak ada transaksi terakhir yang bisa diedit. Coba catat ulang transaksinya.');
            return;
        }
        if ((Date.now() - last.timestamp) > EDIT_WINDOW_MS) {
            await message.reply('Transaksi terakhirmu sudah lebih dari 10 menit lalu, jadi tidak bisa diedit lagi lewat sini.');
            return;
        }

        const editText = text.trim().replace(/^(edit|ralat|revisi|koreksi)\b/i, '').replace(/^\s*jadi\b/i, '').trim();
        const parsed = parseTransactionText(editText);
        if (!parsed) {
            await message.reply('Mau diedit jadi berapa? Contoh: `edit 5k` atau `ralat ayam 5rb`');
            return;
        }

        const newAmount = parsed.amount;
        const newCategory = parsed.category || last.category; // kalau tidak sebut kategori baru, pertahankan yang lama
        const newTransactionType = parsed.isIncomeDetected ? 'Pemasukan' : last.transactionType;
        const newRawText = `${text} [diedit dari: "${last.rawText}"]`;

        const ok = await updateTransactionFields(last.rowNumber, {
            type: newTransactionType,
            category: newCategory,
            amount: newAmount,
            raw_message: newRawText
        });

        if (!ok) {
            await message.reply('Gagal mengedit transaksi, coba lagi.');
            return;
        }

        lastTransactionBySender[sender] = { ...last, amount: newAmount, category: newCategory, transactionType: newTransactionType, rawText: text, timestamp: Date.now() };

        await message.reply(`Berhasil diedit. ${newTransactionType} Rp${newAmount.toLocaleString()} untuk ${newCategory}.`);
        return;
    }

    if (isCancelLastCommand) {
        const last = lastTransactionBySender[sender];
        if (!last || !last.rowNumber) {
            await message.reply('Tidak ada transaksi terakhir yang bisa dihapus.');
            return;
        }
        if ((Date.now() - last.timestamp) > EDIT_WINDOW_MS) {
            await message.reply('Transaksi terakhirmu sudah lebih dari 10 menit lalu, tidak bisa dihapus otomatis lagi lewat sini.');
            return;
        }

        const ok = await clearTransactionRow(last.rowNumber);
        if (!ok) {
            await message.reply('Gagal menghapus transaksi, coba lagi.');
            return;
        }

        delete lastTransactionBySender[sender];
        await message.reply(`Transaksi terakhir (Rp${last.amount.toLocaleString()} untuk ${last.category}) sudah dihapus.`);
        return;
    }

    // =============================================
    // 8. TRANSAKSI BARU (dengan cek "kurang jelas" dulu sebelum dicatat)
    // =============================================
    const parsed = parseTransactionText(text);

    if (parsed) {
        const ambiguityReasons = checkAmbiguity(parsed, text);

        // --- Ambigu: ada beberapa angka berbeda, bot tidak berani nebak ---
        if (ambiguityReasons.includes('nominal')) {
            const distinctAmounts = [...new Set(parsed.allMatches.map(m => m.amount))];
            const amountsList = distinctAmounts.map(a => `Rp${a.toLocaleString()}`).join(' atau ');
            await message.reply(`Aku nemu beberapa angka di pesanmu (${amountsList}), jadi belum yakin mana yang nominalnya.\n\nCoba kirim ulang, sebutin satu angka saja untuk nominal transaksinya.`);
            return;
        }

        // --- Ambigu: ada kata pemasukan DAN pengeluaran sekaligus ---
        if (ambiguityReasons.includes('jenis')) {
            await message.reply(`Pesanmu ada kata yang menunjukkan pemasukan sekaligus pengeluaran, jadi aku belum yakin ini uang masuk atau keluar.\n\nCoba kirim ulang lebih jelas, misalnya "gaji 5jt" untuk pemasukan atau "beli beras 25rb" untuk pengeluaran.`);
            return;
        }

        // --- Ambigu: kategori tidak ketemu -> tebak "Lainnya", tapi minta konfirmasi dulu ---
        if (ambiguityReasons.includes('kategori')) {
            pendingTransactionBySender[sender] = {
                amount: parsed.amount,
                transactionType: parsed.transactionType,
                category: 'Lainnya',
                rawText: text,
                timestamp: Date.now()
            };
            await message.reply(
                `Aku belum yakin ini kategori apa, jadi aku catat sebagai Lainnya dulu:\n\n` +
                `${parsed.transactionType} Rp${parsed.amount.toLocaleString()} - Lainnya\n\n` +
                `Balas "ya" kalau sudah benar.\n` +
                `Kalau kategorinya beda, kirim ulang pesannya lebih detail, misal "beli oli motor 25rb".\n` +
                `Balas "batal" kalau ternyata bukan transaksi.`
            );
            return;
        }

        // --- Sudah jelas semua, langsung catat ---
        await recordTransaction(sender, message, parsed.transactionType, parsed.category, parsed.amount, text);
        return;
    }

    // =============================================
    // 9. FALLBACK
    // =============================================
    await message.reply('Format tidak dikenali. Contoh: "makan siang 25rb" atau "gaji 5jt"');
}

client.on('message', (message) => {
    handleIncomingMessage(message).catch((error) => {
        console.error(`❌ Gagal memproses pesan WhatsApp: ${error.message}`);
    });
});

let startPromise = null;

function startBot() {
    if (!startPromise) {
        botState = 'starting';
        startPromise = client.initialize().catch(async (error) => {
            botState = 'error';
            try { await client.destroy(); } catch {}
            startPromise = null;
            throw error;
        });
    }
    return startPromise;
}

async function stopBot() {
    if (!startPromise) return;
    try {
        await client.destroy();
    } finally {
        startPromise = null;
        botState = 'stopped';
        connectedBotNumber = '';
        botReadyAtSeconds = 0;
    }
}

function getBotStatus() {
    return { state: botState, connected: botState === 'ready', account: maskIdentifier(connectedBotNumber) };
}

module.exports = { startBot, stopBot, getBotStatus, client };

/* Legacy Express bootstrap removed. The API now starts from src/index.js.
app.listen(PORT, () => {
    console.log(`🌐 Web server jalan di port ${PORT}`);
});
*/
