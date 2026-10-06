'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2'); }); } catch {}
const e = process.env, PORT = +e.PORT || 3000, DIR = e.DATA_DIR || path.join(__dirname, 'data'), FILE = path.join(DIR, 'db.json');
const SECRET = e.SESSION_SECRET || (console.warn('SESSION_SECRET is not set: logins reset on every restart.'), crypto.randomBytes(32).toString('hex'));
const rnd = n => crypto.randomInt(n), sh3 = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }, PACKS = [500, 2500, 10000];
const G = {
  coin: { n: 'Coin Flip', k: 'pick', o: 2 }, oe: { n: 'Odd or Even', k: 'pick', o: 2 }, rb: { n: 'Red or Black', k: 'pick', o: 2 },
  dice: { n: 'Dice Roll', k: 'pick', o: 2 }, rps: { n: 'Rock Paper Scissors', k: 'pick', o: 3 }, num: { n: 'Lucky Number', k: 'pick', o: 5 },
  scr: { n: 'Scratch Card', k: 'tiles', t: [0, 0, 0, 1, 2, 2.7] }, box: { n: 'Mystery Box', k: 'tiles', t: [0, 0, 1.5, 2.3] },
  tre: { n: 'Treasure Hunt', k: 'tiles', t: [0, 0, 0, 0, .5, 1, 1.5, 2, 3.5] },
  orb: { n: 'Orbit Spin', k: 'wheel', t: [0, .5, 1, 1.5, 0, 2.5] }, whl: { n: 'Lucky Wheel', k: 'wheel', t: [0, 0, .5, 1, 1.5, 2, 0, 2.5] },
  pli: { n: 'Plinko', k: 'wheel', bin: 1, t: [4, 1.8, .7, .3, .7, 1.8, 4] }, slt: { n: 'Slot Machine', k: 'slots' }, crs: { n: 'Crash Rocket', k: 'crash', o: [1.5, 2, 3, 5] }
};
const seed = () => { const g = {}; for (const k in G) g[k] = { on: true, max: 1000 }; return { users: [], tx: [], reqs: [], st: { w: 0, p: 0 }, cfg: { notice: 'Virtual coins only. Coins have no cash value.', edge: 3, signup: 1000, daily: 100, games: g } }; };
let DB; try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { DB = seed(); }
(function fix() { const s0 = seed(); for (const k in s0) if (!(k in DB)) DB[k] = s0[k]; for (const k in s0.cfg) if (!(k in DB.cfg)) DB.cfg[k] = s0.cfg[k]; for (const k in G) if (!DB.cfg.games[k]) DB.cfg.games[k] = s0.cfg.games[k]; })();
function save() { fs.mkdirSync(DIR, { recursive: true }); const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, FILE); }
const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + mac(b); };
const unsign = t => { try { const [b, s] = String(t).split('.'); if (!same(s, mac(b))) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); return p.exp > Date.now() ? p : null; } catch { return null; } };
const tx = (uid, type, amt, note) => { DB.tx.unshift({ uid, type, amt, note, t: Date.now() }); if (DB.tx.length > 2000) DB.tx.length = 2000; };
const otps = new Map(), hits = new Map();
const limited = (ip, max) => { const n = (hits.get(ip) || []).filter(t => Date.now() - t < 6e4); n.push(Date.now()); hits.set(ip, n); return n.length > max; };
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 6e4)) hits.delete(k); for (const [k, v] of otps) if (now > v.exp) otps.delete(k); }, 6e4).unref();

