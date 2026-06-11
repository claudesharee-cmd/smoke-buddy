/* ═══════════════════════════════════════════════════════════
   SMOKE BUDDY — synchronized bad decisions for your squad.
   Sync layer: public ntfy.sh topic derived from the squad code.
   No accounts, no server, no excuses.
   ═══════════════════════════════════════════════════════════ */
'use strict';

/* ───────── constants & copy ───────── */
const CALL_TTL = 15 * 60 * 1000;          // a smoke call lives 15 minutes
const EVENT_RETENTION = 7 * 24 * 3600e3;  // keep 7 days for stats
const NTFY = 'https://ntfy.sh';

const EMOJIS = ['🦝','🐉','🦊','💀','👻','🐸','🦅','🐺','🦄','🐙','🦂','🐍'];

const TAGLINES = [
  'Your lungs called. They’ve stopped expecting better.',
  'Productivity’s #1 enemy since forever.',
  'Because quitting is a team sport you keep losing.',
  'HR-approved? Absolutely not.',
  'Synchronized self-destruction, beautifully executed.',
  'The only meeting nobody declines.',
];
const IDLE_QUIPS = [
  'It’s been quiet. Too quiet. Someone’s actually working.',
  'The smoking spot misses you. It said so.',
  'No active summons. Your lungs are cautiously optimistic.',
  'Statistically, someone is about to crack. Will it be you?',
  'Fresh air is overrated anyway.',
  'Your squad is pretending to work. Fix that.',
];
const CALL_MSGS = [
  'has summoned the council of questionable decisions.',
  'demands an emergency board meeting. Agenda: nothing.',
  'is heading down. Attendance will be noted and judged.',
  'says the deadline can wait. The craving cannot.',
  'has officially declared a productivity outage.',
  'requests backup. The vending machine doesn’t count as company.',
];
const QUORUM_QUIPS_WAIT = [
  'Waiting for the weak-willed. Shouldn’t be long.',
  'The peer pressure is loading…',
  'Somebody’s "finishing an email". Sure they are.',
];
const QUORUM_QUIPS_MET = [
  'Quorum reached. Resistance was futile, as always.',
  'That’s a quorum. The economy can wait.',
  'Critical mass achieved. Elevators, assemble.',
];
const OUT_EXCUSES = [
  'claims to have "work". A likely story.',
  'has betrayed the cause.',
  'is pretending to be a responsible adult.',
  'said no. Screenshot this for the trial.',
];
const LUNG_STATES = [
  [0, '🌱', 'Suspiciously healthy. Are you even trying?'],
  [1, '🫁', 'Mild regret detected. Within tolerance.'],
  [3, '🌫️', 'Wheezing in C minor. Impressive range.'],
  [6, '🏭', 'Industrial-grade. OSHA wants a word.'],
];
const TODAY_QUIPS = [
  [0, 'A clean sheet. Weirdly responsible of you.'],
  [1, 'Moderation! Who are you and what have you done.'],
  [3, 'A solid shift. The ashtray respects you.'],
  [6, 'At this point you ARE the smoke break.'],
];

const pick = a => a[Math.floor(Math.random() * a.length)];
const $ = id => document.getElementById(id);

/* ───────── tiny storage ───────── */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

/* ───────── state ───────── */
let cfg = store.get('sb_cfg', null); // {id,name,emoji,code,size,quorum,spot,price}
let events = store.get('sb_events', {});   // id -> event
let notifiedQuorum = store.get('sb_qnotif', {}); // callId -> true
let ws = null, wsTopic = null, reconnectTimer = null, reconnectDelay = 1000;
let lastRenderedCallId = null;

const topicFor = code =>
  'smkbdy-' + code.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-v1';

/* ───────── capacitor bridge (graceful in plain browser) ───────── */
const Plugins = window.Capacitor?.Plugins ?? {};
async function buzz(style = 'MEDIUM') {
  try { await Plugins.Haptics?.impact({ style }); } catch {}
}
async function notify(title, body) {
  try {
    await Plugins.LocalNotifications?.schedule({
      notifications: [{ id: Math.floor(Math.random() * 1e7), title, body }],
    });
  } catch {}
}
async function askNotifPermission() {
  try { await Plugins.LocalNotifications?.requestPermissions(); } catch {}
}

/* ───────── event sourcing ───────── */
function pruneEvents() {
  const cutoff = Date.now() - EVENT_RETENTION;
  for (const [id, e] of Object.entries(events)) if (e.ts < cutoff) delete events[id];
}
function saveEvents() { pruneEvents(); store.set('sb_events', events); }

