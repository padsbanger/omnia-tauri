// Synthetic credentials only. Node crypto is independent from the Rust implementation.
import { createCipheriv, createHmac, pbkdf2Sync } from 'node:crypto';
import assert from 'node:assert/strict';
export const credentials = { email: 'fixture@example.invalid', password: 'synthetic master password', code: '123456' };
const master = pbkdf2Sync(credentials.password, credentials.email, 5000, 32, 'sha256');
const expand = info => createHmac('sha256', master).update(Buffer.concat([Buffer.from(info), Buffer.from([1])])).digest();
const stretched = Buffer.concat([expand('enc'), expand('mac')]);
const userKey = Buffer.alloc(64, 42), itemKey = Buffer.alloc(64, 17);
export function encrypt(value, key = userKey) {
  const iv = Buffer.alloc(16, 9);
  const cipher = createCipheriv('aes-256-cbc', key.subarray(0, 32), iv);
  const data = Buffer.concat([cipher.update(value), cipher.final()]);
  const mac = createHmac('sha256', key.subarray(32)).update(iv).update(data).digest();
  return `2.${iv.toString('base64')}|${data.toString('base64')}|${mac.toString('base64')}`;
}
export const fixturePassword = 'synthetic " password </script> \\ 😀';
const cipher = (id, url, extra = {}) => ({ id, type: 1, name: encrypt(`Fixture ${id}`), login: { username: encrypt('alice@example.invalid'), password: encrypt(fixturePassword), uris: [{ uri: encrypt(url), match: null }] }, ...extra });
export const fixtureSync = { ciphers: [
  cipher('login', 'https://accounts.google.com'),
  cipher('other', 'https://example.invalid'),
  cipher('shared', 'https://accounts.google.com', { organizationId: 'org' }),
  cipher('protected', 'https://accounts.google.com', { reprompt: 1 }),
  cipher('deleted', 'https://accounts.google.com', { deletedDate: '2026-01-01' }),
  cipher('never', 'https://accounts.google.com', { login: { uris: [{ uri: encrypt('https://accounts.google.com'), match: 5 }] } }),
  cipher('item-key', '', { key: encrypt(itemKey), name: encrypt('Item key', itemKey), login: { username: encrypt('bob@example.invalid', itemKey), password: encrypt(fixturePassword, itemKey), uris: [{ uri: encrypt('https://accounts.google.com', itemKey), match: 0 }] } }),
] };
export function vaultFixture() {
  const state = { requests: [], devices: [], delay: 0, tamper: false };
  return { state, async handle(req, res) {
    if (!req.url.startsWith('/vault/')) return false;
    state.requests.push(req.url);
    let body = ''; for await (const chunk of req) body += chunk;
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.url.includes('/prelogin')) {
      assert.equal(JSON.parse(body).email, credentials.email);
      send(200, { kdf: 0, kdfIterations: 5000 });
    } else if (req.url.endsWith('/connect/token')) {
      const form = new URLSearchParams(body);
      assert.equal(form.get('password'), pbkdf2Sync(master, credentials.password, 1, 32, 'sha256').toString('base64'));
      assert.equal(form.get('username'), credentials.email);
      assert.equal(form.get('client_id'), 'desktop');
      state.devices.push(form.get('deviceIdentifier'));
      if (form.get('twoFactorToken') !== credentials.code) send(400, { TwoFactorProviders: ['0'] });
      else {
        if (state.delay) await new Promise(r => setTimeout(r, state.delay));
        send(200, { access_token: 'synthetic-access', Key: encrypt(userKey, stretched), refresh_token: 'synthetic-unused-refresh' });
      }
    } else if (req.url.startsWith('/vault/api/sync')) {
      assert.equal(req.headers.authorization, 'Bearer synthetic-access');
      const sync = structuredClone(fixtureSync);
      if (state.tamper) sync.ciphers[0].login.password = encrypt('tampered', Buffer.alloc(64, 1));
      send(200, sync);
    } else send(404, {});
    return true;
  } };
}
