# Email registration and login

## 1. What is included

1. Create an account on web, Android, or iOS.
2. Sign in with the same email and password on another platform.
3. Keep your login after refreshing or restarting.
4. Sign out of the current device.
5. Use Google as a separate sign-in option.

The form checks your name, email, password, and confirmation.
The backend checks them again before saving anything.
An existing email cannot be registered twice.

## 2. Start the project

Run each command from the LifeOs folder.

`npm run db:up`

This starts the local database. Skip it if you use your own database.

`npm run dev`

This starts the website at `http://localhost:5173` and backend at `http://localhost:4000/api`.

In a second terminal, run `npm run dev:mobile`.

This starts Flutter with `apps/mobile/config/development.json`.
Select your Android emulator or iOS simulator.
You do not need `npm run seed` to register an account.

## 3. Create and use your account

1. Click **New here? Create account**.
2. Enter your name and email address.
3. Enter a password with at least 8 characters.
4. Enter the same password in **Confirm password**.
5. Click **Create account**. You should see **Successfully signed in**.
6. Click **Sign out**.
7. Enter the email and password on the login screen. Click **Sign in**.
8. Use the same details on your phone. It finds the same account.
9. Refresh the website or restart the app. Your login should return.

Signing out on one device does not sign out another device.
Each device gets its own session.
A session is an entry wristband that lets the backend recognize your login.

## 4. How the parts connect

```text
Screen (React or Flutter) → Checker (Express backend) → Storage (MongoDB)
```

Screen: collects the fields and sends them to `/api/auth/register` or `/api/auth/login`.

Checker: validates the input, protects the password, and creates the login session.

Storage: keeps accounts and sessions for all three platforms.

A password hash is like a blender: the password goes in, but cannot be recovered from the result.
The backend uses bcrypt, a library that makes this protected result.
It never stores your original password or returns the hash to the screen.

The website remembers login with a protected cookie.
A cookie is a small entry ticket kept by the browser.
The mobile app keeps its ticket in the phone's secure storage.
Secure storage is the phone's locked drawer for private values.

## 5. Where the files live

- `apps/web/src/App.jsx`: web registration and login forms.
- `apps/mobile/lib/screens/login_screen.dart`: mobile registration and login forms.
- `apps/mobile/lib/auth/auth_api.dart`: mobile requests to the backend.
- `apps/mobile/lib/auth/auth_controller.dart`: mobile login state and saved sessions.
- `server/src/app.js`: request checks and `/api/auth/register` route.
- `server/src/auth.js`: account creation, password checks, and sessions.
- `server/src/models.js`: database fields and unique email indexes.

## 6. Errors and exact fixes

### This email already has an account

- Meaning: this email is already stored.
- Why: you or someone else registered it, or it was used for Google login.
- Fix: click **Already have an account? Sign in**. Use the original password or **Continue with Google**, depending on how the account was created.

Accounts are not merged just because their email addresses match.

### Passwords do not match

- Meaning: the two password fields contain different text.
- Why: a letter, space, or symbol differs.
- Fix: enter the same password in both fields. Use **Show password** to check it.

### Password must be at most 72 bytes

- Meaning: the password is too large for the password library.
- Why: text takes space. A byte is one small unit of that space. Emoji use more bytes than English letters.
- Fix: use a shorter password. Keep at least 8 characters.

### Cannot reach the server

- Meaning: the screen cannot talk to the backend.
- Why: the backend is stopped or the mobile address is wrong.
- Fix: keep `npm run dev` running. The iOS simulator uses `http://127.0.0.1:4000/api`. Android uses `http://10.0.2.2:4000/api`.

For a real phone, put your computer's Wi-Fi address into `API_BASE_URL` in `apps/mobile/config/development.json`.
Then fully restart with `npm run dev:mobile`.

## 7. What still needs separate setup

This is email and password login, not email-code login.
Registration does not send an email or prove email ownership.
Password-reset emails and account linking are not implemented.
Review `docs/API.md` before any public release.

## 8. Try rebuilding the flow

1. Start with the four registration fields in a small form.
2. Send them to `/api/auth/register`.
3. Check them with `registerSchema` in `server/src/app.js`.
4. Hash the password and create the user with `register` in `server/src/auth.js`.
5. Reuse the login session and show the signed-in account.
