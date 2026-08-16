const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const botSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'bot', 'whatsapp.js'), 'utf8');
const sheetsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'googleSheetsService.js'), 'utf8');

test('direct-send hanya digunakan untuk notifikasi user baru ke owner tetap', () => {
    const directSends = botSource.match(/client\.sendMessage\s*\(/g) || [];
    assert.equal(directSends.length, 1);
    assert.match(botSource, /const ownerChatId = OWNER_LID \? `\$\{OWNER_LID\}@lid` : `\$\{OWNER_NUMBER\}@c\.us`/);
    assert.match(botSource, /await client\.sendMessage\(ownerChatId, notification\)/);
    assert.doesNotMatch(botSource, /client\.getContacts\s*\(/);
});

test('bot menolak pesan sendiri, non-chat, dan nomor tidak terdaftar', () => {
    assert.match(botSource, /if \(message\.fromMe\) return;/);
    assert.match(botSource, /message\.type !== 'chat'/);
    assert.match(botSource, /if \(!isWhitelisted\(sender\)\) \{[\s\S]*?return;[\s\S]*?\}/);
});

test('nomor tidak terdaftar diberitahukan ke owner dengan ID persis dan cooldown', () => {
    assert.match(botSource, /notifyOwnerAboutUnknownSender\(sender, text\)/);
    assert.match(botSource, /UNKNOWN_SENDER_NOTIFICATION_COOLDOWN_MS = 15 \* 60 \* 1000/);
    assert.match(botSource, /`\/add \$\{senderId\} Nama/);
});

test('perintah add menerima nomor lokal maupun ID internal WhatsApp', () => {
    assert.match(botSource, /function getRegistrationIdentifier\(value\)/);
    assert.match(botSource, /\^08\\d\{7,12\}\$/);
    assert.match(botSource, /\^\\d\{8,20\}\$/);
    assert.match(botSource, /const number = getRegistrationIdentifier\(parts\[1\]\)/);
});

test('bot mengabaikan pesan lama yang muncul kembali setelah reconnect', () => {
    assert.match(botSource, /messageTimestamp < botReadyAtSeconds - 5/);
});

test('hanya owner yang menjadi operator dan owner tidak dapat menonaktifkan dirinya', () => {
    assert.match(botSource, /const operatorRole = isOwner\(sender\) \? 'owner' : null/);
    assert.match(botSource, /\['owner', 'developer'\]\.includes\(targetRole\)/);
    assert.doesNotMatch(botSource, /function isAdmin\(/);
});

test('whitelist menolak akses yang sudah dinonaktifkan', () => {
    assert.match(botSource, /\['inactive', 'blocked'\]\.includes\(entry\.status\)/);
    assert.match(botSource, /entry\.status = 'inactive'/);
    assert.match(botSource, /if \(isBlockedSender\(sender\)\)/);
});

test('pemetaan LID hanya memeriksa pengirim dan tidak membaca daftar kontak', () => {
    assert.match(botSource, /client\.getContactLidAndPhone\(\[sender\]\)/);
    assert.doesNotMatch(botSource, /client\.getContacts\s*\(/);
});

test('pairing membentuk satu household dan memigrasikan alias nomor maupun LID', () => {
    assert.match(botSource, /const householdId = `HH-\$\{crypto\.randomUUID\(\)\}`/);
    assert.match(botSource, /getPersonalWorkspaceIds\(pair\.wa_number, sender\)/);
    assert.match(botSource, /completePairingToSheet\(pair\.wa_number, sender, householdId, personalWorkspaceIds\)/);
    assert.match(botSource, /pairingData\[`user_\$\{pair\.wa_number\}`\]/);
    assert.match(botSource, /pairingData\[`user_\$\{sender\}`\]/);
});

test('pencatatan pasangan dan migrasi transaksi memakai satu batch Google Sheets', () => {
    assert.match(sheetsSource, /async function completePairingToSheet/);
    assert.match(sheetsSource, /appendCells:/);
    assert.match(sheetsSource, /updateCells:/);
    assert.match(sheetsSource, /await sheets\.spreadsheets\.batchUpdate/);
});

test('pasangan kedua wajib SETUJU sebelum fitur transaksi aktif', () => {
    assert.match(botSource, /'pending_join_consent'/);
    assert.match(botSource, /status === 'pending_join_consent'/);
    assert.match(botSource, /text\.trim\(\)\.toUpperCase\(\) === 'SETUJU'/);
    assert.match(botSource, /setOnboardingStatus\(entry\.key, 'done'\)/);
    assert.match(botSource, /Sebelum kamu membalas SETUJU, pesan lain tidak akan dicatat sebagai transaksi/);
});

test('kode pairing terlindungi dari pemakaian bersamaan dan household ganda', () => {
    assert.match(botSource, /pairingCodesInProgress\.has\(pairingKey\)/);
    assert.match(botSource, /const senderHousehold = findHouseholdBySender\(sender\)/);
    assert.match(botSource, /const ownerHousehold = findHouseholdBySender\(pair\.wa_number\)/);
    assert.match(botSource, /const isOwnCode = getIdentityNumbers\(pair\.wa_number\)/);
    assert.match(botSource, /if \(!isWhitelisted\(pair\.wa_number\)\)/);
});