function topicEvents() {
  return Object.values(events)
    .filter(e => e.topic === wsTopic)
    .sort((a, b) => a.ts - b.ts);
}

/** Derive the currently active call (if any) from the event log. */
function activeCall() {
  const evs = topicEvents();
  const now = Date.now();
  let call = null;
  for (const e of evs) {
    if (e.t === 'call' && now - e.ts < CALL_TTL) call = e;
    if (e.t === 'cancel' && call && e.call === call.id) call = null;
  }
  if (!call) return null;
  // collect latest rsvp per user
  const rsvps = new Map(); // userId -> {u, s, ts}
  rsvps.set(call.u.id, { u: call.u, s: 'in', ts: call.ts, caller: true });
  for (const e of evs) {
    if (e.t === 'rsvp' && e.call === call.id) rsvps.set(e.u.id, { u: e.u, s: e.s, ts: e.ts });
  }
  const coming = [...rsvps.values()].filter(r => r.s === 'in' || r.s === 'late').length;
  return { call, rsvps, coming };
}

function ingest(e, { live }) {
  if (!e || e.v !== 1 || !e.id || events[e.id]) return;
  e.topic = wsTopic;
  events[e.id] = e;
  saveEvents();

  if (live && e.u.id !== cfg.id) {
    const who = `${e.u.emoji} ${e.u.name}`;
    if (e.t === 'call') {
      buzz('HEAVY');
      notify(`🚨 ${who} ${pick(['lit the signal', 'rang the bell', 'sounded the alarm'])}`,
        `${e.u.name} ${e.msg || pick(CALL_MSGS)}${cfg.spot ? ` 📍 ${cfg.spot}` : ''}`);
      toast(`🚨 ${who} is summoning the squad`);
    } else if (e.t === 'rsvp') {
      if (e.s === 'in') toast(`✅ ${who} is coming`);
      else if (e.s === 'late') toast(`🐌 ${who} needs 5 more minutes`);
      else toast(`❌ ${who} ${pick(OUT_EXCUSES)}`);
    } else if (e.t === 'cancel') {
      toast(`😶‍🌫️ ${who} aborted the mission`);
    }
  }
  checkQuorum(live);
  render();
}

function checkQuorum(live) {
  const a = activeCall();
  if (!a) return;
  const { call, coming } = a;
  if (coming >= cfg.quorum && !notifiedQuorum[call.id]) {
    notifiedQuorum[call.id] = true;
    store.set('sb_qnotif', notifiedQuorum);
    if (live) {
      buzz('HEAVY');
      confettiBurst();
      notify(`🔥 ${coming}/${cfg.size} are IN`,
        `Quorum reached. ${pick(['Don’t be the disappointment.', 'Move. Now.', 'Elevator. Two minutes.'])}`);
      toast(`🔥 Quorum! ${coming}/${cfg.size} heading down`);
    }
  }
}

/* ───────── publish to ntfy ───────── */
// HTTP headers must be ASCII; ntfy accepts RFC 2047 for unicode titles.
function headerSafe(s) {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

async function publish(partial, humanTitle) {
  const e = {
    v: 1, id: crypto.randomUUID(), ts: Date.now(),
    u: { id: cfg.id, name: cfg.name, emoji: cfg.emoji },
    ...partial,
  };
  ingest({ ...e }, { live: false }); // optimistic local apply
  try {
    const res = await fetch(`${NTFY}/${wsTopic}`, {
      method: 'POST',
      body: JSON.stringify(e),
      headers: { 'X-Title': headerSafe(humanTitle), 'X-Priority': e.t === 'call' ? '4' : '3', 'X-Tags': 'smoking' },
    });
    if (!res.ok) throw new Error(res.status);
  } catch {
    toast('📡 Couldn’t reach the squad. Check your internet.');
  }
  return e;
}

/* ───────── ntfy subscription ───────── */
function connect() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  clearTimeout(reconnectTimer);
  wsTopic = topicFor(cfg.code);
  setConn(false);

  // backfill last 12h (ntfy.sh cache window) for state rebuild
  fetch(`${NTFY}/${wsTopic}/json?poll=1&since=12h`)
    .then(r => r.text())
    .then(txt => {
      for (const line of txt.split('\n')) {
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (m.event === 'message') ingest(JSON.parse(m.message), { live: false });
        } catch {}
      }
      render();
    })
    .catch(() => {});

  ws = new WebSocket(`wss://ntfy.sh/${wsTopic}/ws`);
  ws.onopen = () => { setConn(true); reconnectDelay = 1000; };
  ws.onmessage = ev => {
    try {
      const m = JSON.parse(ev.data);
      if (m.event === 'message') ingest(JSON.parse(m.message), { live: true });
    } catch {}
  };
  ws.onclose = () => {
    setConn(false);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  };
  ws.onerror = () => ws.close();
}
function setConn(ok) { $('conn-dot').classList.toggle('ok', ok); }

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && cfg && (!ws || ws.readyState !== WebSocket.OPEN)) connect();
});

