const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

async function withServer(run) {
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        const { port } = server.address();
        await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('health endpoint aktif dan memakai security headers', async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/health`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal((await response.json()).status, 'ok');
    });
});

test('origin di luar allowlist ditolak', async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/health`, {
            headers: { Origin: 'https://evil.example' },
        });
        assert.equal(response.status, 403);
    });
});
