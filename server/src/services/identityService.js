const fs = require('fs');
const { config } = require('../config');
const { normalizePhone } = require('./authService');

let cachedWhitelist = {};
let cachedAt = 0;

function loadIdentityMap() {
    if (Date.now() - cachedAt < 5_000) return cachedWhitelist;
    try {
        cachedWhitelist = JSON.parse(fs.readFileSync(config.paths.whitelist, 'utf8'));
    } catch {
        cachedWhitelist = {};
    }
    cachedAt = Date.now();
    return cachedWhitelist;
}

function canonicalPhone(value) {
    const identifier = normalizePhone(value);
    if (!identifier) return '';
    const whitelist = loadIdentityMap();
    const direct = whitelist[identifier];
    if (direct?.phone) return normalizePhone(direct.phone);
    if (identifier.startsWith('62') && direct) return identifier;

    for (const [key, entry] of Object.entries(whitelist)) {
        if (normalizePhone(entry?.lid) !== identifier) continue;
        if (entry?.phone) return normalizePhone(entry.phone);
        if (normalizePhone(key).startsWith('62')) return normalizePhone(key);
    }
    return identifier;
}

function isSameIdentity(first, second) {
    const firstCanonical = canonicalPhone(first);
    return Boolean(firstCanonical && firstCanonical === canonicalPhone(second));
}

module.exports = { canonicalPhone, isSameIdentity };
