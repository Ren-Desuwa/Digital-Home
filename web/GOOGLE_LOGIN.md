# Google sign-in setup

Production website: https://digital-home.ren-desuwa.workers.dev

## 1. Create a Google OAuth web client

1. Open https://console.cloud.google.com/ and select a project.
2. Open Google Auth Platform. Set Branding name to Digital Home, and choose your support/developer contact email.
3. Under Audience, choose External for personal Google accounts. While in Testing, add the family accounts you will test with as test users.
4. Under Clients, create an OAuth client of type Web application.
5. Add authorized JavaScript origins:
   - `https://digital-home.ren-desuwa.workers.dev`
   - `http://localhost:5173`
6. Add authorized redirect URIs (exact paths; no trailing slash):
   - `https://digital-home.ren-desuwa.workers.dev/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback`
7. Save the client ID and client secret. Only `openid email profile` scopes are requested. No Gmail/Drive/Calendar API access is requested.

Official guide: https://developers.google.com/identity/openid-connect/openid-connect

## 2. Store credentials in Cloudflare

From the `web` directory:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.production.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.production.jsonc
```

Each command prompts for its value. Do not put secrets into source files, screenshots, chat, or shell arguments. The production configuration already sets the non-secret APP_ORIGIN to the deployed website address. Google sign-in is available only when all three runtime values are configured.

For optional local testing, copy `.dev.vars.example` to ignored `.dev.vars`, fill values locally, and restart the dev server. Local APP_ORIGIN must match the URL you open. Use localhost:5173, not 127.0.0.1:5173, with the example settings.

## 3. Apply migration and deploy

```sh
npm test
npm run typecheck
npm run build
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

The new `0001_google_oauth.sql` migration only adds the temporary OAuth-flow table; it does not modify or erase household data. Do not replay SQL manually against existing production tables.

## 4. First use

- If the household is not set up: choose Sign in with Google, consent, then finish the household name and parent name. The verified Google email becomes the parent's login. No local password is required. Save the recovery code shown after setup; it can set a password if Google access is lost.
- If the household already exists: sign in normally, go to Household and choose Connect Google account on YOUR member card. Finish the Google flow. Next time use Sign in with Google.
- Unconnected Google accounts are refused, including accounts with an email matching an existing member. Google identity is linked only after existing account authentication. Parents add members through the existing household workflow.
- A shared-screen PIN session cannot connect Google; the member must use their password login first. Child usernames/passwords and PIN switching continue to work.

Test successful login, a non-member account, cancellation, and the phone layout before sharing the updated release with the family.

## Troubleshooting

- `redirect_uri_mismatch`: match the callback URI exactly, including scheme, host, port and path.
- `access_denied` while Testing: add the Google account under Audience / Test users.
- Disabled Google button: configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_ORIGIN, then deploy. Do not enter dummy credentials in production.
- Message to connect an existing member: use password login, then connect from that member's Household card.
- Origin message: open the configured APP_ORIGIN. Add new origins/redirect URIs in Google and update APP_ORIGIN when changing domains.

## Security behavior

Authorization code + PKCE (S256), browser-bound one-time state, nonce, a ten-minute expiry, atomic consumption of OAuth attempts, RS256 signature verification against Google's JWKS, and issuer/audience/expiry/verified-email checks. Secrets are server-only. Google access/refresh tokens are not persisted. Household sessions use the existing secure cookie/session implementation. No public registration is added after household setup.
