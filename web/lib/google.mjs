// Google authorization-code flow. Tokens and client secrets never reach the UI.
const encoder = new TextEncoder();
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const lifetime = 10 * 60 * 1000;
export class GoogleError extends Error {}
const ensure = (condition, message) => { if (!condition) throw new GoogleError(message); };
const base64url = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bytes = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hash = async value => base64url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const readCookie = (request, name) => request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.slice(name.length + 1);
export const googleCookie = (request, name, value, seconds, sameSite = 'Lax') => `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
export function googleConfigured(env) { return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.APP_ORIGIN); }
function originFor(request, env) {
  ensure(googleConfigured(env), 'Google sign-in is not configured yet.');
  const origin = new URL(env.APP_ORIGIN).origin;
  ensure(new URL(request.url).origin === origin, 'Open the configured website address to use Google sign-in.');
  return origin;
}
export function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  return new Response(null, { status: 303, headers });
}
export async function startGoogle(request, db, env, actor = null) {
  const origin = originFor(request, env);
  const state = random(), verifier = random(), nonce = random();
  await db.prepare('DELETE FROM oauth_flows WHERE expires < ?').bind(Date.now()).run();
  await db.prepare('INSERT INTO oauth_flows (id, data, expires) VALUES (?, ?, ?)').bind(await hash(state), JSON.stringify({ kind: 'authorize', verifier, nonce, actor }), Date.now() + lifetime).run();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: origin + '/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: await hash(verifier), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return redirect(url.href, [googleCookie(request, 'dh_google_flow', state, lifetime / 1000)]);
}
async function verifyToken(token, env, nonce, transport) {
  ensure(typeof token === 'string' && token.length < 16000, 'Google did not return a valid identity.');
  const parts = token.split('.'); ensure(parts.length === 3, 'Google identity could not be verified.');
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(bytes(parts[0]))); claims = JSON.parse(new TextDecoder().decode(bytes(parts[1]))); } catch { throw new GoogleError('Google identity could not be verified.'); }
  ensure(header.alg === 'RS256' && typeof header.kid === 'string', 'Google identity could not be verified.');
  const keysResponse = await transport(KEYS_URL, { signal: AbortSignal.timeout(10000) });
  ensure(keysResponse.ok, 'Google verification is temporarily unavailable. Try again.');
  const jwks = await keysResponse.json();
  const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === 'RSA'); ensure(jwk, 'Google identity could not be verified. Try signing in again.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
  const now = Date.now() / 1000;
  ensure(valid && ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) && claims.aud === env.GOOGLE_CLIENT_ID && (!claims.azp || claims.azp === env.GOOGLE_CLIENT_ID) && typeof claims.exp === 'number' && claims.exp > now && typeof claims.iat === 'number' && claims.iat <= now + 60 && claims.nonce === nonce, 'Google identity could not be verified.');
  ensure(typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub.length <= 255 && claims.email_verified === true && typeof claims.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) && claims.email.length <= 120, 'A verified Google email address is required.');
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: typeof claims.name === 'string' ? claims.name.slice(0, 60) : claims.email.split('@')[0] };
}
export async function finishGoogle(request, db, env, transport = fetch) {
  const origin = originFor(request, env), params = new URL(request.url).searchParams;
  const state = params.get('state');
  ensure(state && state === readCookie(request, 'dh_google_flow'), 'Google sign-in expired or was not started in this browser. Try again.');
  // DELETE RETURNING consumes the authorization attempt atomically, preventing replay.
  const row = await db.prepare('DELETE FROM oauth_flows WHERE id = ? AND expires > ? RETURNING data').bind(await hash(state), Date.now()).first();
  ensure(row, 'Google sign-in expired or has already been used. Try again.');
  const flow = JSON.parse(row.data); ensure(flow.kind === 'authorize', 'Invalid Google sign-in attempt.');
  ensure(!params.has('error'), 'Google sign-in was cancelled. You can still use your password.');
  const code = params.get('code'); ensure(code && code.length < 4096, 'Google did not return a sign-in code.');
  const response = await transport(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, code_verifier: flow.verifier, grant_type: 'authorization_code', redirect_uri: origin + '/api/auth/google/callback' }), signal: AbortSignal.timeout(10000) });
  ensure(response.ok, 'Google sign-in could not be completed. Please try again.');
  const tokens = await response.json();
  return { actor: flow.actor, profile: await verifyToken(tokens.id_token, env, flow.nonce, transport) };
}
export async function saveGoogleSetup(request, db, profile) {
  const token = random();
  await db.prepare('INSERT INTO oauth_flows (id, data, expires) VALUES (?, ?, ?)').bind(await hash(token), JSON.stringify({ kind: 'setup', profile }), Date.now() + lifetime).run();
  return googleCookie(request, 'dh_google_setup', token, lifetime / 1000, 'Strict');
}
export async function googleSetupProfile(request, db) {
  const token = readCookie(request, 'dh_google_setup'); if (!token) return null;
  const row = await db.prepare('SELECT data FROM oauth_flows WHERE id = ? AND expires > ?').bind(await hash(token), Date.now()).first();
  if (!row) return null;
  const flow = JSON.parse(row.data); return flow.kind === 'setup' ? flow.profile : null;
}
export async function clearGoogleSetup(request, db) {
  const token = readCookie(request, 'dh_google_setup'); if (token) await db.prepare('DELETE FROM oauth_flows WHERE id = ?').bind(await hash(token)).run();
}
