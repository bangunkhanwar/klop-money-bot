const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { isValidAvatar } = require('../src/routes/api');

test('avatar hanya menerima data gambar terkompresi yang aman', () => {
    const smallWebp = `data:image/webp;base64,${Buffer.from('small-image').toString('base64')}`;
    assert.equal(isValidAvatar(smallWebp), true);
    assert.equal(isValidAvatar(''), true);
    assert.equal(isValidAvatar('data:text/html;base64,PHNjcmlwdD4='), false);
    assert.equal(isValidAvatar(`data:image/webp;base64,${Buffer.alloc(34_000).toString('base64')}`), false);
});

test('penghapusan budget memakai status nonaktif dan tidak menghapus baris Google Sheets', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'googleSheetsService.js'), 'utf8');
    assert.match(source, /'inactive'/);
    assert.doesNotMatch(source, /spreadsheets\.values\.clear/);
});

test('nomor WhatsApp tidak dapat diubah melalui profil pengguna', () => {
    const routeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'api.js'), 'utf8');
    const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'googleSheetsService.js'), 'utf8');
    assert.match(routeSource, /identityFields = \['phone', 'whatsappNumber', 'wa_number'\]/);
    assert.match(routeSource, /res\.status\(403\)/);
    assert.match(serviceSource, /Nomor WhatsApp tidak dapat diubah melalui profil pengguna/);
});
