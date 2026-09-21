const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('private studio authentication and data boundaries', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldnote-auth-'));
  for (const file of ['server.js', 'auth.js', 'index.html', 'login.html', 'login.js', 'login.css', 'app.js', 'session.js', 'lead-form.html', 'lead-form.js', 'lead-form.css']) fs.copyFileSync(path.join(__dirname, file), path.join(dir, file));
  const port = 24000 + Math.floor(Math.random() * 10000);
  const base = `http://localhost:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, PORT: String(port), APP_URL: base, NODE_ENV: 'test', NODE_PATH: path.join(__dirname, 'node_modules'), GMAIL_USER: '', GMAIL_APP_PASSWORD: '' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Server did not start')), 10000);
      child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timeout); reject(Error(`Server exited: ${code}`)); });
    });
    const request = (url, options = {}) => fetch(base + url, { redirect: 'manual', ...options });
    const post = (url, body, cookie = '', origin = base) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: JSON.stringify(body) });
    assert.equal((await request('/')).headers.get('location'), '/login');
    assert.equal((await request('/api/leads')).status, 401);
    assert.equal((await request('/api/state')).status, 401);
    assert.equal((await request('/api/leads/example/resend', { method: 'POST' })).status, 401);
    for (const file of ['/.env', '/leads.json', '/server.js', '/.owner.json', '/package.json', '/.git/config', '/%2eenv']) assert.equal((await request(file)).status, 404, file);
    for (const page of ['/index.html', '/lead-form.html', '/app.js', '/session.js']) assert.equal((await request(page)).headers.get('location'), '/login');
    assert.equal((await post('/api/leads', {})).status, 401);
    assert.equal((await request('/api/auth/status')).status, 200);
    const credentials = { email: 'owner@example.com', password: 'a unique test passphrase 123!' };
    assert.equal((await post('/api/auth/setup', credentials, '', 'https://attacker.example')).status, 403);
    assert.equal((await post('/api/auth/setup', { ...credentials, password: 'short' })).status, 400);
    const setup = await post('/api/auth/setup', credentials);
    assert.equal(setup.status, 200);
    const setCookie = setup.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await post('/api/auth/setup', credentials)).status, 403);
    assert.equal((await request('/', { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await request('/login', { headers: { Cookie: cookie } })).headers.get('location'), '/#dashboard');
    assert.equal((await request('/api/leads', { headers: { Cookie: cookie } })).status, 200);
    const state = { leads: [], clients: [], jobs: [], workflows: [] };
    assert.equal((await request('/api/state', { method: 'PUT', headers: { Cookie: cookie, Origin: 'https://attacker.example' }, body: JSON.stringify(state) })).status, 403);
    assert.equal((await request('/api/state', { method: 'PUT', headers: { Cookie: cookie, Origin: base }, body: JSON.stringify(state) })).status, 200);
    assert.deepEqual(await (await request('/api/state', { headers: { Cookie: cookie } })).json(), state);
    assert.equal((await post('/api/auth/logout', {}, cookie)).status, 200);
    assert.equal((await request('/api/leads', { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await post('/api/auth/login', { ...credentials, password: 'wrong' })).status, 401);
    const login = await post('/api/auth/login', credentials);
    assert.equal(login.status, 200);
    const newCookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/lead-form.html', { headers: { Cookie: newCookie } })).status, 200);
    assert.equal((await post('/api/auth/activity', {}, newCookie, 'https://attacker.example')).status, 403);
    assert.equal((await post('/api/auth/activity', {}, newCookie)).status, 200);
    const account = fs.readFileSync(path.join(dir, '.owner.json'), 'utf8');
    assert.ok(!account.includes(credentials.password));
    const lead = { firstName: 'Test', lastName: 'Client', email: 'client@example.com', sessionType: 'Portrait', message: 'Test enquiry', consent: 'on' };
    assert.equal((await post('/api/leads', lead, newCookie)).status, 201);
    for (let i = 0; i < 10; i++) await post('/api/auth/login', { ...credentials, password: 'wrong' });
    assert.equal((await post('/api/auth/login', credentials)).status, 429);
  } finally {
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('30-minute inactivity expiry is enforced by the server', async () => {
  const { Readable } = require('node:stream');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldnote-idle-'));
  let time = 1_000_000;
  const auth = require('./auth')(dir, (res, status, body) => { res.status = status; res.body = body; }, () => time);
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : 'http://localhost:4173';
  let cookie = '';
  const req = (method = 'GET', data = {}) => {
    const request = Readable.from([JSON.stringify(data)]);
    request.method = method;
    request.headers = { cookie, origin, host: 'localhost:4173' };
    request.socket = { remoteAddress: '127.0.0.1' };
    return request;
  };
  const call = async (url, method = 'GET', data) => {
    const res = { setHeader(name, value) { if (name === 'Set-Cookie') cookie = value.split(';')[0]; } };
    await auth.handle(req(method, data), res, url);
    return res;
  };
  try {
    // Provision a test hash directly so this test also works in production mode.
    const crypto = require('node:crypto');
    fs.writeFileSync(path.join(dir, '.owner.json'), JSON.stringify({ email: 'test@example.com', salt: 'test-salt', hash: crypto.scryptSync('test password', 'test-salt', 64).toString('hex') }));
    assert.equal((await call('/api/auth/login', 'POST', { email: 'test@example.com', password: 'test password' })).status, 200);
    const initial = (await call('/api/auth/status')).body.expiresAt;
    assert.equal(initial, time + 30 * 60 * 1000);
    time += 29 * 60 * 1000;
    assert.equal(auth.authenticated(req()), true);
    assert.equal((await call('/api/auth/status')).body.expiresAt, initial, 'polling must not extend a session');
    const renewed = await call('/api/auth/activity', 'POST');
    assert.equal(renewed.body.expiresAt, time + 30 * 60 * 1000);
    time = initial + 1;
    assert.equal(auth.authenticated(req()), true, 'activity extends the original deadline');
    time = renewed.body.expiresAt;
    assert.equal(auth.authenticated(req()), false, 'expires at precisely 30 minutes');
    assert.equal((await call('/api/auth/activity', 'POST')).status, 401, 'expired tokens cannot revive');
    assert.equal((await call('/api/auth/status')).body.authenticated, false);
  } finally {
    fs.unlinkSync(path.join(dir, '.owner.json'));
    fs.rmdirSync(dir);
  }
});

test('local origins match the actual host despite a stale APP_URL', () => {
  const previousUrl = process.env.APP_URL;
  const previousMode = process.env.NODE_ENV;
  try {
    process.env.APP_URL = 'http://127.0.0.1:4175';
    process.env.NODE_ENV = 'development';
    const auth = require('./auth')(__dirname, () => {});
    const request = (origin, host = 'localhost:4173', ip = '127.0.0.1') => ({ headers: { origin, host }, socket: { remoteAddress: ip } });
    assert.equal(auth.sameOrigin(request('http://localhost:4173')), true);
    assert.equal(auth.sameOrigin(request('http://127.0.0.1:4173', '127.0.0.1:4173')), true);
    assert.equal(auth.sameOrigin(request('http://localhost:4175')), false);
    assert.equal(auth.sameOrigin(request('https://attacker.example')), false);
    assert.equal(auth.sameOrigin(request(undefined)), false);
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://studio.example';
    const production = require('./auth')(__dirname, () => {});
    assert.equal(production.sameOrigin(request('http://localhost:4173')), false);
    assert.equal(production.sameOrigin(request('https://studio.example')), true);
  } finally {
    if (previousUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousUrl;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }
});
