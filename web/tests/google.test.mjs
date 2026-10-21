import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handle, read } from '../lib/household.mjs';

const env = { GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-client-secret', APP_ORIGIN: 'http://home.test' };
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  return { prepare(sql) { const stmt = sqlite.prepare(sql); let args = []; const q = { bind(...v) { args = v; return q; }, async first() { return stmt.get(...args) || null; }, async run() { return { meta: { changes: Number(stmt.run(...args).changes) } }; } }; return q; } };
}
function client(db, config = env, transport = fetch) {
  let jar = {};
  return {
    cookies: () => ({ ...jar }), setCookies: values => { jar = { ...values }; },
    async send(path, body) {
      const request = new Request('http://home.test/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { origin: 'http://home.test', 'content-type': 'application/json', cookie: Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ') }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const response = await handle(request, db, config, transport);
      for (const cookie of response.headers.getSetCookie()) { const [k,v] = cookie.split(';')[0].split('='); if (v) jar[k] = v; else delete jar[k]; }
      return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : null, location: response.headers.get('location') };
    }
  };
}
const b64url = value => Buffer.from(value).toString('base64url');
async function provider(overrides = {}, badSignature = false) {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey); jwk.kid = 'test-key';
  let nonce;
  return {
    setNonce(value) { nonce = value; },
    async fetch(url, init) {
      if (String(url).endsWith('/certs')) return Response.json({ keys: [jwk] });
      assert.equal(String(url), 'https://oauth2.googleapis.com/token');
      const params = new URLSearchParams(init.body);
      assert.equal(params.get('client_secret'), env.GOOGLE_CLIENT_SECRET);
      assert.ok(params.get('code_verifier'));
      assert.equal(params.get('redirect_uri'), env.APP_ORIGIN + '/api/auth/google/callback');
      const claims = { iss: 'https://accounts.google.com', sub: 'google-alex-123', aud: env.GOOGLE_CLIENT_ID, nonce, email_verified: true, email: 'alex@gmail.com', name: 'Alex', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, ...overrides };
      const input = b64url(JSON.stringify({ alg: 'RS256', kid: 'test-key' })) + '.' + b64url(JSON.stringify(claims));
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
      return Response.json({ id_token: input + '.' + b64url(badSignature ? new Uint8Array(256) : signature), access_token: 'never-stored' });
    }
  };
}
async function begin(c, p, link = false) {
  const r = await c.send('auth/google/start' + (link ? '?link=1' : ''));
  assert.equal(r.status,303); const u = new URL(r.location);
  assert.equal(u.origin,'https://accounts.google.com'); assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  p.setNonce(u.searchParams.get('nonce'));
  return 'auth/google/callback?code=valid-code&state=' + u.searchParams.get('state');
}
async function fixture() {
  const db = database(), p = await provider(), c = client(db,env,p.fetch);
  const r = await c.send('setup',{household:'Test home',name:'Ren',email:'ren@example.com',password:'correct-password'}); assert.equal(r.status,200);
  return { db,p,c };
}
test('Google first-run validates identity before passwordless setup and repeat login preserves membership',async()=>{
  const db=database(),p=await provider(),c=client(db,env,p.fetch);
  assert.equal((await c.send('state')).body.googleEnabled,true);
  const cb=await begin(c,p); assert.equal((await c.send(cb)).location,'/');
  const setup=(await c.send('state')).body; assert.equal(setup.googleProfile.email,'alex@gmail.com'); assert.equal(setup.googleProfile.sub,undefined);
  assert.equal((await c.send('setup',{household:'Google home',name:'Alex',email:'forged@evil.test',googleSub:'forged'})).status,200);
  const state=(await c.send('state')).body; assert.equal(state.user.login,'alex@gmail.com'); assert.equal(state.user.googleConnected,true); assert.equal(state.user.googleSub,undefined); assert.equal(c.cookies().dh_google_setup,undefined);
  await c.send('logout',{}); await c.send(await begin(c,p)); assert.equal((await c.send('state')).body.user.id,state.user.id);
  assert.equal((await read(db)).state.members.length,1); assert.ok(!JSON.stringify((await read(db)).state).includes('never-stored'));
});
test('Google rejects uninvited accounts and never silently links matching email addresses',async()=>{
  const {db}=await fixture(),p=await provider({email:'ren@example.com'}),c=client(db,env,p.fetch);
  assert.ok((await c.send(await begin(c,p))).location.includes('auth_error='));
  assert.equal((await c.send('state')).body.signedOut,true); assert.equal((await read(db)).state.members.length,1); assert.equal((await read(db)).state.members[0].googleSub,undefined);
});
test('explicit Google connection authenticates the existing member and supports later Google sign-in',async()=>{
  const {db,p,c}=await fixture(),guest=client(db,env,p.fetch);
  assert.ok((await guest.send('auth/google/start?link=1')).location.includes('auth_error='));
  const original=(await c.send('state')).body.user.id;
  assert.equal((await c.send(await begin(c,p,true))).location,'/?google=connected');
  assert.equal((await c.send('state')).body.user.googleConnected,true);
  await c.send('logout',{}); await c.send(await begin(c,p)); assert.equal((await c.send('state')).body.user.id,original);
});
test('Google state is browser-bound and one-time; logout invalidates a pending connection; cancellation is recoverable',async()=>{
  const {db,p,c}=await fixture(),cb=await begin(c,p,true);
  assert.ok((await client(db,env,p.fetch).send(cb)).location.includes('auth_error='));
  await c.send('logout',{}); assert.ok((await c.send(cb)).location.includes('auth_error=')); assert.ok((await c.send(cb)).location.includes('auth_error='));
  const cancel=await begin(c,p); assert.ok((await c.send(cancel.replace('code=valid-code','error=access_denied'))).location.includes('cancelled'));
});
test('Google rejects expired, unverified, wrong-audience, wrong-nonce, wrong-issuer and forged tokens',async()=>{
  for (const [claims,bad] of [[{exp:1},false],[{email_verified:false},false],[{aud:'other'},false],[{nonce:'wrong'},false],[{iss:'https://evil.test'},false],[{},true]]) {
    const db=database(),p=await provider(claims,bad),c=client(db,env,p.fetch); assert.ok((await c.send(await begin(c,p))).location.includes('auth_error='));
    assert.equal((await c.send('state')).body.googleProfile,undefined); assert.equal(await read(db),null);
  }
});
test('Google configuration, canonical origin and flow expiry are enforced without returning secrets',async()=>{
  const db=database(),unconfigured=client(db,{});
  assert.equal((await unconfigured.send('state')).body.googleEnabled,false); assert.ok((await unconfigured.send('auth/google/start')).location.includes('not%20configured'));
  assert.ok((await client(db,{...env,APP_ORIGIN:'https://production.test'}).send('auth/google/start')).location.includes('configured%20website'));
  const p=await provider(),c=client(db,env,p.fetch),cb=await begin(c,p); await db.prepare('UPDATE oauth_flows SET expires = ?').bind(Date.now()-1).run();
  assert.ok((await c.send(cb)).location.includes('expired')); assert.ok(!JSON.stringify((await c.send('state')).body).includes(env.GOOGLE_CLIENT_SECRET));
});
test('a Google account cannot be attached to two members; shared-screen PIN sessions cannot link Google',async()=>{
  const {db,p,c}=await fixture();
  assert.equal((await c.send(await begin(c,p,true))).location,'/?google=connected');
  await c.send('members/add',{name:'Mia',login:'mia',password:'child-password',pin:'1234',role:'child'});
  const childId=(await c.send('state')).body.members.find(m=>m.role==='child').id;
  const child=client(db,env,p.fetch); await child.send('login',{login:'mia',password:'child-password'});
  assert.ok((await child.send(await begin(child,p,true))).location.includes('already%20connected'));
  await c.send('pair',{}); const screen=client(db,env,p.fetch); screen.setCookies({dh_device:c.cookies().dh_device});
  await screen.send('switch',{memberId:childId,pin:'1234'});
  assert.ok((await screen.send('auth/google/start?link=1')).location.includes('password'));
  assert.equal((await read(db)).state.members.find(m=>m.id===childId).googleSub,undefined);
});
