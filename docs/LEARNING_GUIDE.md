# Learn this project one small step at a time

## Lesson 1: a screen is not a database

React and Flutter draw screens. They must not connect directly to MongoDB because doing so would expose database credentials to everyone who installs the app or loads the website.

Instead, both frontends send a message to our backend. That message is an **HTTP request**. The backend’s reply is an **HTTP response**. The address that handles a particular message is an **API endpoint**.

Example: `POST /api/auth/login` means “send login information to the backend.” `GET /api/auth/me` means “tell me who owns my current session.”

## Lesson 2: the password-login journey

1. You type `demo` and a password in Flutter or React.
2. The frontend checks that neither field is empty. This is just a helpful first check, not security.
3. It sends `{ "identifier": "demo", "password": "..." }` to `/api/auth/login`.
4. Express validates the message again. A person can bypass the screen and call an API directly, so the backend never trusts frontend validation alone.
5. The backend asks MongoDB for the user with that ID or email.
6. It compares the supplied password with the stored **password hash**, using bcrypt.
7. If they match, it creates a random **session token** and saves a hash of that token in MongoDB.
8. The frontend receives the account’s safe public details. It shows a signed-in confirmation, not a dashboard yet.

```text
React/Flutter → POST login → check input → find user → compare password
                                                         │
                                              create session in MongoDB
                                                         │
                         show success ← send safe account details
```

A password hash is a one-way representation, not a plaintext password and not ordinary reversible encryption. We use a library rather than inventing password security ourselves.

You can create an account with **New here? Create account** on web or mobile.
The form sends your name, email, password, and confirmation to `/api/auth/register`.
The backend checks them, hashes the password, and creates your account and session.
`npm run seed` is now only an optional shortcut for the learning account.

## Lesson 3: why we have sessions

We do not want to send your password every time the app needs something. After login, the backend issues a random token that acts like an entry ticket.

- **Browser:** the backend sets an `HttpOnly` cookie. Browser JavaScript cannot read this cookie. Requests include it automatically; React uses `credentials: 'include'`. We do not store session tokens in `localStorage`.
- **Mobile:** the API returns the token. Flutter stores it through `flutter_secure_storage` and sends `Authorization: Bearer TOKEN` on later requests.
- **Database:** stores the token’s SHA-256 hash, user ID and expiry time, not the usable token itself.

The web and mobile formats differ, but they both point to the same `users` collection and use the same authentication service. Each login gets its own session. Signing out on one device revokes that device’s session; it does not sign out every other device.

On startup the client calls `/auth/me`. A valid session restores your signed-in state. Expired or revoked sessions return `401`, which means “you need to sign in.”

When you press Sign out, the backend deletes the session. Flutter clears secure storage; the browser cookie is cleared. MongoDB also has a TTL index to clean expired sessions, but the backend checks expiry itself instead of relying on background cleanup timing.

## Lesson 4: Google login is a different identity check

1. The browser uses Google Identity Services; Flutter uses the native Google sign-in SDK.
2. Google asks the person to select/sign into an account.
3. Google returns an **ID token**: signed evidence about that identity.
4. The frontend sends that token to `/api/auth/google`.
5. The backend verifies its signature, expiry, issuer and allowed audience using Google’s library. It also requires a verified email.
6. The backend finds or creates a user using Google’s stable subject identifier, `sub`.
7. It creates the **same kind of LifeOS session** used by password login.

A Google ID token and a LifeOS session token are not the same thing. We do not use a Google token as our app’s permanent session, and we do not ask for Google Drive/Gmail permissions. This milestone only needs identity, not access to Google services.

We also do not silently merge a password account with a Google account merely because their emails match. Safe account linking requires a separate flow that proves ownership of the existing account.

## Lesson 5: read the code in this order

### First: the screen

- `apps/web/src/App.jsx`: form, password visibility, loading state, success state and logout.
- `apps/mobile/lib/screens/login_screen.dart`: the same experience written with Flutter widgets.

Ignore the decorative website preview for now. It has no backend behavior.

### Second: the message sent by the screen

- `apps/web/src/api.js`: browser requests, cookies and friendly network errors.
- `apps/mobile/lib/auth/auth_api.dart`: mobile requests and the bearer header.
- `apps/mobile/lib/auth/auth_controller.dart`: coordinates the current account, secure token storage and loading/errors.

React uses state to redraw its screen. Flutter uses a `ChangeNotifier` and `AnimatedBuilder`. Both simply mean “when account/loading/error values change, refresh the UI.”

### Third: the backend

- `server/src/index.js`: connects to MongoDB and starts the HTTP server.
- `server/src/app.js`: endpoint definitions, request validation, cookies and rate limiting.
- `server/src/auth.js`: password verification, Google verification and session creation/revocation.
- `server/src/models.js`: describes what a user and session look like in MongoDB.
- `server/src/seed.js`: creates the learning account without storing its plaintext password.

The authentication logic receives small user/session repositories. In real use these talk to MongoDB. In fast automated tests they use in-memory test doubles. This lets us test failure cases without needing a database for every test.

## Lesson 6: make one change and observe it

Try these in order:

1. Change “Welcome back.” in React and run the website. That is a frontend-only change.
2. Change the same heading in Flutter and hot reload. Now you have changed both clients, with no backend change.
3. Enter a wrong password. Find the backend message in `auth.js`, and notice how both frontends display it.
4. Use the correct password. Refresh the website or restart the mobile app. Watch how the session is restored.
5. Sign out, then call `/auth/me`. The old session no longer works.
6. Configure Google and sign in with the same Google account on web and mobile. Both should show the same user ID from the API, while their session tokens remain separate.

Registration is included now. Try it with the steps in `docs/EMAIL_AUTH.md`.
Password reset and a real protected home screen remain separate milestones.
