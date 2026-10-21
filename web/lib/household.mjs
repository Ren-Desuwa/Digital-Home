import { GoogleError, googleConfigured, startGoogle, finishGoogle, redirect, googleCookie, saveGoogleSetup, googleSetupProfile, clearGoogleSetup } from './google.mjs';
const DAY = 86400000;
const encoder = new TextEncoder();
export class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const fail = (condition, message, status = 400) => { if (!condition) throw new AppError(message, status); };
const id = () => crypto.randomUUID();
const text = (value, label, max = 160) => { fail(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label} is required (up to ${max} characters).`); return value.trim(); };
const number = (value, min, max, label) => { const n = Number(value); fail(Number.isInteger(n) && n >= min && n <= max, `${label} must be between ${min} and ${max}.`); return n; };
export const today = (time = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
export const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const date = value => { fail(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && addDays(value, 0) === value, 'Choose a valid date.'); return value; };
const hex = bytes => Array.from(new Uint8Array(bytes), v => v.toString(16).padStart(2, '0')).join('');
export const digest = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export async function passwordHash(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `${salt}:${hex(hash)}`;
}
export async function passwordMatches(value, stored) {
  if (typeof value !== 'string' || !stored) return false;
  const computed = await passwordHash(value, stored.split(':')[0]);
  let diff = computed.length ^ stored.length;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return diff === 0;
}
const newPassword = value => { fail(typeof value === 'string' && value.length >= 10 && value.length <= 128, 'Use a password of 10–128 characters.'); return value; };
const pin = value => { fail(typeof value === 'string' && /^\d{4,8}$/.test(value), 'Use a PIN of 4–8 digits.'); return value; };
const loginName = value => text(value, 'Email or username', 120).toLowerCase();
const email = value => { const v = loginName(value); fail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.'); return v; };
const owner = (s, user) => { fail(user?.role === 'parent' && s.members.some(m => m.id === user.id), 'Parent authentication required.', 403); };
const member = (s, memberId) => { const m = s.members.find(m => m.id === memberId); fail(m, 'Member not found.', 404); return m; };
const audit = (s, user, message) => { s.activity.unshift({ id: id(), actor: user?.name || 'Household', message, at: new Date().toISOString() }); s.activity = s.activity.slice(0, 500); };
const cookieValue = (request, name) => request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1);
const cookie = (request, name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
export const starterRecipes = [
  { id: 'adobo', title: 'Chicken adobo', url: 'https://panlasangpinoy.com/filipino-chicken-adobo-recipe/', sourceType: 'website', minutes: 60, servings: 4, tags: ['Filipino', 'chicken', 'family favorite'], ingredients: [] },
  { id: 'munggo', title: 'Ginisang munggo', url: 'https://panlasangpinoy.com/ginisang-munggo-sauteed-mung-beans/', sourceType: 'website', minutes: 80, servings: 6, tags: ['Filipino', 'one pot'], ingredients: [] },
  { id: 'adobo-video', title: 'Easy chicken adobo · video', url: 'https://www.youtube.com/watch?v=vWt4rR4s6Io', sourceType: 'youtube', minutes: 60, servings: 4, tags: ['Filipino', 'chicken', 'video'], ingredients: [] },
  { id: 'sayote', title: 'Ginisang sayote with shrimp', url: 'https://www.kawalingpinoy.com/ginisang-sayote/', sourceType: 'website', minutes: 30, servings: 4, tags: ['Filipino', 'quick', 'vegetables', 'seafood'], ingredients: [] },
  { id: 'sinangag', title: 'Sinangag · garlic fried rice', url: 'https://panlasangpinoy.com/sinangag-recipe/', sourceType: 'website', minutes: 20, servings: 4, tags: ['Filipino', 'quick', 'breakfast'], ingredients: [] },
];
export function blankHousehold(name, user) {
  return { name, timezone: 'Asia/Manila', rewardsEnabled: false, preferenceTags: [], members: [user], sessions: [], devices: [], chores: [], occurrences: [], recipes: structuredClone(starterRecipes), meals: [], groceries: [], rewards: [], redemptions: [], activity: [] };
}
export async function read(db) {
  const row = await db.prepare('SELECT revision, data FROM households WHERE id = ?').bind('home').first();
  return row ? { revision: row.revision, state: JSON.parse(row.data) } : null;
}
export async function change(db, callback) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await read(db);
    fail(row, 'Set up your household first.', 409);
    const result = await callback(row.state);
    const update = await db.prepare('UPDATE households SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(row.state), 'home', row.revision).run();
    if (update.meta.changes === 1) return result;
  }
  throw new AppError('The household is busy. Please try again.', 409);
}
export function materialize(s, until = addDays(today(), 14)) {
  const existing = new Set(s.occurrences.map(o => o.id));
  for (const c of s.chores) {
    if (c.archived) continue;
    let cursor = c.nextDate;
    let count = c.sequence || 0;
    for (let n = 0; cursor && cursor <= until && n < 400; n++) {
      const oid = `${c.id}:${cursor}`;
      if (!existing.has(oid)) {
        s.occurrences.push({ id: oid, choreId: c.id, title: c.title, date: cursor, time: c.time, assigneeId: c.assignees[count % c.assignees.length], points: c.points, status: 'open', note: '' });
        existing.add(oid);
      }
      count++;
      cursor = c.repeat === 'once' ? null : addDays(cursor, c.repeat === 'daily' ? 1 : 7);
    }
    c.nextDate = cursor; c.sequence = count;
  }
}
export function suggestions(s) {
  const recent = new Set(s.meals.filter(m => m.date >= addDays(today(), -7) && m.date <= today()).map(m => m.recipeId));
  return [...s.recipes].map(r => ({ ...r, score: (recent.has(r.id) ? -10 : 0) + r.tags.filter(t => s.preferenceTags.includes(t.toLowerCase())).length * 4 + (r.minutes <= 35 ? 2 : 0) })).sort((a, b) => b.score - a.score).slice(0, 6);
}
function publicState(s, user, paired) {
  const { sessions, devices, ...safe } = s;
  safe.members = s.members.map(({ password, pinHash, recoveryHash, googleSub, ...m }) => ({ ...m, googleConnected: Boolean(googleSub), ...(user?.role === 'parent' ? {} : { login: undefined }) }));
  if (user?.role !== 'parent') safe.redemptions = safe.redemptions.filter(r => r.memberId === user?.id);
  if (!s.rewardsEnabled) { safe.rewards = []; safe.redemptions = []; safe.members = safe.members.map(({ balance, ...m }) => m); safe.occurrences = safe.occurrences.map(({ points, ...o }) => o); safe.chores = safe.chores.map(({ points, ...c }) => c); }
  return { ...safe, user: safe.members.find(m => m.id === user?.id) || null, paired, suggestions: suggestions(s) };
}
async function authenticate(s, request) {
  const token = cookieValue(request, 'dh_session');
  // Cookies contain opaque random bearer values; only their digests are stored.
  const hashed = token ? await digest(token) : null;
  const valid = s.sessions.find(x => x.hash === hashed && x.expires > Date.now());
  const device = cookieValue(request, 'dh_device');
  const dh = device ? await digest(device) : null;
  const paired = s.devices.some(x => x.hash === dh && x.expires > Date.now());
  const allowed = valid && (!valid.deviceHash || (paired && valid.deviceHash === dh));
  return { user: allowed ? s.members.find(m => m.id === valid.memberId) : null, paired };
}
async function throttle(db, request, identity = '') {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const bucket = Math.floor(Date.now() / (15 * 60000));
  for (const label of [`ip:${ip}`, `identity:${identity}`]) {
    const key = await digest(label + ':' + bucket);
    await db.prepare('INSERT INTO attempts (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1').bind(key, Date.now() + 30 * 60000).run();
    const row = await db.prepare('SELECT count FROM attempts WHERE key = ?').bind(key).first();
    fail(row.count <= (label.startsWith('ip:') ? 60 : 10), 'Too many attempts. Try again in 15 minutes.', 429);
  }
  await db.prepare('DELETE FROM attempts WHERE expires < ?').bind(Date.now()).run();
}
async function sessionFor(s, m, token, deviceHash) {
  s.sessions = s.sessions.filter(x => x.expires > Date.now());
  s.sessions.push({ hash: await digest(token), memberId: m.id, expires: Date.now() + 7 * DAY, ...(deviceHash ? { deviceHash } : {}) });
}
const json = (data, status = 200, cookies = []) => { const h = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); cookies.forEach(c => h.append('Set-Cookie', c)); return new Response(JSON.stringify(data), { status, headers: h }); };
export async function handle(request, db, env = {}, transport = fetch) {
  try {
    const path = new URL(request.url).pathname.replace(/^\/api\//, '');
    fail(db, 'Database is not configured.', 503);
    if (request.method === 'GET' && path.startsWith('auth/google/')) {
      try {
        if (path === 'auth/google/start') {
          await throttle(db, request, 'google-start');
          const link = new URL(request.url).searchParams.get('link') === '1';
          let actor = null;
          if (link) {
            const row = await read(db);
            const auth = row && await authenticate(row.state, request);
            fail(auth?.user, 'Sign in with your password before connecting Google.', 401);
            const sessionHash = await digest(cookieValue(request, 'dh_session'));
            fail(!row.state.sessions.find(s => s.hash === sessionHash)?.deviceHash, 'Sign in with your password before connecting Google. A shared-screen PIN cannot connect an account.', 403);
            actor = { memberId: auth.user.id, sessionHash };
          }
          return await startGoogle(request, db, env, actor);
        }
        fail(path === 'auth/google/callback', 'Not found.', 404);
        const { actor, profile } = await finishGoogle(request, db, env, transport);
        const cookies = [googleCookie(request, 'dh_google_flow', '', 0)];
        const existing = await read(db);
        if (!existing) {
          fail(!actor, 'The household no longer exists.');
          cookies.push(await saveGoogleSetup(request, db, profile));
          return redirect('/', cookies);
        }
        const token = id() + id();
        await change(db, async s => {
          let m = s.members.find(m => m.googleSub === profile.sub);
          if (actor) {
            const session = s.sessions.find(x => x.hash === actor.sessionHash && x.memberId === actor.memberId && x.expires > Date.now());
            const validDevice = !session?.deviceHash || s.devices.some(d => d.hash === session.deviceHash && d.expires > Date.now());
            fail(session && validDevice, 'Your session expired. Sign in again before connecting Google.', 401);
            fail(!m || m.id === actor.memberId, 'This Google account is already connected to another member.', 409);
            m = member(s, actor.memberId);
            fail(!m.googleSub || m.googleSub === profile.sub, 'This profile already has a different Google account connected.', 409);
            m.googleSub = profile.sub;
            audit(s, m, 'connected Google sign-in');
          }
          fail(m, 'This Google account is not connected to a household member. Sign in with your password and connect Google in Household.', 403);
          await sessionFor(s, m, token);
        });
        cookies.push(cookie(request, 'dh_session', token, 7 * 86400));
        return redirect('/?google=connected', cookies);
      } catch (error) {
        const message = error instanceof GoogleError || error instanceof AppError ? error.message : 'Google sign-in is temporarily unavailable. Please try again.';
        return redirect('/?auth_error=' + encodeURIComponent(message), [googleCookie(request, 'dh_google_flow', '', 0)]);
      }
    }
    if (request.method === 'GET') {
      fail(path === 'state', 'Not found.', 404);
      let row = await read(db);
      if (!row) {
        const profile = await googleSetupProfile(request, db);
        return json({ setup: true, googleEnabled: googleConfigured(env), ...(profile ? { googleProfile: { name: profile.name, email: profile.email } } : {}) });
      }
      const auth = await authenticate(row.state, request);
      if (!auth.user && !auth.paired) return json({ setup: false, signedOut: true, name: row.state.name, googleEnabled: googleConfigured(env) });
      if (row.state.chores.some(c => !c.archived && c.nextDate && c.nextDate <= addDays(today(), 14))) {
        await change(db, s => materialize(s));
        row = await read(db);
      }
      return json({ ...publicState(row.state, auth.user, auth.paired), googleEnabled: googleConfigured(env) });
    }
    fail(request.method === 'POST', 'Method not allowed.', 405);
    const origin = request.headers.get('origin');
    fail(origin === new URL(request.url).origin, 'Invalid request origin.', 403);
    fail(request.headers.get('content-type')?.includes('application/json'), 'JSON required.', 415);
    const raw = await request.text(); fail(raw.length < 100000, 'Request is too large.', 413);
    let b; try { b = JSON.parse(raw); } catch { throw new AppError('Invalid JSON.'); }
    fail(b && typeof b === 'object' && !Array.isArray(b), 'Invalid request.');
    const cookies = [];
    if (path === 'setup') {
      await throttle(db, request, 'setup');
      fail(!(await read(db)), 'This household is already set up.', 409);
      const google = await googleSetupProfile(request, db);
      const m = { id: id(), name: text(b.name, 'Your name', 60), login: google ? google.email : email(b.email), ...(google ? { googleSub: google.sub } : { password: await passwordHash(newPassword(b.password)) }), role: 'parent', status: 'home', requireApproval: false, balance: 0 };
      const recoveryCode = id() + '-' + id(); m.recoveryHash = await digest(recoveryCode);
      const s = blankHousehold(text(b.household, 'Household name', 70), m);
      const token = id() + id(); await sessionFor(s, m, token); audit(s, m, 'started the household');
      const result = await db.prepare('INSERT OR IGNORE INTO households (id, revision, data) VALUES (?, 0, ?)').bind('home', JSON.stringify(s)).run();
      fail(result.meta.changes === 1, 'This household is already set up.', 409);
      if (google) { await clearGoogleSetup(request, db); cookies.push(googleCookie(request, 'dh_google_setup', '', 0, 'Strict')); }
      cookies.push(cookie(request, 'dh_session', token, 7 * 86400));
      return json({ ok: true, recoveryCode }, 200, cookies);
    }
    if (path === 'login' || path === 'recover' || path === 'switch') {
      const login = path === 'switch' ? text(b.memberId, 'Profile') : loginName(b.login);
      await throttle(db, request, login);
      const token = id() + id(); const newRecoveryCode = path === 'recover' ? id() + '-' + id() : null;
      await change(db, async s => {
        const auth = await authenticate(s, request);
        const m = path === 'switch' ? s.members.find(m => m.id === login && m.role === 'child') : s.members.find(m => m.login === login);
        let valid = false;
        if (path === 'switch') valid = auth.paired && m && await passwordMatches(b.pin, m.pinHash);
        else if (path === 'recover') valid = m?.role === 'parent' && m.recoveryHash && await digest(String(b.code)) === m.recoveryHash;
        else valid = m && await passwordMatches(b.password, m.password);
        // Unknown users take the password path too, avoiding a cheap user probe.
        if (!m) await passwordHash('invalid-credential');
        fail(valid, 'Credentials were not accepted.', 401);
        if (path === 'recover') { m.password = await passwordHash(newPassword(b.password)); m.recoveryHash = await digest(newRecoveryCode); s.sessions = s.sessions.filter(x => x.memberId !== m.id); s.devices = s.devices.filter(x => x.parentId !== m.id); audit(s, m, 'recovered their account'); }
        await sessionFor(s, m, token, path === 'switch' ? await digest(cookieValue(request, 'dh_device')) : undefined);
      });
      cookies.push(cookie(request, 'dh_session', token, 7 * 86400));
      return json({ ok: true, ...(newRecoveryCode ? { recoveryCode: newRecoveryCode } : {}) }, 200, cookies);
    }
    let extra = {};
    await change(db, async s => {
      const { user, paired } = await authenticate(s, request);
      if (path === 'logout') { const hash = await digest(cookieValue(request, 'dh_session') || ''); s.sessions = s.sessions.filter(x => x.hash !== hash); cookies.push(cookie(request, 'dh_session', '', 0)); return; }
      if (path === 'unpair') { fail(user?.role === 'parent' || paired, 'Authentication required.', 401); const hash = await digest(cookieValue(request, 'dh_device') || ''); s.devices = s.devices.filter(x => x.hash !== hash); const sh = await digest(cookieValue(request, 'dh_session') || ''); s.sessions = s.sessions.filter(x => x.hash !== sh); cookies.push(cookie(request, 'dh_device', '', 0), cookie(request, 'dh_session', '', 0)); return; }
      fail(user, 'Please sign in.', 401);
      materialize(s);
      switch (path) {
        case 'pair': { owner(s, user); const token = id() + id(); s.devices.push({ id: id(), parentId: user.id, hash: await digest(token), expires: Date.now() + 30 * DAY }); cookies.push(cookie(request, 'dh_device', token, 30 * 86400)); audit(s, user, 'paired a shared home screen'); break; }
        case 'devices/revoke': owner(s, user); s.devices = []; audit(s, user, 'revoked all paired screens'); break;
        case 'members/add': {
          owner(s, user); fail(s.members.length < 30, 'The household member limit is 30.');
          const login = b.login?.includes('@') ? email(b.login) : loginName(b.login);
          fail(/^[a-z0-9@._+\-]+$/.test(login), 'Use a valid email or username.');
          fail(!s.members.some(m => m.login === login), 'That login is already in use.');
          fail(['parent', 'child'].includes(b.role), 'Choose a role.');
          const m = { id: id(), name: text(b.name, 'Name', 60), login, password: await passwordHash(newPassword(b.password)), role: b.role, status: 'home', requireApproval: b.role === 'child' && b.requireApproval === true, balance: 0 };
          if (b.role === 'parent') { fail(login.includes('@'), 'Parents need an email address.'); const code = id() + '-' + id(); m.recoveryHash = await digest(code); extra.recoveryCode = code; }
          if (b.role === 'child') m.pinHash = await passwordHash(pin(b.pin));
          s.members.push(m); audit(s, user, `added ${m.name} to the household`); break;
        }
        case 'members/update': {
          owner(s, user); const m = member(s, b.id);
          if (typeof b.requireApproval === 'boolean' && m.role === 'child') m.requireApproval = b.requireApproval;
          if (b.password) { m.password = await passwordHash(newPassword(b.password)); s.sessions = s.sessions.filter(x => x.memberId !== m.id); }
          if (b.pin && m.role === 'child') { m.pinHash = await passwordHash(pin(b.pin)); s.sessions = s.sessions.filter(x => x.memberId !== m.id); }
          audit(s, user, `updated ${m.name}'s account`); break;
        }
        case 'status': { const m = member(s, b.id || user.id); fail(m.id === user.id || user.role === 'parent', 'You can only update your own status.', 403); fail(['home', 'away'].includes(b.status), 'Choose home or away.'); m.status = b.status; audit(s, user, `set ${m.name} as ${m.status}`); break; }
        case 'settings': {
          owner(s, user); if (b.name !== undefined) s.name = text(b.name, 'Household name', 70);
          if (typeof b.rewardsEnabled === 'boolean') s.rewardsEnabled = b.rewardsEnabled;
          if (b.preferenceTags !== undefined) { fail(Array.isArray(b.preferenceTags) && b.preferenceTags.length <= 20, 'Use up to 20 preference tags.'); s.preferenceTags = b.preferenceTags.map(t => text(t, 'Preference', 40).toLowerCase()); }
          audit(s, user, 'updated household preferences'); break;
        }
        case 'chores/add': {
          owner(s, user); fail(s.chores.length < 300, 'Archive existing chores before adding more.');
          fail(['once', 'daily', 'weekly'].includes(b.repeat), 'Choose a schedule.');
          fail(Array.isArray(b.assignees) && b.assignees.length > 0 && new Set(b.assignees).size === b.assignees.length, 'Choose assignees in rotation order.'); b.assignees.forEach(mid => member(s, mid));
          const startDate = date(b.date); fail(startDate >= addDays(today(), -31) && startDate <= addDays(today(), 365), 'Start within the past month or next year.');
          fail(/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time), 'Choose a due time.');
          s.chores.push({ id: id(), title: text(b.title, 'Task title'), repeat: b.repeat, assignees: b.assignees, startDate, nextDate: startDate, sequence: 0, time: b.time, points: number(b.points || 0, 0, 1000, 'Points') });
          materialize(s); audit(s, user, `added ${b.title}`); break;
        }
        case 'chores/archive': { owner(s, user); const c = s.chores.find(c => c.id === b.id); fail(c, 'Chore not found.', 404); c.archived = true; s.occurrences = s.occurrences.filter(o => o.choreId !== c.id || o.status !== 'open' || o.date < today()); audit(s, user, `archived ${c.title}`); break; }
        case 'tasks/reassign': { owner(s, user); const o = s.occurrences.find(o => o.id === b.id); fail(o && o.status === 'open', 'Only open tasks can be reassigned.'); o.assigneeId = member(s, b.memberId).id; audit(s, user, `reassigned ${o.title}`); break; }
        case 'tasks/help': { const o = s.occurrences.find(o => o.id === b.id); fail(o && o.assigneeId === user.id && o.status === 'open', 'Only your open tasks can request help.', 403); o.note = text(b.note, 'Help request', 250); audit(s, user, `asked for help with ${o.title}`); break; }
        case 'tasks/complete': {
          const o = s.occurrences.find(o => o.id === b.id); fail(o, 'Task not found.', 404); fail(user.role === 'parent' || o.assigneeId === user.id, 'This task belongs to another member.', 403);
          if (o.status !== 'open') break;
          fail(o.date <= today(), 'This task is scheduled for a future date.');
          const assignee = member(s, o.assigneeId);
          o.status = assignee.requireApproval ? 'pending' : 'done'; o.completedAt = new Date().toISOString();
          if (o.status === 'done' && s.rewardsEnabled) { assignee.balance += o.points; o.awarded = o.points; }
          audit(s, user, `${o.status === 'pending' ? 'submitted' : 'completed'} ${o.title}`); break;
        }
        case 'tasks/review': {
          owner(s, user); fail(['approve', 'reject'].includes(b.decision), 'Choose approve or reject.');
          const o = s.occurrences.find(o => o.id === b.id); fail(o, 'Task not found.', 404); if (o.status !== 'pending') break;
          o.status = b.decision === 'approve' ? 'done' : 'open';
          if (o.status === 'done' && s.rewardsEnabled) { member(s, o.assigneeId).balance += o.points; o.awarded = o.points; }
          if (o.status === 'open') { o.completedAt = null; o.note = String(b.note || 'Please give this another try.').slice(0, 250); }
          audit(s, user, `${b.decision === 'approve' ? 'approved' : 'returned'} ${o.title}`); break;
        }
        case 'recipes/add': {
          owner(s, user); let url; try { url = new URL(b.url); } catch { throw new AppError('Enter a valid recipe link.'); }
          fail(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'Use an http or https recipe link.');
          fail(Array.isArray(b.ingredients) && b.ingredients.length <= 60 && Array.isArray(b.tags) && b.tags.length <= 20, 'Check ingredients and tags.');
          s.recipes.push({ id: id(), title: text(b.title, 'Recipe title'), url: url.href, sourceType: /(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname) ? 'youtube' : 'website', minutes: number(b.minutes, 1, 1440, 'Preparation time'), servings: number(b.servings, 1, 100, 'Servings'), ingredients: b.ingredients.map(i => text(i, 'Ingredient', 160)), tags: b.tags.map(t => text(t, 'Tag', 40).toLowerCase()) }); audit(s, user, `saved ${b.title}`); break;
        }
        case 'meals/save': {
          owner(s, user); const d = date(b.date); fail(['breakfast', 'lunch', 'dinner'].includes(b.slot), 'Choose a meal.');
          const r = s.recipes.find(r => r.id === b.recipeId); fail(r, 'Choose a saved recipe.');
          s.meals = s.meals.filter(m => !(m.date === d && m.slot === b.slot)); s.meals.push({ id: id(), date: d, slot: b.slot, recipeId: r.id }); audit(s, user, `planned ${r.title} for ${d}`); break;
        }
        case 'meals/remove': owner(s, user); s.meals = s.meals.filter(m => m.id !== b.id); audit(s, user, 'removed a planned meal'); break;
        case 'groceries/add': { fail(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 60, 'Add 1–60 grocery items.'); b.items.forEach(item => s.groceries.push({ id: id(), title: text(item, 'Grocery item', 160), purchased: false, addedBy: user.id })); audit(s, user, 'added to the grocery list'); break; }
        case 'groceries/toggle': { const g = s.groceries.find(g => g.id === b.id); fail(g, 'Item not found.', 404); fail(typeof b.purchased === 'boolean', 'Choose a purchase status.'); g.purchased = b.purchased; break; }
        case 'groceries/clear': owner(s, user); s.groceries = s.groceries.filter(g => !g.purchased); audit(s, user, 'cleared purchased groceries'); break;
        case 'rewards/add': { owner(s, user); fail(s.rewardsEnabled, 'Rewards are disabled.'); s.rewards.push({ id: id(), title: text(b.title, 'Reward'), cost: number(b.cost, 1, 100000, 'Cost') }); audit(s, user, `added reward: ${b.title}`); break; }
        case 'rewards/redeem': {
          fail(s.rewardsEnabled, 'Rewards are disabled.'); const r = s.rewards.find(r => r.id === b.id); fail(r, 'Reward not found.', 404);
          fail(user.balance >= r.cost, 'Not enough points.');
          fail(!s.redemptions.some(x => x.memberId === user.id && x.rewardId === r.id && x.status === 'pending'), 'You already requested this reward.');
          user.balance -= r.cost; s.redemptions.push({ id: id(), memberId: user.id, rewardId: r.id, title: r.title, cost: r.cost, status: 'pending', at: new Date().toISOString() }); audit(s, user, `requested ${r.title}`); break;
        }
        case 'rewards/review': {
          owner(s, user); fail(s.rewardsEnabled, 'Rewards are disabled.'); fail(['approve', 'reject'].includes(b.decision), 'Choose approve or reject.'); const r = s.redemptions.find(r => r.id === b.id); fail(r, 'Request not found.', 404);
          if (r.status !== 'pending') break; r.status = b.decision === 'approve' ? 'approved' : 'rejected'; if (r.status === 'rejected') member(s, r.memberId).balance += r.cost; audit(s, user, `${r.status} reward: ${r.title}`); break;
        }
        default: throw new AppError('Not found.', 404);
      }
    });
    return json({ ok: true, ...extra }, 200, cookies);
  } catch (error) {
    if (!(error instanceof AppError)) console.error(error);
    return json({ error: error instanceof AppError ? error.message : 'Something went wrong. Please try again.' }, error instanceof AppError ? error.status : 500);
  }
}
