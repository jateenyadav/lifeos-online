# Shared authentication API

Development base: `http://localhost:4000/api`. Flutter appends endpoint paths to its configured `API_BASE_URL`, which must include `/api`.

## Endpoints

- `GET /health`: check server and database readiness.
- `POST /auth/register`: create an email/password account and sign in.
- `POST /auth/login`: sign in with an ID or email and password.
- `POST /auth/google`: verify a Google ID token and sign in.
- `GET /auth/me`: return the current user.
- `POST /auth/logout`: revoke this session and clear the cookie.
- `GET /workspaces`: load this account's daily spaces.
- `POST`, `PATCH`, and `DELETE /workspaces/...`: create, update, and remove owned entries. See [the workspace guide](WORKSPACES.md) for the routes and fields.
- `POST /workspaces/money/notifications`: queue a parsed INR payment for review. The current Android reader uses this route.
- `POST /workspaces/money/payments` and `/payments/:id/confirm`: save reviewed payment details.
- `POST /workspaces/money/payments/:id/dismiss`: ignore a pending payment.
- `POST /workspaces/money/trips` and `/trip-items`: save trip plans, shared costs, and repayments.
- `GET /workspaces/money/summary`: get people and trip balances. See [Money review](MONEY_REVIEW.md) for all fields.
- `POST /workspaces/notification-expenses`: legacy automatic expense import for older clients only. The current client does not use it.

### Legacy notification expense request

Older native Android readers send structured fields, never the full notification.
For current pending-review requests, follow [Money review](MONEY_REVIEW.md).
Use the same mobile session header as other workspace requests.

