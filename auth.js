const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const lifetime = 30 * 60 * 1000;

module.exports = function createAuth(root, json, now = Date.now) {
  const accountPath = path.join(root, '.owner.json');
  const sessions = new Map(), attempts = new Map();
  const secure = process.env.NODE_ENV === 'production' || process.env.APP_URL?.startsWith('https://');
  const localSetup = req => !secure && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '');
  const token = req => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('fieldnote_session='))?.slice(18);
  const cookie = value => `fieldnote_session=${value}; HttpOnly; SameSite=Strict; Path=/${value ? '' : '; Max-Age=0'}${secure ? '; Secure' : ''}`;
  const authenticated = req => {
    const key = token(req), expires = sessions.get(key);
    if (expires > now()) return true;
    sessions.delete(key); return false;
  };
  const sameOrigin = req => {
    try {
      // Local development may use localhost or a loopback IP. Require the
      // browser's origin to match this request's host, including its port.
      const expected = localSetup(req)
        ? `http://${req.headers.host}`
        : process.env.APP_URL ? new URL(process.env.APP_URL).origin : `http://${req.headers.host}`;
      return req.headers.origin === expected;
    } catch { return false; }
  };
  async function body(req) {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 10000) throw new Error('Too large'); }
    return JSON.parse(raw);
  }
  async function handle(req, res, url) {
    if (url === '/api/auth/status' && req.method === 'GET') {
      return json(res, 200, { authenticated: authenticated(req), expiresAt: sessions.get(token(req)) || null, setup: !fs.existsSync(accountPath) && localSetup(req) });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'Request origin rejected.' });
    if (url === '/api/auth/activity') {
      if (!authenticated(req)) return json(res, 401, { error: 'Please sign in.' });
      const expiresAt = now() + lifetime;
      sessions.set(token(req), expiresAt);
      return json(res, 200, { expiresAt });
    }
    if (url === '/api/auth/logout') {
      sessions.delete(token(req)); res.setHeader('Set-Cookie', cookie('')); return json(res, 200, { ok: true });
    }
    if (!['/api/auth/login', '/api/auth/setup'].includes(url)) return json(res, 404, { error: 'Not found.' });
    const ip = req.socket.remoteAddress, timestamp = now();
    for (const [key, item] of attempts) if (item.until <= timestamp) attempts.delete(key);
    const attempt = attempts.get(ip) || { count: 0, until: timestamp + 15 * 60 * 1000 };
    attempts.set(ip, attempt);
    if (++attempt.count > 10) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    try {
      const input = await body(req);
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      if (password.length > 256) return json(res, 400, { error: 'Password is too long.' });
      if (url === '/api/auth/setup') {
        if (!localSetup(req) || fs.existsSync(accountPath)) return json(res, 403, { error: 'Account setup is unavailable.' });
        if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 14) return json(res, 400, { error: 'Enter a valid email and a password of at least 14 characters.' });
        const salt = crypto.randomBytes(32).toString('hex');
        const hash = (await scrypt(password, salt, 64)).toString('hex');
        fs.writeFileSync(accountPath, JSON.stringify({ email, salt, hash }), { flag: 'wx', mode: 0o600 });
      } else {
        const account = fs.existsSync(accountPath) ? JSON.parse(fs.readFileSync(accountPath, 'utf8')) : { email: '', salt: 'unconfigured', hash: '00'.repeat(64) };
        const hash = await scrypt(password, account.salt, 64);
        if (!crypto.timingSafeEqual(hash, Buffer.from(account.hash, 'hex')) || email !== account.email || !email) return json(res, 401, { error: 'Email or password is incorrect.' });
      }
      attempts.delete(ip);
      for (const [key, expiry] of sessions) if (expiry <= timestamp) sessions.delete(key);
      sessions.delete(token(req));
      const session = crypto.randomBytes(32).toString('hex'); sessions.set(session, now() + lifetime);
      res.setHeader('Set-Cookie', cookie(session)); return json(res, 200, { ok: true });
    } catch { return json(res, 400, { error: 'Unable to complete sign-in. Please try again.' }); }
  }
  return { authenticated, sameOrigin, handle };
};
