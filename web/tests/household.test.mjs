import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handle, read, change, materialize, today, addDays, passwordMatches } from '../lib/household.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  return { prepare(sql) { const stmt = sqlite.prepare(sql); let args = []; const query = { bind(...values) { args = values; return query; }, async first() { return stmt.get(...args) || null; }, async run() { const r = stmt.run(...args); return { meta: { changes: Number(r.changes) } }; } }; return query; } };
}
function client(db) {
  let jar = {};
  const send = async (path, body, options = {}) => {
    const headers = { origin: 'http://home.test', 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...options.headers };
    const response = await handle(new Request('http://home.test/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), db);
    for (const c of response.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); if (v) jar[k] = v; else delete jar[k]; }
    return { status: response.status, body: await response.json() };
  };
  return { send, cookies: () => ({ ...jar }), setCookies: values => { jar = { ...values }; } };
}
async function fixture() {
  const db = database(); const parent = client(db);
  const setup = await parent.send('setup', { household: 'Test home', name: 'Ren', email: 'ren@example.com', password: 'correct-password' });
  assert.equal(setup.status, 200);
  const childResult = await parent.send('members/add', { name: 'Mia', login: 'mia', password: 'child-password', pin: '1234', role: 'child', requireApproval: true });
  assert.equal(childResult.status, 200);
  const state = (await parent.send('state')).body;
  const childId = state.members.find(m => m.role === 'child').id;
  const parentId = state.user.id;
  const child = client(db); assert.equal((await child.send('login', { login: 'mia', password: 'child-password' })).status, 200);
  return { db, parent, child, childId, parentId, recoveryCode: setup.body.recoveryCode };
}
async function chore(f, overrides = {}) {
  const result = await f.parent.send('chores/add', { title: 'Walis', repeat: 'daily', date: today(), time: '18:00', points: 10, assignees: [f.childId], ...overrides });
  assert.equal(result.status, 200, result.body.error);
  return (await f.parent.send('state')).body.occurrences.find(o => o.title === (overrides.title || 'Walis') && o.date === (overrides.date || today()));
}

test('setup is invite-only and can only be claimed once; secrets never leave state API', async () => {
  const f = await fixture();
  assert.equal((await f.parent.send('setup', { household: 'Other', name: 'Bad', email: 'bad@example.com', password: 'long-password' })).status, 409);
  const body = (await f.parent.send('state')).body;
  assert.ok(!JSON.stringify(body).includes('password'));
  assert.ok(!JSON.stringify(body).includes('pinHash'));
  assert.equal(body.sessions, undefined); assert.equal(body.devices, undefined);
  assert.equal((await client(f.db).send('state')).body.signedOut, true);
});
test('email and parent-created username sign in; incorrect credentials fail', async () => {
  const f = await fixture(); const emailClient = client(f.db);
  assert.equal((await emailClient.send('login', { login: 'REN@example.com', password: 'correct-password' })).status, 200);
  assert.equal((await client(f.db).send('login', { login: 'mia', password: 'incorrect' })).status, 401);
});
test('children cannot mutate settings, membership, schedules, recipes, meals, reviews or pairing', async () => {
  const f = await fixture();
  for (const path of ['settings', 'members/add', 'members/update', 'chores/add', 'chores/archive', 'recipes/add', 'meals/save', 'tasks/review', 'tasks/reassign', 'pair', 'devices/revoke', 'rewards/add', 'rewards/review']) assert.equal((await f.child.send(path, {})).status, 403, path);
  assert.equal((await f.child.send('status', { id: f.parentId, status: 'away' })).status, 403);
  assert.equal((await f.child.send('status', { status: 'away' })).status, 200);
});
test('PIN switching only works on paired screens and never opens a parent account', async () => {
  const f = await fixture(); const screen = client(f.db);
  assert.equal((await screen.send('switch', { memberId: f.childId, pin: '1234' })).status, 401);
  assert.equal((await f.parent.send('pair', {})).status, 200);
  screen.setCookies({ dh_device: f.parent.cookies().dh_device });
  assert.equal((await screen.send('state')).body.paired, true);
  assert.equal((await screen.send('settings', { name: 'No' })).status, 401);
  assert.equal((await screen.send('switch', { memberId: f.parentId, pin: '1234' })).status, 401);
  assert.equal((await screen.send('switch', { memberId: f.childId, pin: '9999' })).status, 401);
  assert.equal((await screen.send('switch', { memberId: f.childId, pin: '1234' })).status, 200);
  assert.equal((await screen.send('state')).body.user.role, 'child');
  await screen.send('logout', {}); assert.equal((await screen.send('state')).body.user, null);
  await screen.send('switch', { memberId: f.childId, pin: '1234' });
  await f.parent.send('devices/revoke', {}); assert.equal((await screen.send('state')).body.signedOut, true);
});
test('parent recovery rotates one-time code and revokes existing sessions and devices', async () => {
  const f = await fixture(); await f.parent.send('pair', {}); const recovery = client(f.db);
  assert.equal((await recovery.send('recover', { login: 'ren@example.com', code: 'bad', password: 'replacement-pass' })).status, 401);
  const reset = await recovery.send('recover', { login: 'ren@example.com', code: f.recoveryCode, password: 'replacement-pass' });
  assert.equal(reset.status, 200); assert.notEqual(reset.body.recoveryCode, f.recoveryCode);
  assert.equal((await f.parent.send('state')).body.signedOut, true);
  assert.equal((await client(f.db).send('recover', { login: 'ren@example.com', code: f.recoveryCode, password: 'another-password' })).status, 401);
  assert.equal((await client(f.db).send('login', { login: 'ren@example.com', password: 'replacement-pass' })).status, 200);
});
test('parent resets child password and PIN, revoking old child sessions', async () => {
  const f = await fixture();
  assert.equal((await f.parent.send('members/update', { id: f.childId, password: 'new-child-password', pin: '9876', requireApproval: false })).status, 200);
  assert.equal((await f.child.send('state')).body.signedOut, true);
  assert.equal((await f.child.send('login', { login: 'mia', password: 'new-child-password' })).status, 200);
  const stored = (await read(f.db)).state.members.find(m => m.id === f.childId);
  assert.equal(await passwordMatches('9876', stored.pinHash), true);
});
test('recurrence separates definitions and occurrences; rotation includes away members; generation is idempotent', async () => {
  const f = await fixture(); await f.parent.send('status', { id: f.childId, status: 'away' });
  await chore(f, { assignees: [f.childId, f.parentId] });
  const a = (await f.parent.send('state')).body;
  const dates = a.occurrences.sort((a,b) => a.date.localeCompare(b.date));
  assert.equal(dates.length, 15); assert.equal(dates[0].assigneeId, f.childId); assert.equal(dates[1].assigneeId, f.parentId);
  const state = (await read(f.db)).state; materialize(state); materialize(state);
  assert.equal(state.occurrences.length, 15);
  materialize(state, addDays(today(), 21)); assert.equal(state.occurrences.length, 22);
  assert.equal(new Set(state.occurrences.map(o => o.id)).size, 22);
  await chore(f, { title: 'Weekly', repeat: 'weekly' });
  assert.equal((await f.parent.send('state')).body.occurrences.filter(o => o.title === 'Weekly').length, 3);
});
test('completion, rejection, re-completion and simultaneous approval award points once', async () => {
  const f = await fixture(); await f.parent.send('settings', { rewardsEnabled: true }); const o = await chore(f);
  await Promise.all([f.child.send('tasks/complete', { id: o.id }), f.child.send('tasks/complete', { id: o.id })]);
  let state = (await f.parent.send('state')).body; assert.equal(state.members.find(m => m.id === f.childId).balance, 0); assert.equal(state.occurrences.find(t => t.id === o.id).status, 'pending');
  await f.parent.send('tasks/review', { id: o.id, decision: 'reject', note: 'Missed the corner.' });
  await f.child.send('tasks/complete', { id: o.id });
  await Promise.all(Array.from({ length: 6 }, () => f.parent.send('tasks/review', { id: o.id, decision: 'approve' })));
  state = (await f.parent.send('state')).body; assert.equal(state.members.find(m => m.id === f.childId).balance, 10); assert.equal(state.occurrences.find(t => t.date === addDays(today(), 1)).status, 'open');
  assert.equal(state.activity.filter(a => a.message === 'approved Walis').length, 1);
});
test('unapproved completions and rewards-disabled completions award no points; disabling hides point fields', async () => {
  const f = await fixture(); await f.parent.send('members/update', { id: f.childId, requireApproval: false }); const o = await chore(f);
  await Promise.all([f.child.send('tasks/complete', { id: o.id }), f.child.send('tasks/complete', { id: o.id })]);
  const hidden = (await f.child.send('state')).body; assert.equal(hidden.user.balance, undefined); assert.equal(hidden.occurrences[0].points, undefined); assert.equal(hidden.rewards.length, 0);
  await f.parent.send('settings', { rewardsEnabled: true }); const visible = (await f.child.send('state')).body; assert.equal(visible.user.balance, 0);
});
test('children cannot complete another member’s tasks or future occurrences', async () => {
  const f = await fixture(); const other = await chore(f, { assignees: [f.parentId] });
  assert.equal((await f.child.send('tasks/complete', { id: other.id })).status, 403);
  const future = await chore(f, { title: 'Tomorrow', date: addDays(today(), 1) });
  assert.equal((await f.child.send('tasks/complete', { id: future.id })).status, 400);
});
test('overdue occurrence remains available; reassign and help requests persist; archive preserves history', async () => {
  const f = await fixture(); const o = await chore(f, { date: addDays(today(), -1) });
  assert.equal((await f.child.send('tasks/help', { id: o.id, note: 'Please help move the chairs.' })).status, 200);
  await f.parent.send('tasks/reassign', { id: o.id, memberId: f.parentId });
  await f.parent.send('tasks/complete', { id: o.id });
  await f.parent.send('chores/archive', { id: o.choreId });
  const state = (await f.parent.send('state')).body;
  assert.equal(state.occurrences.filter(t => t.choreId === o.choreId).length, 1); assert.equal(state.occurrences[0].status, 'done');
});
test('real recipe links, YouTube detection, preferences, meal replacement and groceries sync across clients', async () => {
  const f = await fixture();
  assert.equal((await f.parent.send('recipes/add', { title: 'Unsafe', url: 'javascript:alert(1)', minutes: 20, servings: 4, tags: [], ingredients: [] })).status, 400);
  const saved = await f.parent.send('recipes/add', { title: 'Family omelette', url: 'https://youtu.be/12345', minutes: 15, servings: 2, tags: ['quick', 'family-choice'], ingredients: ['4 eggs', '1 onion'] }); assert.equal(saved.status, 200);
  let state = (await f.parent.send('state')).body; const recipe = state.recipes.find(r => r.title === 'Family omelette'); assert.equal(recipe.sourceType, 'youtube');
  await f.parent.send('settings', { preferenceTags: ['family-choice'] }); assert.equal((await f.parent.send('state')).body.suggestions[0].id, recipe.id);
  await f.parent.send('meals/save', { recipeId: 'adobo', date: today(), slot: 'dinner' }); await f.parent.send('meals/save', { recipeId: recipe.id, date: today(), slot: 'dinner' });
  assert.equal((await f.child.send('state')).body.meals.length, 1);
  await f.child.send('groceries/add', { items: ['8 eggs'] }); state = (await f.parent.send('state')).body;
  assert.equal(state.groceries[0].title, '8 eggs'); await f.child.send('groceries/toggle', { id: state.groceries[0].id, purchased: true }); assert.equal((await f.parent.send('state')).body.groceries[0].purchased, true);
});
test('simultaneous reward requests cannot overspend; rejection refunds once and approval never charges twice', async () => {
  const f = await fixture(); await f.parent.send('settings', { rewardsEnabled: true });
  await change(f.db, s => { s.members.find(m => m.id === f.childId).balance = 50; });
  await f.parent.send('rewards/add', { title: 'Movie night', cost: 40 }); await f.parent.send('rewards/add', { title: 'Game time', cost: 40 });
  let state = (await f.parent.send('state')).body;
  const results = await Promise.all(state.rewards.map(r => f.child.send('rewards/redeem', { id: r.id })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  state = (await f.parent.send('state')).body; assert.equal(state.members.find(m => m.id === f.childId).balance, 10);
  const redemption = state.redemptions[0]; await Promise.all([f.parent.send('rewards/review', { id: redemption.id, decision: 'reject' }), f.parent.send('rewards/review', { id: redemption.id, decision: 'reject' })]);
  assert.equal((await f.child.send('state')).body.user.balance, 50);
  await f.child.send('rewards/redeem', { id: state.rewards[0].id }); const next = (await f.parent.send('state')).body.redemptions.find(r => r.status === 'pending');
  await Promise.all([f.parent.send('rewards/review', { id: next.id, decision: 'approve' }), f.parent.send('rewards/review', { id: next.id, decision: 'approve' })]);
  assert.equal((await f.child.send('state')).body.user.balance, 10);
});
test('writes require same-origin JSON, no public household data, and login attempts are throttled', async () => {
  const f = await fixture();
  assert.equal((await f.parent.send('settings', { name: 'Changed' }, { headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await f.parent.send('settings', {}, { headers: { 'content-type': 'text/plain' } })).status, 415);
  const bad = client(f.db); let result;
  for (let i = 0; i < 11; i++) result = await bad.send('login', { login: 'unknown', password: 'incorrect' });
  assert.equal(result.status, 429);
});
test('Manila dates roll over correctly and malformed calendar dates are rejected', async () => {
  assert.equal(today(Date.parse('2026-10-18T16:01:00Z')), '2026-10-19');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const f = await fixture();
  assert.equal((await f.parent.send('meals/save', { recipeId: 'adobo', date: '2026-02-30', slot: 'dinner' })).status, 400);
});