```json
{
  "title": "Payment to Lunch shop",
  "date": "2026-10-07",
  "amountMinor": 12550,
  "category": "Other",
  "payment": "UPI",
  "note": "Auto-added from a new notification. Please check the details.",
  "currency": "INR",
  "sourceApp": "com.example.bank",
  "notificationKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

`amountMinor` is whole paise. `notificationKey` is a 64-character lowercase hexadecimal SHA-256 code.
The server adds `source: "notification"` and does not return the duplicate code.
It returns HTTP 200 with `{ "entry": ... }` for both a new import and a retry.
A retry does not overwrite your edits.
If you previously deleted the imported expense, it returns `{ "entry": null }` and does not restore it.
Deleting an imported expense keeps a hidden duplicate marker in storage.
The normal expense endpoint does not accept notification metadata from manual editors.

The date is the local day the notification was posted, not an independently verified bank settlement date.
Only INR is accepted. Other currencies need separate accounting support.

### Registration request

```json
{
  "name": "New Learner",
  "email": "learner@example.com",
  "password": "YOUR_NEW_PASSWORD",
  "confirmPassword": "YOUR_NEW_PASSWORD"
}
```

The name must contain 1 to 100 characters after trimming.
The email must be valid and at most 254 characters.
Emails are trimmed and lowercased before storage.
Passwords need at least 8 characters and at most 72 UTF-8 bytes.
Confirmation must match exactly. Password whitespace is preserved.
Registration returns `201` with the same session response as login.
Duplicate emails return `409`, including emails already used by Google accounts.
Unique database indexes also prevent duplicate accounts during simultaneous requests.
Registered accounts have `loginId: null` and sign in using their email.
No email is sent. Email ownership is not verified by password registration.

### Password request

```json
{ "identifier": "demo", "password": "YOUR_PASSWORD" }
```

Identifiers are trimmed and lowercased. Passwords are not trimmed. Passwords longer than 72 UTF-8 bytes are rejected to avoid bcrypt’s truncation behavior.

### Google request

```json
{ "idToken": "TOKEN_RETURNED_BY_GOOGLE" }
```

The backend verifies the actual token. Sending a name, email or Google user ID alone cannot authenticate a user.

### Website response

```json
{
  "user": {
    "id": "MONGODB_USER_ID",
    "name": "LifeOS Learner",
    "email": "demo@lifeos.local",
    "loginId": "demo",
    "provider": "password"
  },
  "expiresAt": "SESSION_EXPIRY_ISO_TIMESTAMP"
}
```

The backend sets an HttpOnly session cookie; it does **not** include a token in the JSON response for browser requests. The browser uses `credentials: 'include'`. Google users have `provider: "google"` and may have a null `loginId`.

### Native response

Native clients send `X-Client-Type: mobile`, without a browser Origin. The response additionally contains `token`. Later requests send `Authorization: Bearer TOKEN`. Flutter stores this token in platform secure storage.

The client-type header only selects a transport; it is **not proof of identity**. All authenticated endpoints still verify the session. A request with a browser Origin cannot bypass origin validation by claiming to be mobile.

### Error response

```json
{ "message": "Incorrect ID/email or password." }
```

- `400`: invalid request data or JSON.
- `401`: incorrect credentials, invalid Google identity or missing/expired session.
- `403`: rejected request origin.
- `409`: email already registered, or a Google account conflicts with an existing account.
- `413`: request body exceeds 16 KB.
- `429`: too many requests/sign-in attempts.
- `503`: Google configuration missing, or database unavailable at the health endpoint.

Logout returns `204` with no JSON body. It is idempotent: calling it for an already-ended session is safe.

## Database collections

`users` contains normalized email, optional login ID, display name, optional bcrypt password hash, optional unique Google subject ID and timestamps. Password hashes are excluded from normal queries and never returned in public responses.

`sessions` contains a SHA-256 hash of a random 32-byte token, user reference, expiry and timestamps. Token hashes are unique. Expiry has a MongoDB TTL index; the API also checks it on every session lookup.

Session duration defaults to seven days. Sessions are not refreshed indefinitely. Every device/browser gets its own session; a fresh login with an existing session rotates/revokes that old session.

## Included safeguards

- Backend schema validation and fixed string-based queries.
- bcrypt password hashing; no plaintext password persistence.
- Verified Google signature/issuer/expiry/audience and verified email.
- No automatic email-based account linking.
- HttpOnly browser cookies, Secure host-prefixed cookies in production, and explicit SameSite settings.
- Exact web-origin allowlist, mutation-origin checks and credentialed CORS.
- API rate limiting and a stricter sign-in limiter.
- Secure mobile token storage, disabled Android backups and debug-only local HTTP exceptions.
- Session revocation, explicit expiry and no-store responses.
- Validated, rate-limited password registration with hashed passwords and unique emails.
- No default production seed account.

## Personal AI

The signed-in user can access `/api/ai`. Write requests use the same origin checks as workspace routes.

- `GET /api/ai/status`: local Ollama status, installed model names, and the default local model.
- `GET /api/ai/knowledge`: the user's saved knowledge documents.
- `POST /api/ai/knowledge`: save `{ title, topic, content }`. Topic is `workouts`, `routines`, or `spending`.
- `DELETE /api/ai/knowledge/:id`: remove one owned knowledge document.
- `POST /api/ai/chat`: answer a question using selected private saved data.

Chat fields are `provider`, `model`, `question`, `topics`, and optional `history`.
`provider` is `local`, `openai`, or `bedrock`.
`history` contains at most three alternating user/assistant pairs, with 1,000 characters per message.
Cloud requests also require `cloudConsent: true` and `credentials`.
OpenAI credentials contain `apiKey`.
Bedrock credentials contain `region`, `accessKeyId`, `secretAccessKey`, and optional `sessionToken`.
Local requests reject credential fields and never fall back to the cloud.
Responses include `answer`, `provider`, `model`, `sources`, scanned `counts`, and `limited`.
Only one answer may run per user at a time. Chat is limited to 12 requests per minute per client IP.
Provider calls time out after two minutes. AI request bodies have a 64 KB limit.
Keys and chat are not persisted. Cloud keys require HTTPS for non-loopback clients.
See [Personal AI](PERSONAL_AI.md) for setup, privacy, retrieval limits, and examples.

## Before deploying publicly

1. Use HTTPS for both website and API; update all public origins and OAuth settings. Host the website and `/api` behind one origin/reverse proxy when possible.
2. The web app’s default `/api` URL needs a real production reverse proxy. Vite’s development proxy does not exist in the built files. Otherwise, set `VITE_API_URL` to your HTTPS API URL before building and configure credentialed CORS.
3. Set `NODE_ENV=production`, a protected MongoDB connection and exact HTTPS `WEB_ORIGINS`. Use authenticated MongoDB/Atlas with restricted network access; the provided no-auth Docker service is localhost-only development infrastructure.
4. Set `COOKIE_SAME_SITE=none` only when cross-site cookies are truly required. Production cookies are Secure. Browser third-party-cookie restrictions may still block cross-site sessions; prefer same-origin deployment.
5. Set `TRUST_PROXY_HOPS` only to match your real proxy topology; never blindly trust every incoming forwarded address.
6. Replace the in-memory rate-limit store with a shared persistent limiter when running multiple instances. Add account-focused abuse controls and monitoring, not just IP limits.
7. Remove demo access, define real account provisioning, and add registration/email verification/password reset as deliberate separate features.
8. Add password changes, session management/revoke-all, CSRF protections appropriate to your deployed architecture, operational logging without secrets, and security review.
9. Configure Android release signing and Apple provisioning, real app IDs/icons and approved Google branding. Review iOS Google-login rules and implement another login option if required.
10. Test real Google sign-in and native secure storage on actual devices. Unit tests/mock providers are not a replacement for SDK, OAuth or store-review checks.