/* ───────── actions ───────── */
async function summon() {
  buzz('HEAVY');
  const a = activeCall();
  if (a) return; // already one running; UI will be in active state anyway
  const msg = pick(CALL_MSGS);
  await publish({ t: 'call', msg }, `🚨 ${cfg.name} is summoning the squad`);
  toast('🚨 Squad summoned. No backing out now.');
}
async function rsvp(s) {
  buzz('MEDIUM');
  const a = activeCall();
  if (!a) return;
  const label = { in: '✅ is coming', late: '🐌 needs 5 min', out: '❌ bailed' }[s];
  await publish({ t: 'rsvp', call: a.call.id, s }, `${cfg.name} ${label}`);
}
async function cancelCall() {
  const a = activeCall();
  if (!a || a.call.u.id !== cfg.id) return;
  await publish({ t: 'cancel', call: a.call.id }, `${cfg.name} aborted the mission`);
}

/* ───────── rendering ───────── */
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function render() {
  if (!cfg) return;
  $('hdr-squad').textContent = cfg.code.toUpperCase();
  const a = activeCall();
  $('state-idle').classList.toggle('hidden', !!a);
  $('state-active').classList.toggle('hidden', !a);

  if (!a) {
    if (lastRenderedCallId) { lastRenderedCallId = null; }
    renderLastSession();
    return;
  }
  const { call, rsvps, coming } = a;
  if (lastRenderedCallId !== call.id) {
    lastRenderedCallId = call.id;
    $('quorum-quip').textContent = pick(QUORUM_QUIPS_WAIT);
  }
  $('call-caller').textContent = `${call.u.emoji} ${call.u.name}`;
  $('call-msg').textContent = `${call.u.name} ${call.msg || 'is heading down.'}${cfg.spot ? ` 📍 ${cfg.spot}` : ''}`;
  $('call-timer').textContent = fmtClock(call.ts + CALL_TTL - Date.now());

  const pct = Math.min(100, (coming / cfg.quorum) * 100);
  const met = coming >= cfg.quorum;
  $('quorum-fill').style.width = pct + '%';
  $('quorum-fill').classList.toggle('met', met);
  $('quorum-text').textContent = met ? `🔥 ${coming}/${cfg.size} IN — GO GO GO` : `${coming} / ${cfg.quorum} for quorum`;
  if (met) $('quorum-quip').textContent = pick(QUORUM_QUIPS_MET);

  // roster
  const order = { in: 0, late: 1, out: 2 };
  const rows = [...rsvps.values()].sort((x, y) => (order[x.s] ?? 3) - (order[y.s] ?? 3) || x.ts - y.ts);
  $('roster').innerHTML = rows.map(r => {
    const tag = r.caller
      ? '<span class="r-status in">🔥 instigator</span>'
      : { in: '<span class="r-status in">coming</span>',
          late: '<span class="r-status late">5 min™</span>',
          out: '<span class="r-status out">traitor</span>' }[r.s];
    return `<div class="roster-row"><span class="r-emoji">${r.u.emoji}</span><span class="r-name">${esc(r.u.name)}</span>${tag}</div>`;
  }).join('');

  // my controls
  const mine = rsvps.get(cfg.id);
  const isCaller = call.u.id === cfg.id;
  $('rsvp-row').classList.toggle('hidden', isCaller);
  $('btn-cancel').classList.toggle('hidden', !isCaller);
  for (const [btn, s] of [['btn-in', 'in'], ['btn-late', 'late'], ['btn-out', 'out']]) {
    $(btn).classList.toggle('sel', !isCaller && mine?.s === s && !mine?.caller);
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`); }

function renderLastSession() {
  const evs = topicEvents().filter(e => e.t === 'call');
  const last = evs[evs.length - 1];
  $('last-session').textContent = last
    ? `Last session: ${last.u.emoji} ${last.u.name}, ${relTime(last.ts)}`
    : 'No sessions on record. Statistically improbable.';
}
function relTime(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/* ───────── stats ───────── */
function participated(e, uid) {
  return (e.t === 'call' && e.u.id === uid) || (e.t === 'rsvp' && e.u.id === uid && (e.s === 'in' || e.s === 'late'));
}
function mySessions(sinceTs) {
  const seen = new Set();
  for (const e of topicEvents()) {
    if (e.ts >= sinceTs && participated(e, cfg.id)) seen.add(e.t === 'call' ? e.id : e.call);
  }
  return seen.size;
}
function renderStats() {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = mySessions(dayStart.getTime());
  const week = mySessions(Date.now() - 7 * 24 * 3600e3);
  $('st-today').textContent = today;
  $('st-week').textContent = week;
  $('st-money').textContent = '₹' + (week * (cfg.price || 0));
  const lung = [...LUNG_STATES].reverse().find(([n]) => today >= n);
  $('st-lungs').textContent = lung[1];
  $('st-lungs-quip').textContent = lung[2];
  $('st-today-quip').textContent = [...TODAY_QUIPS].reverse().find(([n]) => today >= n)[1];

  // leaderboard: distinct calls participated per user, last 7d
  const cutoff = Date.now() - 7 * 24 * 3600e3;
  const byUser = new Map(); // uid -> {u, calls:Set}
  for (const e of topicEvents()) {
    if (e.ts < cutoff) continue;
    const callId = e.t === 'call' ? e.id : e.call;
    if (!callId) continue;
    if (e.t === 'call' || (e.t === 'rsvp' && (e.s === 'in' || e.s === 'late'))) {
      if (!byUser.has(e.u.id)) byUser.set(e.u.id, { u: e.u, calls: new Set() });
      byUser.get(e.u.id).calls.add(callId);
    }
  }
  const rows = [...byUser.values()].sort((a, b) => b.calls.size - a.calls.size);
  $('leaderboard').innerHTML = rows.length
    ? rows.map((r, i) => `
      <div class="lb-row ${r.u.id === cfg.id ? 'me' : ''}">
        <span class="lb-rank">${['🥇', '🥈', '🥉'][i] ?? '#' + (i + 1)}</span>
        <span class="lb-emoji">${r.u.emoji}</span>
        <span class="lb-name">${esc(r.u.name)}${r.u.id === cfg.id ? ' (you)' : ''}</span>
        <span class="lb-count">${r.calls.size}</span>
      </div>`).join('')
    : '<p class="lb-empty">No data yet. Either nobody smoked this week or — let’s be honest — the app is new.</p>';
}

/* ───────── ui plumbing ───────── */
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function buildEmojiGrid(containerId, selected, onSel) {
  const c = $(containerId);
  c.innerHTML = '';
  for (const em of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    if (em === selected) b.classList.add('sel');
    b.onclick = () => {
      c.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      onSel(em);
      buzz('LIGHT');
    };
    c.appendChild(b);
  }
}

document.querySelectorAll('.step-btn').forEach(b => {
  b.addEventListener('click', () => {
    const el = $(b.dataset.target);
    const v = parseInt(el.textContent) + parseInt(b.dataset.step);
    el.textContent = Math.min(+el.dataset.max, Math.max(+el.dataset.min, v));
    buzz('LIGHT');
  });
});

document.querySelectorAll('.tabbtn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    $(b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'tab-stats') renderStats();
    buzz('LIGHT');
  });
});

/* ───────── onboarding & settings ───────── */
let obEmoji = EMOJIS[0];
let setEmoji = null;

function startApp() {
  $('screen-onboarding').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('hdr-tagline').textContent = pick(TAGLINES);
  $('idle-quip').textContent = pick(IDLE_QUIPS);
  // settings form
  $('set-name').value = cfg.name;
  $('set-code').value = cfg.code;
  $('set-size').textContent = cfg.size;
  $('set-quorum').textContent = cfg.quorum;
  $('set-spot').value = cfg.spot || '';
  $('set-price').value = cfg.price ?? 20;
  setEmoji = cfg.emoji;
  buildEmojiGrid('set-emoji', cfg.emoji, em => setEmoji = em);
  $('set-topic').textContent = `ntfy.sh/${topicFor(cfg.code)}`;
  askNotifPermission();
  connect();
  render();
  setInterval(() => { if (activeCall()) render(); }, 1000);
  setInterval(() => { $('idle-quip').textContent = pick(IDLE_QUIPS); }, 25000);
}

$('ob-go').addEventListener('click', () => {
  const name = $('ob-name').value.trim();
  const code = $('ob-code').value.trim();
  if (!name) return toast('A name. Any name. Even "Dave".');
  if (code.replace(/[^a-z0-9]/gi, '').length < 3) return toast('Squad code needs at least 3 letters/numbers.');
  cfg = {
    id: crypto.randomUUID(),
    name, emoji: obEmoji, code,
    size: +$('ob-size').textContent,
    quorum: +$('ob-quorum').textContent,
    spot: '', price: 20,
  };
  store.set('sb_cfg', cfg);
  buzz('HEAVY');
  startApp();
});

$('set-save').addEventListener('click', () => {
  const name = $('set-name').value.trim();
  const code = $('set-code').value.trim();
  if (!name || code.replace(/[^a-z0-9]/gi, '').length < 3) return toast('Name + a real squad code, please.');
  const codeChanged = topicFor(code) !== topicFor(cfg.code);
  Object.assign(cfg, {
    name, code, emoji: setEmoji,
    size: +$('set-size').textContent,
    quorum: +$('set-quorum').textContent,
    spot: $('set-spot').value.trim(),
    price: Math.max(0, +$('set-price').value || 0),
  });
  store.set('sb_cfg', cfg);
  $('set-topic').textContent = `ntfy.sh/${topicFor(cfg.code)}`;
  $('set-saved').classList.remove('hidden');
  setTimeout(() => $('set-saved').classList.add('hidden'), 2500);
  if (codeChanged) connect();
  render();
  buzz('MEDIUM');
});

$('set-topic').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(topicFor(cfg.code));
    toast('📋 Topic copied — paste it in the ntfy app for lock-screen pings');
  } catch { toast('Long-press to copy, this browser is shy.'); }
});

$('btn-summon').addEventListener('click', summon);
$('btn-in').addEventListener('click', () => rsvp('in'));
$('btn-late').addEventListener('click', () => rsvp('late'));
$('btn-out').addEventListener('click', () => rsvp('out'));
$('btn-cancel').addEventListener('click', cancelCall);

/* ───────── ambient smoke background ───────── */
(function smokeBg() {
  const cv = $('smoke-canvas'), ctx = cv.getContext('2d');
  let parts = [];
  function resize() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener('resize', resize); resize();
  function spawn() {
    parts.push({
      x: Math.random() * cv.width, y: cv.height + 40,
      r: 30 + Math.random() * 60, vy: .25 + Math.random() * .5,
      vx: (Math.random() - .5) * .3, a: 0, max: .05 + Math.random() * .06, life: 0,
    });
  }
  setInterval(spawn, 1200); for (let i = 0; i < 6; i++) spawn();
  (function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.y + p.r > -60);
    for (const p of parts) {
      p.y -= p.vy; p.x += p.vx; p.life++;
      p.a = Math.min(p.max, p.life / 300 * p.max);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(180,190,215,${p.a})`);
      g.addColorStop(1, 'rgba(180,190,215,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    requestAnimationFrame(loop);
  })();
})();

