const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createLoginCode,
    verifyLoginCode,
    createCsrfToken,
    normalizePhone,
} = require('../src/services/authService');

test('OTP hanya berlaku untuk nomor yang meminta kode', () => {
    const ownerPhone = '628000000001';
    const otherPhone = '628000000002';
    const { code } = createLoginCode(ownerPhone);

    assert.equal(verifyLoginCode(otherPhone, code).ok, false);
    assert.equal(verifyLoginCode(ownerPhone, code).ok, true);
});

test('OTP hanya dapat dipakai sekali', () => {
    const phone = '628000000003';
    const { code } = createLoginCode(phone);

    assert.equal(verifyLoginCode(phone, code).ok, true);
    assert.equal(verifyLoginCode(phone, code).ok, false);
});

test('normalisasi nomor lokal Indonesia konsisten', () => {
    assert.equal(normalizePhone('0812-3456-7890'), '6281234567890');
    assert.equal(normalizePhone('0821-1234-5678'), '6282112345678');
    assert.equal(normalizePhone('0882-0022-14200'), '62882002214200');
});

test('token CSRF memiliki entropi dan tidak berulang', () => {
    const first = createCsrfToken();
    const second = createCsrfToken();
    assert.ok(first.length >= 40);
    assert.notEqual(first, second);
});
