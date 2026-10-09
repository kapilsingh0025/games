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
  pli: { n: 'Plinko', k: 'wheel', bin: 1, t: [4, 1.8, .9, 0, .9, 1.8, 4] }, slt: { n: 'Slot Machine', k: 'slots' }, crs: { n: 'Crash Rocket', k: 'crash', o: [1.5, 2, 3, 5] }, ldo: { n: 'Ludo', k: 'ludo' }
};
const seed = () => { const g = {}; for (const k in G) g[k] = { on: true, max: 1000 }; return { users: [], tx: [], reqs: [], wreqs: [], esc: [], st: { w: 0, p: 0 }, cfg: { notice: 'Virtual coins only. Coins have no cash value.', edge: 3, signup: 1000, daily: 100, rmin: 10, rmax: 100000, maxMult: 10, bgv: 0, bgt: '', bgo: 55, games: g } }; };
let DB; try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { DB = seed(); }
(function fix() { const s0 = seed(); for (const k in s0) if (!(k in DB)) DB[k] = s0[k]; for (const k in s0.cfg) if (!(k in DB.cfg)) DB.cfg[k] = s0.cfg[k]; for (const k in G) if (!DB.cfg.games[k]) DB.cfg.games[k] = s0.cfg.games[k]; })();
let BG = null, BGT = 'image/jpeg';
const bgFile = () => path.join(DIR, 'bg.bin');
try { if (DB.cfg.bgv) { BG = fs.readFileSync(bgFile()); BGT = DB.cfg.bgt || 'image/jpeg'; } } catch { DB.cfg.bgv = 0; }
const clearBg = () => { BG = null; DB.cfg.bgv = 0; DB.cfg.bgt = ''; try { fs.unlinkSync(bgFile()); } catch {} };
let saveErr = '';
function storageInfo() {
  let db = 0, disk = null; try { db = fs.statSync(FILE).size; } catch { db = Buffer.byteLength(JSON.stringify(DB)); }
  try { const st = fs.statfsSync(DIR); disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize }; } catch {}
  return { db, bg: BG ? BG.length : 0, users: DB.users.filter(u => !u.isAdmin).length, tx: DB.tx.length, txMax: 2000, reqs: DB.reqs.length, disk, ok: !saveErr };
}
function save() {
  try { fs.mkdirSync(DIR, { recursive: true }); const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, FILE); saveErr = ''; }
  catch (err) { saveErr = 'Cannot write ' + FILE + ' (' + (err.code || err.message) + '). Data is kept in memory only and will be lost on restart.'; console.error(saveErr); }
}
if (DB.esc && DB.esc.length) { DB.esc.forEach(x => x.uids.forEach(id => { const u = DB.users.find(y => y.id === id); if (u) u.bal += x.stake; })); DB.esc = []; save(); console.log('Ludo: returned stakes of matches interrupted by a restart.'); } const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
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
const pub = u => ({ id: u.id, username: u.username || '', phone: u.phone || '', email: u.email || '', bal: u.bal, ban: !!u.ban, joined: u.joined, last: u.last, nopw: !u.ph });
function adminUser(login) {
  let u = DB.users.find(x => x.isAdmin);
  if (!u) { u = { id: 'admin', isAdmin: true, bal: 100000, ban: false, joined: Date.now(), last: 0 }; DB.users.push(u); }
  u.username = ADMIN_USER; if (login && u.bal < 1000) u.bal = 100000; return u;
}
const tokFor = u => sign({ r: 'u', id: u.id, exp: Date.now() + 30 * 864e5 });
function stateFor(a) {
  if (a.r === 'a') return { ok: true, role: 'admin', warn: saveErr, store: storageInfo(), me: pub(adminUser()), db: { users: real().map(pub), reqs: DB.reqs, wreqs: DB.wreqs || [], tx: DB.tx.slice(0, 300), st: DB.st, cfg: DB.cfg } };
  const u = real().find(x => x.id === a.id); if (!u) return { ok: false };
  const games = Object.fromEntries(Object.entries(DB.cfg.games).map(([k, v]) => [k, { on: v.on, max: v.max }]));
  return { ok: true, role: 'user', me: pub(u), db: { users: [], reqs: DB.reqs.filter(r => r.uid === u.id), wreqs: (DB.wreqs || []).filter(r => r.uid === u.id), tx: DB.tx.filter(t => t.uid === u.id).slice(0, 50), st: { w: 0, p: 0 }, cfg: { ...DB.cfg, games } } };
}
const shuffle = a => a.map(x => [x, rnd(1e6)]).sort((p, q) => p[1] - q[1]).map(x => x[0]);
function nat(g, x, ed) { // one natural round -> { o: what to show, m: payout multiple }
  if (g.k === 'pick') { const n = g.o, w = rnd(n) === 0; return { o: { out: w ? x.pick : (x.pick + 1 + rnd(n - 1)) % n }, m: w ? n * (1 - ed) : 0 }; }
  if (g.k === 'tiles') { const rev = shuffle(g.t); return { o: { rev, tp: x.tile }, m: rev[x.tile] }; }
  if (g.k === 'wheel') { let i = rnd(g.t.length); if (g.bin) { i = 0; for (let k = 0; k < 6; k++) i += rnd(2); } return { o: { idx: i }, m: g.t[i] }; }
  if (g.k === 'slots') { const r = [rnd(5), rnd(5), rnd(5)]; return { o: { reels: r }, m: r[0] === r[1] && r[1] === r[2] ? 10 : r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? 1 : 0 }; }
  const cp = Math.min(100, Math.max(1, Math.floor(100 * (1 - ed) / (1 - rnd(1e9) / 1e9)) / 100)); return { o: { cp }, m: cp >= x.tgt ? x.tgt : 0 };
}
// WIN RULE: any payout above 0x is a win; only 0x is a loss. // mult (K) = the player's chosen winning multiplier, 1x up to cfg.maxMult. Wins become K times rarer and pay K times more, // so the long-run payout stays the same at every multiplier. The player cannot set the difficulty directly: it follows K.
const r2 = v => Math.round(v * 100) / 100; function play(u, { game, bet, pick, tile, mult }) {   const g = G[game], c = DB.cfg.games[game], b = Math.floor(+bet);   if (!g || g.k === 'ludo') return { err: 'Unknown game.' }; if (u.ban) return { err: 'Your account is suspended by admin.' }; if (!c.on) return { err: 'This game is switched off.' };   if (!(b >= 10 && b <= c.max)) return { err: `Bet between 10 and ${c.max} coins.` }; if (b > u.bal) return { err: 'Not enough coins. Open Wallet to recharge.' };   const ed = DB.cfg.edge / 100, wp = Number.isFinite(c.wp) ? c.wp : null, rf = () => rnd(1e9) / 1e9, K = Math.max(1, Math.min(DB.cfg.maxMult || 10, r2(+mult || 1))), x = { pick: Math.floor(+pick), tile: Math.floor(+tile), tgt: 0 };   if (g.k === 'pick' && !(x.pick >= 0 && x.pick < g.o)) return { err: 'Pick an option.' };   if (g.k === 'tiles' && !(x.tile >= 0 && x.tile < g.t.length)) return { err: 'Pick a tile.' };   if (g.k === 'crash') { x.tgt = g.o[x.pick]; if (!x.tgt) return { err: 'Pick a target.' }; }   const isWin = q => q.m > 0; let r = nat(g, x, ed);   if (wp !== null) { const want = rf() < wp / 100 / K; for (let i = 0; i < 400 && isWin(r) !== want; i++) r = nat(g, x, ed); }   else if (K > 1 && isWin(r) && rf() >= 1 / K) { for (let i = 0; i < 400 && isWin(r); i++) r = nat(g, x, ed); }   const win = isWin(r), m = win ? r.m * K : 0, o = r.o;   if (g.k === 'tiles') o.rev = o.rev.map(v => v > 0 ? r2(v * K) : 0);   const w = win ? Math.max(1, Math.floor(b * m)) : 0; u.bal += w - b; if (!u.isAdmin) { DB.st.w += b; DB.st.p += w; }   tx(u.id, w > 0 ? 'win' : 'loss', w - b, `${g.n} ${r2(m).toFixed(2)}x${K > 1 ? ' (winning multiplier ' + K + 'x)' : ''}`); save();   return { ok: true, w, m: r2(m), o, bal: u.bal, k: K }; } 
// ---------- Ludo: 2, 3 or 4 players. Live chat is relayed only and never persisted. ----------
const LUDO = new Map(), LUSER = new Map(), LSSE = new Map(), LDISC = new Map(), LSTART = [0, 13, 26, 39], LSAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]), LTURN = 45000, LGRACE = 30000;
const lcell = (pl, s) => (LSTART[pl] + s) % 52, lname = u => u.username || 'player';
const lsend = (uid, o) => { const st = LSSE.get(uid); if (st) { const d = 'data: ' + JSON.stringify(o) + '\n\n'; st.forEach(r => { try { r.write(d); } catch {} }); } };
const lactive=m=>m.active||m.p.map(()=>true), lcount=m=>lactive(m).filter(Boolean).length;
const lnext=(m,from)=>{const active=lactive(m);for(let n=1;n<=m.need;n++){const i=(from+n)%m.need;if(active[i])return i}return from;};
function llegal(m) { const d=m.dice,out=[]; if(!d)return out; (m.tk[m.turn]||[]).forEach((s,i)=>{if(s===-1?d===6:s+d<=56)out.push(i)}); return out; }
const lview=(m,uid)=>{const me=m.p.indexOf(uid),active=lactive(m);return{id:m.id,status:m.status,stake:0,players:m.need,activePlayers:lcount(m),joined:m.p.filter(Boolean).length,me,names:m.n,active,targetName:m.targetName||'',meName:m.n[me]||'',tk:m.tk,turn:m.turn,dice:m.dice,legal:m.status==='play'&&me===m.turn&&active[me]?llegal(m):[],last:m.last,win:m.win,pay:0,why:m.why,tl:Math.max(0,Math.ceil((m.turnAt+LTURN-Date.now())/1000))};};
const lpush=m=>m.p.forEach(id=>{if(id)lsend(id,{type:'state',m:lview(m,id)});});
const lesc=m=>{DB.esc=(DB.esc||[]).filter(e=>e.id!==m.id);if(m.stake&&m.status==='wait'||m.stake&&m.status==='play')DB.esc.push({id:m.id,uids:m.p.slice(),stake:m.stake});};
function ludoDrop(m){m.status='gone';LUDO.delete(m.id);m.p.forEach(id=>{LUSER.delete(id);lsend(id,{type:'none'});});if(m.target)lsend(m.target,{type:'none'});lesc(m);save();}
function ludoEnd(m,w,why){if(m.status==='done')return;m.status='done';m.win=w;m.why=why;m.dice=null;m.pay=0;m.p.forEach(id=>{if(id){LUSER.delete(id);clearTimeout(LDISC.get(id));LDISC.delete(id);}});save();lpush(m);setTimeout(()=>LUDO.delete(m.id),6e4).unref();}
function ludoEliminate(m,pl,why){const active=lactive(m);if(!active[pl])return;const wasTurn=m.turn===pl;active[pl]=false;LUSER.delete(m.p[pl]);m.last={by:pl,d:wasTurn?m.dice||0:0,note:(m.n[pl]||'A player')+' '+(why==='timeout'?'was removed for inactivity':'left the game')};if(wasTurn){m.dice=null;m.sixes=0;}const remaining=active.map((on,i)=>on?i:-1).filter(i=>i>=0);if(remaining.length<=1){ludoEnd(m,remaining[0]??-1,why);return;}if(wasTurn)m.turn=lnext(m,pl);m.turnAt=Date.now();lpush(m);}
function ludoLeaveId(uid,why='left'){clearTimeout(LDISC.get(uid));LDISC.delete(uid);const m=LUDO.get(LUSER.get(uid));if(!m){ludoDecline(uid);return{};}const me=m.p.indexOf(uid);if(m.status==='wait'){ludoDrop(m);return{};}if(m.status==='play')ludoEliminate(m,me,why);return{};}
function ludoRoll(m){const d=rnd(6)+1;m.dice=d;m.sixes=d===6?m.sixes+1:0;m.last={by:m.turn,d,note:''};if(m.sixes>=3){m.last.note='Three sixes in a row - turn lost';m.dice=null;m.sixes=0;m.turn=lnext(m,m.turn);}else if(!llegal(m).length){m.last.note='No move possible';m.dice=null;m.sixes=0;m.turn=lnext(m,m.turn);}m.turnAt=Date.now();}
function ludoMove(m,i){const pl=m.turn,d=m.dice,t=m.tk[pl];let extra=d===6,note='';if(t[i]===-1){if(d!==6)return;t[i]=0;}else{t[i]+=d;}const s=t[i];if(s===56){extra=true;note='A token reached home';}else if(s<=50&&!LSAFE.has(lcell(pl,s))){let hit=0;for(let q=0;q<m.need;q++){if(q===pl||!lactive(m)[q])continue;m.tk[q].forEach((os,j,o)=>{if(os>=0&&os<=50&&lcell(q,os)===lcell(pl,s)){o[j]=-1;hit++;}});}if(hit){extra=true;note='Captured '+hit+(hit>1?' tokens':' token');}}m.last={by:pl,d,note};m.dice=null;m.turnAt=Date.now();if(t.every(x=>x===56))return ludoEnd(m,pl,'won');if(!extra){m.sixes=0;m.turn=lnext(m,pl);}}
function ludoAuto(m){const pl=m.turn;m.idle[pl]++;if(m.idle[pl]>=3)return ludoEliminate(m,pl,'timeout');if(!m.dice)ludoRoll(m);if(m.dice){const l=llegal(m);if(l.length)ludoMove(m,l[rnd(l.length)]);else{m.dice=null;m.turn=lnext(m,pl);}}m.turnAt=Date.now();lpush(m);}
function ludoJoin(u,stakeIn,needIn,friend,accept){
  const c=DB.cfg.games.ldo, need=Math.max(2,Math.min(4,Math.floor(+needIn)||2));
  if(u.ban)return{err:'Your account is suspended by admin.'};
  if(!c.on)return{err:'This game is switched off.'};
  if(accept){
    const m=[...LUDO.values()].find(x=>x.status==='wait'&&x.target===u.id&&x.p.length<x.need);
    if(!m)return{err:'No pending invite for you.'};
    m.p.push(u.id);m.n.push(lname(u));m.tk.push([-1,-1,-1,-1]);m.idle.push(0);m.active.push(true);delete m.target;m.targetName='';
    if(m.p.length===m.need){if(rnd(2)){m.p.reverse();m.n.reverse();m.tk.reverse();m.idle.reverse();m.active.reverse();}m.status='play';m.turn=0;m.turnAt=Date.now();}
    LUSER.set(u.id,m.id);LDISC.delete(u.id);save();lpush(m);return{m:lview(m,u.id)};
  }
  const friendName=uname(friend||'');
  let target=null;
  if(friendName){
    target=real().find(x=>x.username===friendName);
    if(!target)return{err:'Friend username not found.'};
    if(target.id===u.id)return{err:'You cannot invite yourself.'};
    if(LUSER.has(target.id))return{err:'That friend is already in a Ludo match.'};
    if([...LUDO.values()].some(x=>x.status==='wait'&&x.target===target.id))return{err:'That friend already has a pending Ludo invite.'};
    const existing=[...LUDO.values()].find(x=>x.status==='wait'&&x.target===target.id&&x.p[0]===u.id);
    if(existing)return{err:'Invite already sent. Waiting for your friend.'};
  }
  if(!accept&&[...LUDO.values()].some(x=>x.status==='wait'&&x.target===u.id))return{err:'Accept or decline your pending Ludo invite first.'};
  let m=[...LUDO.values()].find(x=>x.status==='wait'&&!x.target&&x.need===need&&x.p.length<need&&x.p[0]!==u.id);
  if(target)m=null;
  if(m){
    m.p.push(u.id);m.n.push(lname(u));m.tk.push([-1,-1,-1,-1]);m.idle.push(0);m.active.push(true);
    if(m.p.length===need){if(rnd(2)){m.p.reverse();m.n.reverse();m.tk.reverse();m.idle.reverse();m.active.reverse();}m.status='play';m.turn=0;m.turnAt=Date.now();}
  }else{
    m={id:crypto.randomUUID(),status:'wait',stake:0,need,p:[u.id],n:[lname(u)],tk:[[-1,-1,-1,-1]],active:[true],turn:0,dice:null,sixes:0,mk:Date.now(),turnAt:Date.now(),idle:[0],last:null,win:-1,pay:0,why:'',target:target?target.id:null,targetName:target?target.username:''};
    LUDO.set(m.id,m);
    if(target)lsend(target.id,{type:'invite',invite:{status:'invite',id:m.id,players:m.need,from:lname(u)}});
  }
  LUSER.set(u.id,m.id);LDISC.delete(u.id);save();lpush(m);return{m:lview(m,u.id)};
}
function ludoDecline(uid){const inv=[...LUDO.values()].find(x=>x.status==='wait'&&x.target===uid);if(!inv)return{};const from=inv.p[0];ludoDrop(inv);lsend(uid,{type:'none'});if(from)lsend(from,{type:'invite_declined'});return{};}
function ludoApi(u,p,b){
  let m=LUDO.get(LUSER.get(u.id));
  if(p==='/ludo/state'){
    if(m)return{m:lview(m,u.id)};
    const inv=[...LUDO.values()].find(x=>x.status==='wait'&&x.target===u.id);
    if(inv)return{invite:{status:'invite',id:inv.id,players:inv.need,stake:inv.stake,from:inv.n[0]||'Friend'}};
    return{};
  }
  if(p==='/ludo/join')return m?{err:'You are already in a match.'}:ludoJoin(u,b.stake,b.players,b.friend,b.accept);
  if(p==='/ludo/leave')return ludoLeaveId(u.id);
  if(p==='/ludo/decline')return ludoDecline(u.id);
  if(!m||m.status!=='play')return{err:'No active match.'};
  const me=m.p.indexOf(u.id);
  if(p==='/ludo/chat'){const text=String(b.text||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,200);if(!text)return{err:'Type a message first.'};m.p.forEach(id=>lsend(id,{type:'chat',from:me,text,t:Date.now()}));return{};}
  if(me!==m.turn)return{err:'It is not your turn.'};
  if(p==='/ludo/roll'){if(m.dice)return{err:'Move a token first.'};m.idle[me]=0;ludoRoll(m);}
  else if(p==='/ludo/move'){const i=Math.floor(+b.t);if(!m.dice||!llegal(m).includes(i))return{err:'That move is not allowed.'};m.idle[me]=0;ludoMove(m,i);}
  else return{err:'Unknown action.'};
  lpush(m);return{m:lview(m,u.id)};
}
setInterval(()=>{const now=Date.now();for(const m of [...LUDO.values()]){try{if(m.status==='wait'&&now-m.mk>12e4){m.p.forEach(id=>{const u=DB.users.find(x=>x.id===id);if(u)u.bal+=m.stake;});ludoDrop(m);}else if(m.status==='play'&&now-m.turnAt>LTURN)ludoAuto(m);}catch(err){console.error(err);}}},5000).unref();
const A = {
  '/admin/adjust': b => {
    const u = real().find(x => x.id === b.id); if (!u) return { err: 'Player not found.' };
    const d = Math.max(-1e7, Math.min(1e7, Math.floor(+b.d) || 0)); if (!d) return { err: 'Enter an amount.' };
    const nb = Math.max(0, u.bal + d), got = nb - u.bal; u.bal = nb; tx(u.id, d > 0 ? 'recharge' : 'admin', got, d > 0 ? 'Admin recharge' : 'Admin deduction'); return { bal: u.bal };
  },
  '/admin/clean': b => {
    const bet = t => t.type === 'win' || t.type === 'loss' || t.type === 'push', n0 = DB.tx.length, r0 = DB.reqs.length, ids = new Set(DB.users.map(u => u.id));
    if (b.what === 'bets') DB.tx = DB.tx.filter(t => !bet(t));
    else if (b.what === 'old') { const cut = Date.now() - Math.max(1, Math.min(3650, Math.floor(+b.days) || 30)) * 864e5; DB.tx = DB.tx.filter(t => !(bet(t) && t.t < cut)); }
    else if (b.what === 'user') { if (!real().some(u => u.id === b.id)) return { err: 'Player not found.' }; DB.tx = DB.tx.filter(t => !(t.uid === b.id && bet(t))); }
    else if (b.what === 'clean') { const cut = Date.now() - 30 * 864e5; DB.tx = DB.tx.filter(t => ids.has(t.uid) && !(bet(t) && t.t < cut)); DB.reqs = DB.reqs.filter(r => ids.has(r.uid) && r.s === 'pending'); }
    else return { err: 'Unknown action.' };
    return { removedTx: n0 - DB.tx.length, removedReqs: r0 - DB.reqs.length };
  },
  '/admin/ban': b => { const u = real().find(x => x.id === b.id); if (u) u.ban = !u.ban; },
  '/admin/delete': b => { ludoLeaveId(b.id); DB.users = DB.users.filter(x => x.isAdmin || x.id !== b.id); DB.reqs = DB.reqs.filter(r => r.uid !== b.id); },
  '/admin/edit': b => {
    const u = real().find(x => x.id === b.id); if (!u) return { err: 'Player not found.' };
    if ('username' in b) { const n = uname(b.username); if (!okUser(n)) return { err: 'Username: 3 to 20 letters, numbers, _ or .' }; if (n === ADMIN_USER || real().some(x => x.id !== u.id && x.username === n)) return { err: 'That username is already taken.' }; u.username = n; }
    if ('phone' in b) u.phone = String(b.phone).trim().slice(0, 20);
    if ('email' in b) u.email = String(b.email).trim().slice(0, 80);
    if ('coins' in b) { const c = Math.max(0, Math.min(1e9, Math.floor(+b.coins) || 0)); if (c !== u.bal) { tx(u.id, 'admin', c - u.bal, 'Admin set balance'); u.bal = c; } }
  },
  '/admin/setpw': b => { const u = real().find(x => x.id === b.id); if (!u) return { err: 'Player not found.' }; if (!okPw(b.pw)) return { err: 'Password must be 6 to 64 characters.' }; setPw(u, b.pw); },
  '/admin/viewpw': b => { const u = real().find(x => x.id === b.id); if (!u) return { err: 'Player not found.' }; if (!u.pe) return { err: 'No password saved for this player. Set a new one.' }; const pw = decPw(u.pe); return pw === null ? { err: 'Cannot read it (server secret changed). Set a new password.' } : { pw }; },
  '/admin/resolve': b => { const r = DB.reqs.find(x => x.id === b.id); if (r && r.s === 'pending') { r.s = b.ok ? 'approved' : 'rejected'; const u = real().find(x => x.id === r.uid); if (b.ok && u) { u.bal += r.c; tx(u.id, 'recharge', r.c, 'Recharge approved'); } } },
  '/admin/game': b => { const c = DB.cfg.games[b.id]; if (c) { if ('on' in b) c.on = !!b.on; if ('max' in b) c.max = Math.max(10, Math.floor(+b.max) || 10); if ('wp' in b) c.wp = b.wp === null ? null : Math.max(1, Math.min(100, Math.floor(+b.wp) || 1)); } },
  '/admin/gameall': b => { const v = b.wp === null ? null : Math.max(1, Math.min(100, Math.floor(+b.wp) || 1)); for (const k in DB.cfg.games) DB.cfg.games[k].wp = v; },
  '/admin/resolve-withdraw': b => { const r = (DB.wreqs || []).find(x => x.id === b.id); if (!r || r.s !== 'pending') return; r.s = b.ok ? 'approved' : 'rejected'; if (!b.ok) { const u = real().find(x => x.id === r.uid); if (u) { u.bal += r.c; tx(u.id, 'withdraw_refund', r.c, 'Withdrawal rejected - coins returned'); } } },
  '/admin/cfg': b => {     const L = { edge: [0, 50], signup: [0, 1e6], daily: [0, 1e6], bgo: [0, 90], rmin: [1, 1e6], rmax: [1, 1e7], maxMult: [1, 100] };     if (b.k === 'notice') DB.cfg.notice = String(b.v).slice(0, 120);     else if (L[b.k]) { DB.cfg[b.k] = Math.max(L[b.k][0], Math.min(L[b.k][1], Math.floor(+b.v) || L[b.k][0])); if (DB.cfg.rmin > DB.cfg.rmax) { if (b.k === 'rmax') DB.cfg.rmin = DB.cfg.rmax; else DB.cfg.rmax = DB.cfg.rmin; } }   },
  '/admin/bg': b => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || '')); if (!m) return { err: 'Please choose a JPG, PNG or WebP image.' };
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 1.5e6) return { err: 'Image is too large (max 1.5 MB).' };
    const t = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf.slice(1, 4).toString() === 'PNG' ? 'image/png' : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : '';
    if (!t) return { err: 'This file is not a valid image.' };
    BG = buf; BGT = t; DB.cfg.bgt = t; DB.cfg.bgv = Date.now();
    try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(bgFile(), buf); } catch (err) { console.error('Cannot save background file:', err.code || err.message); }
  },
  '/admin/bgreset': () => { clearBg(); },
  '/admin/reset': () => { LUDO.clear(); LUSER.clear(); DB = seed(); clearBg(); }
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
        const u = { id: crypto.randomUUID(), username: n, bal: DB.cfg.signup, ban: false, joined: Date.now(), last: 0 }; setPw(u, b.password); DB.users.push(u); tx(u.id, 'bonus', u.bal, 'Signup bonus'); save();
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
      if (p === '/account/delete') {
        if (u.isAdmin) return J(200, { ok: false, err: 'The admin account cannot be deleted here.' });
        if (limited('d:' + u.id, 5)) return J(429, { ok: false, err: 'Too many attempts. Wait a minute.' });
        if (!u.ph) return J(200, { ok: false, err: 'No password is set for this account. Ask the admin to set one.' });
        if (!checkPw(u, b.password)) return J(200, { ok: false, err: 'Wrong password.' });
        ludoLeaveId(u.id); DB.users = DB.users.filter(x => x.id !== u.id); DB.tx = DB.tx.filter(t => t.uid !== u.id); DB.reqs = DB.reqs.filter(r => r.uid !== u.id); save();
        return J(200, { ok: true });
      }
      if (p === '/ludo/stream') {
        req.socket.setTimeout(0);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        clearTimeout(LDISC.get(u.id));
        LDISC.delete(u.id);
        let set = LSSE.get(u.id);
        if (!set) LSSE.set(u.id, set = new Set());
        set.add(res);
        const lm = LUDO.get(LUSER.get(u.id));
        const invite = lm ? null : [...LUDO.values()].find(x => x.status === 'wait' && x.target === u.id);
        const initial = lm ? { type: 'state', m: lview(lm, u.id) } : invite ? { type: 'invite', invite: { status: 'invite', id: invite.id, players: invite.need, from: invite.n[0] || 'Friend' } } : { type: 'none' };
        res.write('retry: 2000\n\ndata: ' + JSON.stringify(initial) + '\n\n');
        const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 15000);
        res.on('close', () => {
          clearInterval(hb);
          set.delete(res);
          if (set.size || LSSE.get(u.id) !== set) return;
          LSSE.delete(u.id);
          const activeMatch = LUDO.get(LUSER.get(u.id));
          if (!activeMatch || activeMatch.status !== 'play') return;
          const timer = setTimeout(() => {
            LDISC.delete(u.id);
            if (!LSSE.has(u.id)) ludoLeaveId(u.id, 'disconnect');
          }, LGRACE);
          LDISC.set(u.id, timer);
          timer.unref();
        });
        return;
      }
      if (p.startsWith('/ludo/')) { if (limited('g:' + u.id, 150)) return J(429, { ok: false, err: 'Too many requests. Wait a moment.' }); const r = ludoApi(u, p, b); return J(200, r.err ? { ok: false, err: r.err } : { ok: true, ...r }); }       if (p === '/play') { const r = play(u, b); return J(200, r.err ? { ok: false, err: r.err } : r); }
      if (p === '/daily') { if (Date.now() - u.last < 864e5 || u.ban) return J(200, { ok: false, err: 'Come back tomorrow.' }); u.last = Date.now(); u.bal += DB.cfg.daily; tx(u.id, 'bonus', DB.cfg.daily, 'Daily bonus'); save(); return J(200, { ok: true }); }
      if (p === '/recharge') {
        const c = Math.floor(+b.coins), lo = DB.cfg.rmin || 10, hi = DB.cfg.rmax || 100000;
        if (limited('r:' + u.id, 12)) return J(429, { ok: false, err: 'Too many recharge attempts. Wait a minute.' });
        if (!(c >= lo && c <= hi)) return J(200, { ok: false, err: `Enter an amount from ${lo.toLocaleString()} to ${hi.toLocaleString()} coins.` });
        if (DB.reqs.filter(r => r.uid === u.id && r.s === 'pending').length >= 5) return J(200, { ok: false, err: 'You already have 5 pending recharge requests. Wait for admin approval.' });
        DB.reqs.unshift({ id: crypto.randomUUID(), uid: u.id, c, s: 'pending', t: Date.now() }); save(); return J(200, { ok: true });
      }
      if (p === '/withdraw') {
        const c = Math.floor(+b.coins), lo = 10, hi = Math.max(lo, Math.min(100000, u.bal));
        if (limited('wd:' + u.id, 8)) return J(429, { ok: false, err: 'Too many withdrawal attempts. Wait a minute.' });
        if (!(c >= lo && c <= hi)) return J(200, { ok: false, err: `Enter an amount from ${lo.toLocaleString()} to ${hi.toLocaleString()} coins.` });
        if ((DB.wreqs || []).filter(r => r.uid === u.id && r.s === 'pending').length >= 3) return J(200, { ok: false, err: 'You already have 3 pending virtual withdrawals.' });
        u.bal -= c;
        if (!DB.wreqs) DB.wreqs = [];
        DB.wreqs.unshift({ id: crypto.randomUUID(), uid: u.id, c, s: 'pending', t: Date.now() });
        tx(u.id, 'withdraw_request', -c, 'Virtual withdrawal requested'); save(); return J(200, { ok: true });
      }
      return J(404, { ok: false });
    } catch (err) { console.error(err); if (!res.headersSent) J(err instanceof SyntaxError ? 400 : 500, { ok: false, err: err instanceof SyntaxError ? 'Bad request.' : 'Server error. Please try again.' }); }
  });
});
server.listen(PORT, () => console.log('PlayZone running on port ' + PORT));
process.on('unhandledRejection', err => console.error(err));
process.on('SIGTERM', () => { try { save(); } catch {} process.exit(0); });
