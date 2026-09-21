/** Fieldnote lead-form server. Gmail credentials only live in the ignored .env file. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const root = __dirname, port = Number(process.env.PORT || 4173), dataPath = path.join(root, 'leads.json');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const recentRequests = new Map(), envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
const readLeads = () => fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) : [];
const writeJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const auth = require('./auth')(root, writeJson);
const publicFiles = new Set(['/login.html', '/login.css', '/login.js']);
const privateFiles = new Set(['/index.html', '/app.js', '/session.js', '/styles.css', '/form-manager.css', '/lead-detail.css', '/lead-form.html', '/lead-form.css', '/lead-form.js']);
const clean = value => typeof value === 'string' ? value.trim().slice(0, 4000) : '';
const tooSoon = ip => { const now = Date.now(), last = recentRequests.get(ip) || 0; recentRequests.set(ip, now); return now - last < 10_000; };
const formatDate = date => date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'date to be confirmed';
const appUrl = () => (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
async function sendNotification(lead) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return { sent: false, reason: 'Gmail is not configured' };
  const firstName = lead.firstName || lead.name.split(/\s+/)[0];
  const lastName = lead.lastName || lead.name.split(/\s+/).slice(1).join(' ');
  const enquiryUrl = `${appUrl()}/#leads?lead=${encodeURIComponent(lead.id)}`;
  const text = ['You have a new lead!', '', `Name: ${firstName}`, `Surname: ${lastName}`, `Email: ${lead.email}`, `Phone number: ${lead.phone || '—'}`, `Shoot date: ${formatDate(lead.eventDate)}`, `Type of shoot: ${lead.sessionType}`, `Place: ${lead.location || '—'}`, `Note: ${lead.message}`, '', `Open enquiry in Fieldnote: ${enquiryUrl}`].join('\n');
  const transporter = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  await transporter.sendMail({ from: `Fieldnote <${process.env.GMAIL_USER}>`, to: process.env.NOTIFICATION_EMAIL || 'foto@petrdvorsky.com', replyTo: lead.email, subject: `New lead from ${lead.name} for ${formatDate(lead.eventDate)}`, text });
  return { sent: true };
}
http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/auth/')) { auth.handle(req, res, url).catch(() => writeJson(res, 500, { error: 'Sign-in unavailable.' })); return; }
  if (url.startsWith('/api/')) {
    if (!auth.authenticated(req)) return writeJson(res, 401, { error: 'Please sign in.' });
    if (!['GET', 'HEAD'].includes(req.method) && !auth.sameOrigin(req)) return writeJson(res, 403, { error: 'Request origin rejected.' });
  }
  if (url === '/api/state') {
    const statePath = path.join(root, '.studio.json');
    if (req.method === 'GET') {
      try { return writeJson(res, 200, fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null); }
      catch { return writeJson(res, 500, { error: 'Unable to load studio data.' }); }
    }
    if (req.method === 'PUT') {
      let raw = '';
      req.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) req.destroy(); });
      req.on('end', () => {
        try {
          const state = JSON.parse(raw);
          if (!state || !['leads', 'clients', 'jobs', 'workflows'].every(key => Array.isArray(state[key]))) return writeJson(res, 400, { error: 'Invalid studio data.' });
          fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 });
          fs.renameSync(`${statePath}.tmp`, statePath);
          return writeJson(res, 200, { ok: true });
        } catch { return writeJson(res, 500, { error: 'Unable to save studio data.' }); }
      }); return;
    }
    return writeJson(res, 405, { error: 'Method not allowed.' });
  }
  if (req.method === 'POST' && req.url === '/api/leads') {
    const ip = req.socket.remoteAddress || 'unknown'; if (tooSoon(ip)) return writeJson(res, 429, { error: 'Please wait a moment before submitting again.' });
    let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 30_000) req.destroy(); }); req.on('end', async () => { try {
      const input = JSON.parse(raw); if (input.website) return writeJson(res, 201, { ok: true });
      const firstName = clean(input.firstName || clean(input.name).split(/\s+/)[0]), lastName = clean(input.lastName || clean(input.name).split(/\s+/).slice(1).join(' '));
      const lead = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'New enquiry', firstName, lastName, name: `${firstName} ${lastName}`.trim(), email: clean(input.email).toLowerCase(), phone: clean(input.phone), sessionType: clean(input.sessionType), eventDate: clean(input.eventDate), location: clean(input.location), message: clean(input.message), consent: input.consent === 'on' };
      if (!lead.firstName || !lead.lastName || !/^\S+@\S+\.\S+$/.test(lead.email) || !lead.sessionType || !lead.message || !lead.consent) return writeJson(res, 400, { error: 'Please complete all required fields.' });
      const leads = readLeads(); leads.unshift(lead); fs.writeFileSync(dataPath, JSON.stringify(leads, null, 2));
      const notification = await sendNotification(lead).catch(error => { console.error('Lead email failed:', error.message); return { sent: false }; }); return writeJson(res, 201, { id: lead.id, notificationSent: notification.sent });
    } catch { return writeJson(res, 400, { error: 'We could not save your enquiry.' }); } }); return;
  }
  const resendMatch = req.url.match(/^\/api\/leads\/([^/]+)\/resend$/);
  if (req.method === 'POST' && resendMatch) {
    const lead = readLeads().find(item => item.id === decodeURIComponent(resendMatch[1]));
    if (!lead) return writeJson(res, 404, { error: 'Lead not found.' });
    sendNotification(lead).then(() => writeJson(res, 200, { sent: true })).catch(error => { console.error('Lead resend failed:', error.message); writeJson(res, 502, { error: 'Email could not be sent.', detail: error.message }); });
    return;
  }
  if (req.method === 'GET' && req.url === '/api/leads') return writeJson(res, 200, readLeads());
  if (url === '/login' || url === '/login.html') {
    if (auth.authenticated(req)) { res.writeHead(303, { Location: '/#dashboard' }); return res.end(); }
  }
  const requested = url === '/' ? '/index.html' : url === '/login' ? '/login.html' : url;
  if (!publicFiles.has(requested) && !privateFiles.has(requested)) { res.writeHead(404); return res.end('Not found'); }
  if (privateFiles.has(requested) && !auth.authenticated(req)) { res.writeHead(303, { Location: '/login' }); return res.end(); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  const file = path.join(root, requested);
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* https://www.petrdvorsky.com" }); fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Fieldnote running at http://localhost:${port}`));
