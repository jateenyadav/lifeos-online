# Make Google login work

The Google login code is connected to the shared backend.
Real login still needs client IDs from your own Google project.
No example ID can sign someone in.

A **client ID** is a public nameplate for your app.
It tells Google which app is asking someone to sign in.
It is not a password or a client secret.

**OAuth** is the system used for this Google sign-in handshake.
Think of Google checking your ID before a venue gives you its own wristband.
LifeOS asks for your basic identity, not your Gmail messages or Drive files.
Firebase is not needed for this implementation.

## 1. Create your Google project

1. Open `https://console.cloud.google.com/` in your browser.
2. Sign in to your Google account.
3. Click the project picker near the top left.
4. Click **New Project**.
5. Enter `LifeOS` as the project name.
6. Click **Create**. Select the new project after it finishes.
7. Open the left menu. Choose **Google Auth Platform**, then **Branding**.
8. If Google shows **Google Auth platform not configured yet**, click **Get Started**.
9. Under **App Information**, set **App name** to `LifeOS`. Choose your **User support email**. Click **Next**.
10. Under **Audience**, choose **External** for normal personal Google accounts. Click **Next**.
11. Under **Contact Information**, enter your email address. Click **Next**.
12. Read the policy shown under **Finish**. If you agree, select its agreement box. Click **Continue**, then **Create**.
13. Open **Audience**. Under **Test users**, click **Add users**. Enter the Google email you will use to test. Click **Save**.

Keep the project in testing while learning.
If Branding is already configured, keep it and check the audience and test users.
The basic `openid`, `email` and `profile` identity permissions are enough.
Do not add Gmail or Drive permissions for login.

## 2. Create the Web application client

An **origin** is a website's exact starting address.
Think of it as the building address without a room number.
A **port** is a numbered door on your computer.
The website uses port `5173`.
The backend uses port `4000`.

1. In the same Google project, open **Google Auth Platform**, then **Clients**.
2. Click **Create client**.
3. Set **Application type** to **Web application**.
4. Set **Name** to `LifeOS Web`.
5. Under **Authorized JavaScript origins**, click **Add URI** for each address below.

```text
http://localhost
http://localhost:5173
http://127.0.0.1:5173
```

6. Leave **Authorized redirect URIs** empty for this app.
7. Click **Create**.
8. Copy the **Client ID**. Do not copy the **Client secret**.

The client ID usually ends in `.apps.googleusercontent.com`.
Do not use the example `123456789-abc.apps.googleusercontent.com`.
Use the actual value Google gives you.

LifeOS uses a popup and a JavaScript callback.
A **callback** is a function Google calls when the sign-in result is ready.
Think of it as a doorbell that announces a delivery.
There is no `/callback` backend address to register.

## 3. Put the client ID into LifeOS

Open a terminal in `/Users/jateenyadav/Desktop/projects/LifeOs`.

```sh
npm run setup:google
```

1. At **Paste your Google Web application client ID**, paste the real Web client ID. Press Enter.
2. At the iOS prompt, press Enter if you only want to start with the website or Android.
3. The script saves the same Web client ID in these three places:

- `apps/web/.env`: `VITE_GOOGLE_CLIENT_ID` lets the website ask Google to sign in.
- `server/.env`: `GOOGLE_CLIENT_IDS` tells the backend which app IDs it trusts.
- `apps/mobile/config/development.json`: `GOOGLE_WEB_CLIENT_ID` lets Flutter request a token for the same backend.

The script keeps your database URL, passwords, mobile API URL and other settings.
It keeps any existing backend client IDs and does not add duplicates.
It creates missing local configuration from the example files.
It rejects malformed IDs, obvious placeholders and client secrets before writing files.
It cannot prove that a correctly shaped ID exists in Google or has the right client type.

For a non-interactive terminal, replace `YOUR_REAL_WEB_CLIENT_ID` with the actual value:

```sh
npm run setup:google -- --web-client-id YOUR_REAL_WEB_CLIENT_ID
```

Check the local files:

```sh
npm run setup:google -- --check
```

**Web: client IDs match** means the website ID is on the backend's trusted list.
Android and iOS messages only check local configuration.
They do not prove that the native apps are registered in Google.
Missing Web configuration makes this check exit with code `1`.
The check does not change files.

## 4. Run and try the website

Start Docker Desktop if your database is the local Docker database.

```sh
npm run db:up
```

This starts MongoDB, the app's storage room.

```sh
npm run dev
```

This starts the backend and website together.
If it is already running, press Control+C in its terminal, then start it again.
Changing client IDs needs a restart.

1. Open `http://localhost:5173`.
2. Click **Continue with Google**.
3. Choose the test Google account you added in the console.
4. Confirm that LifeOS shows **Successfully signed in**.
5. Refresh the page. You should stay signed in.
6. Click **Sign out**. Refresh again. You should see the login screen.

Google does not send your Google password to LifeOS.
The first Google login creates your LifeOS user automatically.
Later logins reuse that same user.
No demo password or database seed is needed for a new Google user.

## 5. Enable Android Google login

