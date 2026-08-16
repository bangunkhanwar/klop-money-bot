const test = require('node:test');
const assert = require('node:assert/strict');
const { requireCsrf } = require('../src/middleware/auth');
const { config } = require('../src/config');

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };
}

test('CSRF menolak token yang hilang atau berbeda', () => {
    for (const headerToken of ['', 'token-yang-berbeda']) {
        const req = {
            cookies: { [config.csrfCookieName]: 'token-benar' },
            get: () => headerToken,
        };
        const res = createResponse();
        let nextCalled = false;
        requireCsrf(req, res, () => { nextCalled = true; });
        assert.equal(res.statusCode, 403);
        assert.equal(nextCalled, false);
    }
});

test('CSRF menerima pasangan cookie dan header yang sama', () => {
    const req = {
        cookies: { [config.csrfCookieName]: 'token-benar' },
        get: () => 'token-benar',
    };
    const res = createResponse();
    let nextCalled = false;
    requireCsrf(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});