/* ───────── confetti ───────── */
let confetti = [], confettiRunning = false;
function confettiBurst() {
  const cv = $('confetti-canvas');
  if (innerWidth < 50 || innerHeight < 50) return; // window not really visible
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#ff7a18', '#ffb347', '#3ddc84', '#ffd166', '#eceef6'];
  for (let i = 0; i < 140; i++) {
    confetti.push({
      x: cv.width / 2, y: cv.height * .42, born: performance.now(),
      vx: (Math.random() - .5) * 14, vy: -4 - Math.random() * 10,
      s: 4 + Math.random() * 5, c: pick(colors), rot: Math.random() * 7, vr: (Math.random() - .5) * .3,
    });
  }
  if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(confettiLoop); }
}
function confettiLoop() {
  const cv = $('confetti-canvas'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const now = performance.now();
  confetti = confetti.filter(p => now - p.born < 3500 && p.y < cv.height + 20);
  for (const p of confetti) {
    p.x += p.vx; p.y += p.vy; p.vy += .25; p.vx *= .99; p.rot += p.vr;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6);
    ctx.restore();
  }
  if (confetti.length) requestAnimationFrame(confettiLoop);
  else { confettiRunning = false; ctx.clearRect(0, 0, cv.width, cv.height); }
}

/* ───────── boot ───────── */
// PWA service worker — browser only; the Capacitor shell ships its own assets
if ('serviceWorker' in navigator && !window.Capacitor && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
buildEmojiGrid('ob-emoji', obEmoji, em => obEmoji = em);
if (cfg) startApp();