Android needs a separate client registration in the same Google project.
Its Web/server client ID still comes from step 3.

The **package name** is Android's unique label for your app.
Use this exact value:

```text
com.lifeos.lifeos_mobile
```

A **SHA-1 fingerprint** is a short label for the certificate that signs the app.
Think of it as a fingerprint of the app maker's stamp.
Google checks both the package name and this stamp.

On this Mac, Android Studio supplies Java even if the normal `keytool` command reports that Java is missing:

```sh
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" -list -v -alias androiddebugkey -keystore "$HOME/.android/debug.keystore" -storepass android -keypass android
```

1. Run the command. Copy the value on the **SHA1** line.
2. Open **Google Auth Platform**, then **Clients**.
3. Click **Create client**.
4. Set **Application type** to **Android**. Set **Name** to `LifeOS Android Debug`.
5. Set **Package name** to `com.lifeos.lifeos_mobile`.
6. Paste the fingerprint into **SHA-1 certificate fingerprint**. Click **Create**.
7. Keep the Web client ID in `GOOGLE_WEB_CLIENT_ID`. Do not replace it with the Android client ID.

The Android client ID does not need to go into a local file here.
Its registration lets Google recognize the installed Android app.
This implementation passes `serverClientId` directly, so it does not require `google-services.json`.
Register your release certificate separately before shipping a release.

From the project root:

```sh
cd apps/mobile
flutter run --dart-define-from-file=config/development.json
```

Keep the backend running in another terminal.
Choose your Android emulator when Flutter asks.
The emulator reaches the backend at `http://10.0.2.2:4000/api`.
A real phone needs your computer's Wi-Fi address in `API_BASE_URL`.

## 6. Enable iOS Google login

The **bundle ID** is iOS's unique label for your app.
It is case-sensitive.
Use this exact value:

```text
com.lifeos.lifeosMobile
```

1. In the same Google project, open **Google Auth Platform**, then **Clients**.
2. Click **Create client**.
3. Set **Application type** to **iOS**. Set **Name** to `LifeOS iOS`.
4. Set **Bundle ID** to `com.lifeos.lifeosMobile`. Click **Create**.
5. Copy the new iOS **Client ID**.
6. From the project root, run `npm run setup:google` again.
7. Paste the Web client ID at the first prompt. Paste the iOS client ID at the second prompt.

The script writes `GOOGLE_IOS_CLIENT_ID` to `apps/mobile/config/development.json`.
It also writes `GOOGLE_REVERSED_CLIENT_ID` to `apps/mobile/ios/Flutter/GoogleAuth.xcconfig`.
That same file now stores `GOOGLE_WEB_CLIENT_ID` and `GOOGLE_IOS_CLIENT_ID`.
Both `Info.plist` and `Info-Debug.plist` use these values as `GIDServerClientID` and `GIDClientID`.
Flutter reads these native IDs at startup when no build argument was supplied.
Explicit Flutter build arguments take priority.

A **URL scheme** is a special address that opens your app.
Think of it as the return door from Google's sign-in screen.
For an iOS client ID `123456789-abc.apps.googleusercontent.com`, the return address starts with `com.googleusercontent.apps.123456789-abc`.
The script makes that reversal for you.
Both iOS Info.plist files already reference this setting.

Fully stop Flutter and run it again with the configuration file.
After setup, iOS Google IDs also load from Xcode or plain `flutter run`.
This fallback only loads Google IDs, not a custom backend address.
Hot reload is not enough because these values become part of the built app.
The iOS simulator reaches the backend at `http://127.0.0.1:4000/api`.
Use your own Apple development team and signing settings for a real iPhone.

## 7. How the login works, exactly

```text
Screen (React or Flutter) → Checker (Express) → Storage (MongoDB)
           ↑                       ↑
           └──── Google proof ─────┘
```

1. You press **Continue with Google**. React loads Google's official button. Flutter opens the native Google sign-in screen.
2. Google checks your Google account. It returns an **ID token**, a signed identity card that says who you are and which app it is for.
3. React or Flutter sends only that token to `POST /api/auth/google`. It does not send a Google password or trust a typed email address.
4. `server/src/auth.js` calls Google's `verifyIdToken` library. The library checks the signature, Google issuer, intended app ID and expiry. The server also requires a verified email and Google's stable user ID, `sub`.
5. The backend looks for that Google ID in MongoDB. It creates a new user if needed. Name and email come from the checked token, not from untrusted screen fields.
6. If that email already belongs to a password account, login returns `409`. This means a conflict. LifeOS refuses to merge accounts silently. Use the existing password account instead.
7. The backend creates a **session**, LifeOS's own event wristband. It lasts `7` days with the current `SESSION_DAYS=7` setting. The database stores a hash of its random session token. A **hash** is a blender: token in, unreadable mush out, no reverse button.
8. On the website, the wristband goes into an **HttpOnly cookie**. A cookie is a note the browser sends back automatically. HttpOnly means React cannot read the session secret.
9. On mobile, the wristband goes into platform secure storage. Think of this as the phone's locked drawer. Flutter sends it in an `Authorization: Bearer` request header. A header is a label attached to a request envelope.
10. Opening the app again calls `GET /api/auth/me`. The backend checks the wristband against MongoDB before returning the user.
11. **Sign out** calls `POST /api/auth/logout`. The backend deletes that session. The website clears its cookie. Flutter removes its saved token and asks Google to clear its native sign-in state.

