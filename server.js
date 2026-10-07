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
const seed = () => { const g = {}; for (const k in G) g[k] = { on: true, max: 1000 }; return { users: [], tx: [], reqs: [], withdrawals: [], st: { w: 0, p: 0 }, cfg: { notice: 'Virtual coins only. Coins have no cash value.', edge: 3, signup: 1000, daily: 100, bgo: 55, bgv: 0, bgt: '', rechargeImage: '', games: g } }; };
let DB; try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { DB = seed(); }
(function fix() { const s0 = seed(); for (const k in s0) if (!(k in DB)) DB[k] = s0[k]; for (const k in s0.cfg) if (!(k in DB.cfg)) DB.cfg[k] = s0.cfg[k]; if (!Array.isArray(DB.withdrawals)) DB.withdrawals = []; if (!Array.isArray(DB.reqs)) DB.reqs = []; for (const k in G) if (!DB.cfg.games[k]) DB.cfg.games[k] = s0.cfg.games[k]; })();
let BG = null, BGT = 'image/jpeg';
const bgFile = () => path.join(DIR, 'bg.bin');
try { if (DB.cfg.bgv) { BG = fs.readFileSync(bgFile()); BGT = DB.cfg.bgt || 'image/jpeg'; } } catch { DB.cfg.bgv = 0; }
const clearBg = () => { BG = null; DB.cfg.bgv = 0; DB.cfg.bgt = ''; try { fs.unlinkSync(bgFile()); } catch {} };
let saveErr = '';
function save() {
  try { fs.mkdirSync(DIR, { recursive: true }); const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, FILE); saveErr = ''; }
  catch (err) { saveErr = 'Cannot write ' + FILE + ' (' + (err.code || err.message) + '). Data is kept in memory only and will be lost on restart.'; console.error(saveErr); }
}
const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const mac = b => crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + mac(b); };
const unsign = t => { try { const [b, s] = String(t).split('.'); if (!same(s, mac(b))) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); return p.exp > Date.now() ? p : null; } catch { return null; } };
const tx = (uid, type, amt, note) => { DB.tx.unshift({ uid, type, amt, note, t: Date.now() }); if (DB.tx.length > 2000) DB.tx.length = 2000; };
const hits = new Map();
const limited = (k, max) => { const n = (hits.get(k) || []).filter(t => Date.now() - t < 6e4); n.push(Date.now()); hits.set(k, n); return n.length > max; };
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < 6e4)) hits.delete(k); }, 6e4).unref();
const ADMIN_USER = String(e.ADMIN_USER || e.ADMIN_EMAIL || 'admin').trim().toLowerCase();
// Passwords: scrypt hash is used to log in. An AES-GCM encrypted copy (key from SESSION_SECRET) lets the admin view a password.
const hashPw = pw => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const checkPw = (u, pw) => { if (!u.ph) return false; const [s, h] = u.ph.split(':'); return same(h, crypto.scryptSync(String(pw), s, 32).toString('hex')); };
const PWKEY = crypto.createHash('sha256').update('pwview:' + SECRET).digest();
const encPw = pw => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', PWKEY, iv), d = Buffer.concat([c.update(pw, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(x => x.toString('base64')).join('.'); };
const decPw = t => { try { const [iv, tag, d] = t.split('.').map(x => Buffer.from(x, 'base64')), c = crypto.createDecipheriv('aes-256-gcm', PWKEY, iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8'); } catch { return null; } };
const setPw = (u, pw) => { u.ph = hashPw(pw); u.pe = encPw(pw); };
const uname = x => String(x || '').trim().toLowerCase(), okUser = x => /^[a-z0-9_.]{3,20}$/.test(x), okPw = x => typeof x === 'string' && x.length >= 6 && x.length <= 64;
const real = () => DB.users.filter(u => !u.isAdmin);
const pub = u => ({ id: u.id, username: u.username || '', phone: u.phone || '', email: u.email || '', bal: u.bal, ban: !!u.ban, joined: u.joined, last: u.last, nopw: !u.ph, multiplier: Math.min(5, Math.max(.1, Number(u.multiplier) || 1)) });
function adminUser(login) {
  let u = DB.users.find(x => x.isAdmin);
  if (!u) { u = { id: 'admin', isAdmin: true, bal: 100000, ban: false, joined: Date.now(), last: 0 }; DB.users.push(u); }
  u.username = ADMIN_USER; if (login && u.bal < 1000) u.bal = 100000; return u;
}
const tokFor = u => sign({ r: 'u', id: u.id, exp: Date.now() + 30 * 864e5 });
function storageInfo() {
  let dbBytes = 0, bgBytes = 0; try { dbBytes = fs.statSync(FILE).size; } catch {} try { bgBytes = fs.statSync(bgFile()).size; } catch {}
  const proofs = DB.reqs.reduce((n,r) => n + (r.proofData ? Buffer.byteLength(r.proofData,'utf8') : 0), 0);
  const rechargeImage = DB.cfg.rechargeImage ? Buffer.byteLength(DB.cfg.rechargeImage,'utf8') : 0;
  return { dbBytes, bgBytes, proofBytes: proofs, rechargeImageBytes: rechargeImage, totalBytes: dbBytes + bgBytes + proofs + rechargeImage, userCount: real().length, txCount: DB.tx.length, reqCount: DB.reqs.length, withdrawalCount: DB.withdrawals.length };
}
function stateFor(a) {
  if (a.r === 'a') return { ok: true, role: 'admin', warn: saveErr, me: pub(adminUser()), db: { users: real().map(pub), reqs: DB.reqs, withdrawals: DB.withdrawals, tx: DB.tx.slice(0, 300), st: DB.st, cfg: DB.cfg, storage: storageInfo() } };
  const u = real().find(x => x.id === a.id); if (!u) return { ok: false };
  const games = Object.fromEntries(Object.entries(DB.cfg.games).map(([k, v]) => [k, { on: v.on, max: v.max }]));
  return { ok: true, role: 'user', me: pub(u), db: { users: [], reqs: DB.reqs.filter(r => r.uid === u.id), withdrawals: DB.withdrawals.filter(r => r.uid === u.id), tx: DB.tx.filter(t => t.uid === u.id).slice(0, 50), st: { w: 0, p: 0 }, cfg: { ...DB.cfg, games } } };
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
  if (m > 1) m = Math.min(5, m * (Number(u.multiplier) || 1)); const w = Math.floor(b * m); u.bal += w - b; if (!u.isAdmin) { DB.st.w += b; DB.st.p += w; } tx(u.id, w > b ? 'win' : w === b ? 'push' : 'loss', w - b, `${g.n} ${m.toFixed(2)}x`); save();
  return { ok: true, w, o, bal: u.bal };
}
const imgData = (data, max=1.8e6) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) return { err: 'Please choose a JPG, PNG or WebP image.' };
  const buf = Buffer.from(m[2], 'base64'); if (buf.length > max) return { err: `Image is too large (max ${Math.round(max/1e6*10)/10} MB).` };
  const t = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.slice(1,4).toString() === 'PNG' ? 'image/png' : buf.slice(0,4).toString() === 'RIFF' && buf.slice(8,12).toString() === 'WEBP' ? 'image/webp' : '';
  if (!t) return { err: 'This file is not a valid image.' }; return { data: String(data), type:t, bytes:buf.length };
};
const A = {
  '/admin/adjust': b => { const u = real().find(x => x.id === b.id); if (u) { const d = Math.max(-1e6, Math.min(1e6, Math.floor(+b.d) || 0)); u.bal = Math.max(0, u.bal + d); tx(u.id, 'admin', d, 'Admin wallet adjustment'); } },
  '/admin/ban': b => { const u = real().find(x => x.id === b.id); if (u) u.ban = !u.ban; },
  '/admin/delete': b => { DB.users = DB.users.filter(x => x.isAdmin || x.id !== b.id); DB.reqs = DB.reqs.filter(r => r.uid !== b.id); DB.withdrawals = DB.withdrawals.filter(r => r.uid !== b.id); DB.tx = DB.tx.filter(t => t.uid !== b.id); },
  '/admin/edit': b => {
    const u = real().find(x => x.id === b.id); if (!u) return { err: 'Player not found.' };
    if ('username' in b) { const n = uname(b.username); if (!okUser(n)) return { err: 'Username: 3 to 20 letters, numbers, _ or .' }; if (n === ADMIN_USER || real().some(x => x.id !== u.id && x.username === n)) return { err: 'That username is already taken.' }; u.username = n; }
    if ('phone' in b) u.phone = String(b.phone).trim().slice(0,20); if ('email' in b) u.email = String(b.email).trim().slice(0,80);
    if ('coins' in b) { const c = Math.max(0, Math.min(1e9, Math.floor(+b.coins) || 0)); if (c !== u.bal) { tx(u.id,'admin',c-u.bal,'Admin set balance'); u.bal=c; } }
    if ('multiplier' in b) u.multiplier = Math.max(.1, Math.min(5, Math.round((+b.multiplier || 1)*100)/100));
  },
  '/admin/setpw': b => { const u=real().find(x=>x.id===b.id); if(!u)return {err:'Player not found.'}; if(!okPw(b.pw))return {err:'Password must be 6 to 64 characters.'}; setPw(u,b.pw); },
  '/admin/viewpw': b => { const u=real().find(x=>x.id===b.id); if(!u)return {err:'Player not found.'}; if(!u.pe)return {err:'No password saved for this player. Set a new one.'}; const pw=decPw(u.pe); return pw===null?{err:'Cannot read it (server secret changed). Set a new password.'}:{pw}; },
  '/admin/resolve': b => { const r=DB.reqs.find(x=>x.id===b.id); if(!r||r.s!=='pending')return; r.s=b.ok?'approved':'rejected'; const u=real().find(x=>x.id===r.uid); if(b.ok&&u){u.bal+=r.c;tx(u.id,'recharge',r.c,'Recharge approved');} delete r.proofData; r.proofDeletedAt=Date.now(); },
  '/admin/withdraw-resolve': b => { const r=DB.withdrawals.find(x=>x.id===b.id); if(!r||r.s!=='pending')return; r.s=b.ok?'approved':'rejected'; const u=real().find(x=>x.id===r.uid); if(!u)return; if(!b.ok){u.bal+=r.c;tx(u.id,'withdrawal-refund',r.c,'Withdrawal rejected/refunded');} else tx(u.id,'withdrawal',-r.c,'Virtual coin withdrawal approved'); },
  '/admin/recharge-user': b => { const u=real().find(x=>x.id===b.id); const c=Math.max(0,Math.min(1e9,Math.floor(+b.coins)||0)); if(!u||!c)return {err:'Enter a valid user and coin amount.'}; u.bal+=c; tx(u.id,'admin-recharge',c,'Admin virtual coin recharge'); },
  '/admin/multiplier': b => { const u=real().find(x=>x.id===b.id); if(!u)return {err:'Player not found.'}; u.multiplier=Math.max(.1,Math.min(5,Math.round((+b.multiplier||1)*100)/100)); },
  '/admin/delete-history': b => { if(b.id){DB.tx=DB.tx.filter(t=>t.uid!==b.id);} else {DB.tx=[]; DB.st={w:0,p:0};} },
  '/admin/clean': () => { const now=Date.now(), cutoff=now-30*864e5; DB.reqs=DB.reqs.filter(r=>r.s==='pending'||r.t>=cutoff); DB.withdrawals=DB.withdrawals.filter(r=>r.s==='pending'||r.t>=cutoff); DB.tx=DB.tx.filter(t=>t.t>=cutoff); },
  '/admin/game': b => { const c=DB.cfg.games[b.id]; if(c){if('on' in b)c.on=!!b.on;if('max' in b)c.max=Math.max(10,Math.floor(+b.max)||10);if('wp' in b)c.wp=b.wp===null?null:Math.max(1,Math.min(100,Math.floor(+b.wp)||1));} },
  '/admin/gameall': b => { const v=b.wp===null?null:Math.max(1,Math.min(100,Math.floor(+b.wp)||1)); for(const k in DB.cfg.games)DB.cfg.games[k].wp=v; },
  '/admin/cfg': b => { if(b.k==='notice')DB.cfg.notice=String(b.v).slice(0,120); else if(['edge','signup','daily','bgo'].includes(b.k))DB.cfg[b.k]=Math.max(0,Math.min(b.k==='edge'?50:b.k==='bgo'?90:1e6,+b.v||0)); },
  '/admin/recharge-image': b => { const x=imgData(b.data); if(x.err)return x; DB.cfg.rechargeImage=x.data; DB.cfg.rechargeImageType=x.type; DB.cfg.rechargeImageAt=Date.now(); },
  '/admin/recharge-image-reset': () => { DB.cfg.rechargeImage=''; DB.cfg.rechargeImageType=''; DB.cfg.rechargeImageAt=0; },
  '/admin/bg': b => { const x=imgData(b.data,1.5e6); if(x.err)return x; BG=Buffer.from(x.data.split(',')[1],'base64'); BGT=x.type; DB.cfg.bgt=x.type; DB.cfg.bgv=Date.now(); try{fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(bgFile(),BG);}catch(err){console.error(err);} },
  '/admin/bgreset': () => clearBg(),
  '/admin/reset': () => { DB=seed(); clearBg(); }
};
const server = http.createServer((req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress, url = req.url.split('?')[0];
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:");
  const J = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res); }
  if (req.method === 'GET' && url === '/bg') { if (!BG) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': BGT, 'Content-Length': BG.length, 'Cache-Control': 'public, max-age=31536000, immutable' }); return res.end(BG); }
  if (url === '/health') return J(200, { ok: true, saved: !saveErr });
  if (!url.startsWith('/api/')) return J(404, { ok: false });
  const lim = url === '/api/admin/bg' ? 2.5e6 : 1e4;
  if (lim > 1e4) { const t0 = unsign((req.headers.authorization || '').slice(7)); if (!t0 || t0.r !== 'a') { res.writeHead(401, { 'Content-Type': 'application/json', Connection: 'close' }); return res.end('{"ok":false,"err":"Please log in again."}'); } }
  let raw = ''; req.on('data', d => { raw += d; if (raw.length > lim) req.destroy(); });
  req.on('end', async () => {
    try {
      const b = raw ? JSON.parse(raw) : {}, a = unsign((req.headers.authorization || '').slice(7)), p = url.slice(4);
      if (p === '/theme') return J(200, { bgv: DB.cfg.bgv || 0, bgo: DB.cfg.bgo });
      if (p === '/auth/signup') {
        const n = uname(b.username);
        if (limited('s:' + ip, 8)) return J(429, { ok: false, err: 'Too many attempts. Wait a minute.' });
        if (!okUser(n)) return J(200, { ok: false, err: 'Username: 3 to 20 letters, numbers, _ or .' });
        if (!okPw(b.password)) return J(200, { ok: false, err: 'Password must be 6 to 64 characters.' });
        if (n === ADMIN_USER || real().some(x => x.username === n)) return J(200, { ok: false, err: 'That username is already taken.' });
        const u = { id: crypto.randomUUID(), username: n, bal: DB.cfg.signup, ban: false, joined: Date.now(), last: 0, multiplier: 1 }; setPw(u, b.password); DB.users.push(u); tx(u.id, 'bonus', u.bal, 'Signup bonus'); save();
        return J(200, { ok: true, token: tokFor(u) });
      }
      if (p === '/auth/login') {
        const n = uname(b.username), pw = String(b.password || '');
        if (limited('l:' + ip, 20) || limited('u:' + n, 10) || limited('login-global', 120)) return J(429, { ok: false, err: 'Too many attempts. Wait a minute.' });
        if (n === ADMIN_USER && e.ADMIN_PASSWORD) {
          if (!same(pw, e.ADMIN_PASSWORD)) return J(200, { ok: false, err: 'Wrong username or password.' });
          adminUser(true); save(); return J(200, { ok: true, token: sign({ r: 'a', exp: Date.now() + 12 * 36e5 }) });
        }
        const u = real().find(x => x.username === n);
        if (!u || !checkPw(u, pw)) return J(200, { ok: false, err: 'Wrong username or password.' });
        return J(200, { ok: true, token: tokFor(u) });
      }
      if (!a) return J(401, { ok: false, err: 'Please log in again.' });
      if (p === '/state') { const s = stateFor(a); return J(s.ok ? 200 : 401, s); }
      if (a.r === 'a' && A[p]) { const r = A[p](b) || {}; if (r.err) return J(200, { ok: false, err: r.err }); save(); return J(200, { ok: true, ...r }); }
      const u = a.r === 'a' ? adminUser() : real().find(x => x.id === a.id); if (!u) return J(401, { ok: false, err: 'Please log in again.' });
      if (p === '/play') { const r = play(u, b); return J(200, r.err ? { ok: false, err: r.err } : r); }
      if (p === '/daily') { if (Date.now() - u.last < 864e5 || u.ban) return J(200, { ok: false, err: 'Come back tomorrow.' }); u.last = Date.now(); u.bal += DB.cfg.daily; tx(u.id, 'bonus', DB.cfg.daily, 'Daily bonus'); save(); return J(200, { ok: true }); }
      if (p === '/recharge') {
        const coins=Math.max(0,Math.min(1e7,Math.floor(+b.coins)||0)); if(coins<1)return J(200,{ok:false,err:'Enter a valid recharge amount.'});
        if(DB.reqs.filter(r=>r.uid===u.id&&r.s==='pending').length>=5)return J(200,{ok:false,err:'Too many pending recharge requests.'});
        const proof=imgData(b.proofData,1.8e6); if(proof.err)return J(200,{ok:false,err:proof.err});
        DB.reqs.unshift({id:crypto.randomUUID(),kind:'recharge',uid:u.id,c:coins,s:'pending',t:Date.now(),proofData:proof.data,proofType:proof.type}); save(); return J(200,{ok:true});
      }
      if (p === '/withdraw') {
        const coins=Math.floor(+b.coins)||0; if(coins<1)return J(200,{ok:false,err:'Enter a valid withdrawal amount.'}); if(coins>u.bal)return J(200,{ok:false,err:'Not enough virtual coins.'});
        if(DB.withdrawals.filter(r=>r.uid===u.id&&r.s==='pending').length>=3)return J(200,{ok:false,err:'Too many pending withdrawal requests.'});
        u.bal-=coins; DB.withdrawals.unshift({id:crypto.randomUUID(),uid:u.id,c:coins,s:'pending',t:Date.now(),note:String(b.note||'').slice(0,200)}); tx(u.id,'withdrawal-request',-coins,'Withdrawal request'); save(); return J(200,{ok:true,bal:u.bal});
      }
      if (p === '/delete-account') {
        if(!checkPw(u,String(b.password||'')))return J(200,{ok:false,err:'Wrong password.'});
        DB.users=DB.users.filter(x=>x.id!==u.id); DB.reqs=DB.reqs.filter(r=>r.uid!==u.id); DB.withdrawals=DB.withdrawals.filter(r=>r.uid!==u.id); DB.tx=DB.tx.filter(t=>t.uid!==u.id); save(); return J(200,{ok:true,deleted:true});
      }
      return J(404, { ok: false });
    } catch (err) { console.error(err); if (!res.headersSent) J(err instanceof SyntaxError ? 400 : 500, { ok: false, err: err instanceof SyntaxError ? 'Bad request.' : 'Server error. Please try again.' }); }
  });
});
server.listen(PORT, () => console.log('PlayZone running on port ' + PORT));
process.on('unhandledRejection', err => console.error(err));
process.on('SIGTERM', () => { try { save(); } catch {} process.exit(0); });