async function deliver(ch, to, code) {
  if (ch === 'email' && e.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + e.RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: e.MAIL_FROM, to: [to], subject: 'Your PlayZone OTP', text: `Your OTP is ${code}. It expires in 5 minutes.` }) });
    return r.ok;
  }
  if (ch === 'phone' && e.TWILIO_ACCOUNT_SID) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(e.TWILIO_ACCOUNT_SID + ':' + e.TWILIO_AUTH_TOKEN).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: to, From: e.TWILIO_FROM, Body: `Your PlayZone OTP is ${code}` }) });
    return r.ok;
  }
  if (e.OTP_DEV === 'true') { console.log(`[DEV] OTP for ${to}: ${code}`); return true; }
  return false;
}
function userFor(key, name, prov, x) {
  let u = DB.users.find(u => u.key === key);
  if (!u) { u = { id: crypto.randomUUID(), key, name, prov, ...x, bal: DB.cfg.signup, ban: false, joined: Date.now(), last: 0 }; DB.users.push(u); tx(u.id, 'bonus', u.bal, 'Signup bonus'); save(); }
  return u;
}
const tokFor = u => sign({ r: 'u', id: u.id, exp: Date.now() + 30 * 864e5 });
function stateFor(a) {
  if (a.r === 'a') return { ok: true, role: 'admin', uid: 'admin', db: { ...DB, tx: DB.tx.slice(0, 200) } };
  const u = DB.users.find(x => x.id === a.id); if (!u) return { ok: false };
  return { ok: true, role: 'user', uid: u.id, db: { users: [u], reqs: DB.reqs.filter(r => r.uid === u.id), tx: DB.tx.filter(t => t.uid === u.id).slice(0, 50), st: { w: 0, p: 0 }, cfg: { ...DB.cfg, games: Object.fromEntries(Object.entries(DB.cfg.games).map(([k, v]) => [k, { on: v.on, max: v.max }])) } } };
}
function play(u, { game, bet, pick, tile }) {
  const g = G[game], c = DB.cfg.games[game], b = Math.floor(+bet);
  if (!g) return { err: 'Unknown game.' }; if (u.ban) return { err: 'Your account is suspended by admin.' }; if (!c.on) return { err: 'This game is switched off.' };
  if (!(b >= 10 && b <= c.max)) return { err: `Bet between 10 and ${c.max} coins.` }; if (b > u.bal) return { err: 'Not enough coins. Open Wallet to recharge.' };
  const ed = DB.cfg.edge / 100, wp = Number.isFinite(c.wp) ? c.wp : null, win = () => rnd(100) < wp, one = a => a[rnd(a.length)]; let m = 0, o = {};
  if (g.k === 'pick') { const n = g.o, p = Math.floor(+pick); if (!(p >= 0 && p < n)) return { err: 'Pick an option.' }; const w = wp === null ? rnd(n) === 0 : win(), out = w ? p : (p + 1 + rnd(n - 1)) % n; m = w ? n * (1 - ed) : 0; o = { out }; }
  else if (g.k === 'tiles') { const t = Math.floor(+tile); if (!(t >= 0 && t < g.t.length)) return { err: 'Pick a tile.' };
    const sh = a => a.map(x => [x, rnd(1e6)]).sort((a, b) => a[1] - b[1]).map(x => x[0]); let rev;
    if (wp === null) rev = sh(g.t); else { const good = g.t.filter(x => x >= 1), bad = g.t.filter(x => x < 1), pool = win() ? (good.length ? good : bad) : (bad.length ? bad : good), ch = one(pool), rest = [...g.t]; rest.splice(rest.indexOf(ch), 1); rev = sh(rest); rev.splice(t, 0, ch); }
    m = rev[t]; o = { rev, tp: t }; }
  else if (g.k === 'wheel') { let i; if (wp === null) { i = rnd(g.t.length); if (g.bin) { i = 0; for (let k = 0; k < 6; k++) i += rnd(2); } } else { const ids = g.t.map((x, j) => j), good = ids.filter(j => g.t[j] >= 1), bad = ids.filter(j => g.t[j] < 1); i = one(win() ? (good.length ? good : bad) : (bad.length ? bad : good)); } m = g.t[i]; o = { idx: i }; }
  else if (g.k === 'slots') { let r;
    if (wp === null) r = [rnd(5), rnd(5), rnd(5)];
    else if (win()) { const a = rnd(5); if (rnd(13) === 0) r = [a, a, a]; else { const d = (a + 1 + rnd(4)) % 5; r = [a, a, d]; r = sh3(r); } }
    else { const a = rnd(5), b2 = (a + 1 + rnd(4)) % 5; let c2; do c2 = rnd(5); while (c2 === a || c2 === b2); r = [a, b2, c2]; }
    m = r[0] === r[1] && r[1] === r[2] ? 10 : (r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? 1 : 0); o = { reels: r }; }
  else if (g.k === 'crash') { const t = g.o[Math.floor(+pick)]; if (!t) return { err: 'Pick a target.' }; let cp;
    if (wp === null) cp = Math.min(100, (1 - ed) / (1 - rnd(1e9) / 1e9)); else if (win()) cp = t * (1 + 2 * rnd(1e6) / 1e6); else cp = 1 + (t - 1) * (rnd(1e6) / 1e6);
    m = cp >= t ? t : 0; o = { cp }; }
  const w = Math.floor(b * m); u.bal += w - b; DB.st.w += b; DB.st.p += w; tx(u.id, w > b ? 'win' : w === b ? 'push' : 'loss', w - b, `${g.n} ${m.toFixed(2)}x`); save();
  return { ok: true, w, o, bal: u.bal };
}
const A = {
  '/admin/adjust': b => { const u = DB.users.find(x => x.id === b.id); if (u) { const d = Math.max(-1e6, Math.min(1e6, Math.floor(+b.d) || 0)); u.bal = Math.max(0, u.bal + d); tx(u.id, 'admin', d, 'Admin adjustment'); } },
  '/admin/ban': b => { const u = DB.users.find(x => x.id === b.id); if (u) u.ban = !u.ban; },
  '/admin/delete': b => { DB.users = DB.users.filter(x => x.id !== b.id); DB.reqs = DB.reqs.filter(r => r.uid !== b.id); },
  '/admin/resolve': b => { const r = DB.reqs.find(x => x.id === b.id); if (r && r.s === 'pending') { r.s = b.ok ? 'approved' : 'rejected'; const u = DB.users.find(x => x.id === r.uid); if (b.ok && u) { u.bal += r.c; tx(u.id, 'recharge', r.c, 'Recharge approved'); } } },
  '/admin/game': b => { const c = DB.cfg.games[b.id]; if (c) { if ('on' in b) c.on = !!b.on; if ('max' in b) c.max = Math.max(10, Math.floor(+b.max) || 10); if ('wp' in b) c.wp = b.wp === null ? null : Math.max(1, Math.min(100, Math.floor(+b.wp) || 1)); } },
  '/admin/gameall': b => { const v = b.wp === null ? null : Math.max(1, Math.min(100, Math.floor(+b.wp) || 1)); for (const k in DB.cfg.games) DB.cfg.games[k].wp = v; },
  '/admin/cfg': b => { if (b.k === 'notice') DB.cfg.notice = String(b.v).slice(0, 120); else if (['edge', 'signup', 'daily'].includes(b.k)) DB.cfg[b.k] = Math.max(0, Math.min(b.k === 'edge' ? 50 : 1e6, +b.v || 0)); },
  '/admin/reset': () => { DB = seed(); }
};
const server = http.createServer((req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, url = req.url.split('?')[0];
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src https://fonts.gstatic.com; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data: https:");
  const J = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res); }
  if (url === '/health') return J(200, { ok: true });
  if (!url.startsWith('/api/')) return J(404, { ok: false });
  let raw = ''; req.on('data', d => { raw += d; if (raw.length > 1e4) req.destroy(); });
  req.on('end', async () => {
    try {
      const b = raw ? JSON.parse(raw) : {}, a = unsign((req.headers.authorization || '').slice(7)), p = url.slice(4);
      if (p === '/config') return J(200, { googleClientId: e.GOOGLE_CLIENT_ID || '' });
      if (p === '/otp/send') {
        const ch = b.channel, to = String(b.to || '').trim().toLowerCase();
        if (!['email', 'phone'].includes(ch) || (ch === 'email' ? !/^\S+@\S+\.\S+$/.test(to) : !/^\+?\d{8,15}$/.test(to))) return J(400, { ok: false, err: 'Invalid email or phone.' });
        if (limited(ip, 6)) return J(429, { ok: false, err: 'Too many requests. Wait a minute.' });
        const prev = otps.get(ch + ':' + to); if (prev && Date.now() - (prev.sent || 0) < 3e4) return J(429, { ok: false, err: 'OTP already sent. Wait 30 seconds.' });
        const code = String(100000 + rnd(900000)); otps.set(ch + ':' + to, { code, exp: Date.now() + 3e5, tries: 0, sent: Date.now() });
        if (!(await deliver(ch, to, code))) { otps.delete(ch + ':' + to); return J(500, { ok: false, err: 'Could not send OTP. Check the mail or SMS settings.' }); }
        return J(200, { ok: true, dev: e.OTP_DEV === 'true' ? code : undefined });
      }
      if (p === '/otp/verify') {
        const ch = b.channel, to = String(b.to || '').trim().toLowerCase(), k = ch + ':' + to, o = otps.get(k);
        if (!o || Date.now() > o.exp || ++o.tries > 5 || !same(o.code, b.code)) return J(200, { ok: false, err: 'Wrong or expired OTP.' });
        otps.delete(k); const u = ch === 'email' ? userFor('e:' + to, to.split('@')[0], 'email', { email: to }) : userFor('p:' + to, 'Player ' + to.slice(-4), 'phone', { phone: to });
        return J(200, { ok: true, token: tokFor(u) });
      }
      if (p === '/google') {
        if (!e.GOOGLE_CLIENT_ID) return J(200, { ok: false, err: 'Google sign-in is not configured.' });
        const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(b.credential || '')), t = await r.json();
        if (!r.ok || t.aud !== e.GOOGLE_CLIENT_ID || t.email_verified !== 'true') return J(200, { ok: false, err: 'Google sign-in failed.' });
        return J(200, { ok: true, token: tokFor(userFor('g:' + t.email.toLowerCase(), t.name || t.email.split('@')[0], 'google', { email: t.email })) });
      }
      if (p === '/admin/login') {
        if (limited(ip, 8) || limited('admin-global', 30)) return J(429, { ok: false, err: 'Too many attempts. Wait a minute.' });
        if (e.ADMIN_EMAIL && e.ADMIN_PASSWORD && same(String(b.email || '').trim().toLowerCase(), e.ADMIN_EMAIL.toLowerCase()) && same(b.password || '', e.ADMIN_PASSWORD)) return J(200, { ok: true, token: sign({ r: 'a', exp: Date.now() + 12 * 36e5 }) });
        return J(200, { ok: false, err: 'Wrong admin email or password.' });
      }
      if (!a) return J(401, { ok: false, err: 'Please log in again.' });
      if (p === '/state') { const s = stateFor(a); return J(s.ok ? 200 : 401, s); }
      if (a.r === 'a' && A[p]) { A[p](b); save(); return J(200, { ok: true }); }
      const u = a.r === 'u' && DB.users.find(x => x.id === a.id); if (!u) return J(401, { ok: false, err: 'Please log in again.' });
      if (p === '/play') { const r = play(u, b); return J(200, r.err ? { ok: false, err: r.err } : r); }
      if (p === '/daily') { if (Date.now() - u.last < 864e5 || u.ban) return J(200, { ok: false, err: 'Come back tomorrow.' }); u.last = Date.now(); u.bal += DB.cfg.daily; tx(u.id, 'bonus', DB.cfg.daily, 'Daily bonus'); save(); return J(200, { ok: true }); }
      if (p === '/recharge') { if (!PACKS.includes(+b.coins) || DB.reqs.filter(r => r.uid === u.id && r.s === 'pending').length >= 5) return J(200, { ok: false, err: 'Request not allowed.' }); DB.reqs.unshift({ id: crypto.randomUUID(), uid: u.id, c: +b.coins, s: 'pending', t: Date.now() }); save(); return J(200, { ok: true }); }
      return J(404, { ok: false });
    } catch (err) { console.error(err); J(400, { ok: false, err: 'Bad request.' }); }
  });
});
server.listen(PORT, () => console.log('PlayZone running on port ' + PORT));
process.on('unhandledRejection', err => console.error(err));
process.on('SIGTERM', () => { try { save(); } catch {} process.exit(0); });