Website and phone sessions use the same user, but each has its own wristband.
Signing out on one device does not automatically sign out the other device.
LifeOS logout does not log you out of your Google account in the whole browser.

## 8. Errors and their exact fixes

### Google button is disabled

- Meaning: the website has no client ID.
- Why: `VITE_GOOGLE_CLIENT_ID` is empty.
- Fix: complete steps 1 to 3, then restart `npm run dev`.

### `This build is missing the Google Web client ID` on iOS

- Meaning: the running app has no Web client ID, even if the ID is saved on your computer.
- Why: the old app only read Flutter build arguments. Saving `development.json` did not load it into a build started without `--dart-define-from-file`.
- Fix: run `npm run setup:google` once to save both native iOS IDs. Fully stop the app, then run `npm run dev:mobile`. Rebuilding is required. Hot reload cannot change native settings.

The app now reads the native iOS settings as a fallback.
You do not need to create new Google clients if the existing ones are correct.

### Mobile Google button does not work, but the website works

- Meaning: the mobile app has not loaded its Google settings, or its native registration is missing.
- Why: Android still needs `--dart-define-from-file` and its Google registration. iOS needs both native IDs and its return URL, or matching Flutter build arguments. The Web client ID alone is not enough for iOS.
- Fix: stop the app completely. From the LifeOS root, run `npm run dev:mobile`. Choose the simulator. In VS Code, use **LifeOS mobile**, select your simulator and press **F5**.

On mobile, tapping **Continue with Google** now explains missing configuration.
Android still needs the package and SHA-1 registration from step 5.
For iOS, complete step 6 and run `npm run setup:google` with both client IDs.
This also sets the iOS return URL.
Restart using `npm run dev:mobile` after saving the settings.
Keep the backend running in a separate terminal with `npm run dev`.

### `origin_mismatch` or `invalid_client`

- Meaning: Google does not recognize the app or its website address.
- Why: the client ID is wrong, is not a Web application client, or the current origin is missing.
- Fix: open **Clients**, select `LifeOS Web`, and register the exact origins in step 2. Copy that client's ID into `npm run setup:google`. Restart the app. Allow a few minutes if Google has not applied a new client yet.

### Google button cannot load

- Meaning: the browser could not download or start Google's sign-in code within 15 seconds.
- Why: no internet, a blocked Google domain, or a privacy extension.
- Fix: allow `accounts.google.com`, check your connection, then click **Retry Google sign-in**. Password login still works independently.

### API returns `503` or `401` during Google login

An **API** is the backend's service counter.
An HTTP status code is the number on its result slip.

- Meaning: `503` means Google IDs are not configured on the backend. `401` means the proof was rejected.
- Why: `GOOGLE_CLIENT_IDS` is empty, the app ID does not match, or the token is invalid or expired.
- Fix: run `npm run setup:google`, then `npm run setup:google -- --check`. Restart the backend and sign in again for a fresh token. Never fix this by skipping verification.

### Android fails after account selection

- Meaning: Google could not authorize this installed app.
- Why: a wrong package name, signing fingerprint or `GOOGLE_WEB_CLIENT_ID`. Some configuration problems appear as a cancellation.
- Fix: repeat step 5 with the installed build's signing certificate. Keep the Web client ID as `serverClientId`. Fully restart Flutter.

### iOS cannot return to LifeOS

- Meaning: Google has no matching return door.
- Why: the iOS client ID, bundle ID or reversed URL scheme is wrong.
- Fix: repeat step 6, then fully rebuild Flutter. Run `npm run setup:google -- --check` from the project root first.

## 9. What the tests prove

```sh
npm test
npm run lint
npm run build
```

Tests check setup-file updates, Google script retry/timeout, browser token submission, backend verification rules, shared users and separate sessions.
Automated Google-success tests simulate Google's response.
They do not prove that your Google Cloud project is configured correctly.
The final check must be a real Google account selecting **Continue with Google** on each configured platform.

## 10. Before a public release

- Use an HTTPS website and backend. Add the real website origin to Google and `WEB_ORIGINS`.
- Set `NODE_ENV=production` so browser cookies are secure.
- Review your site's popup headers. If you use Cross-Origin-Opener-Policy with Google's popup flow, allow the sign-in popup where required. Vite sets `same-origin-allow-popups` only for local development here.
- Review Google's branding and publishing requirements.
- Register production Android signing certificates, not only the debug certificate.
- Review Apple's current login-services rules before submitting an iOS app with Google login. Sign in with Apple is not implemented here.

## Official instructions

- [Google client and origin setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google consent-screen setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Google backend identity verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Flutter Android Google login](https://pub.dev/packages/google_sign_in_android)
- [Flutter iOS Google login](https://pub.dev/packages/google_sign_in_ios)
