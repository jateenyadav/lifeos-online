# Android login on any network

## Status (11 November 2026)

- Live: website https://lifeos-jateen.netlify.app, API on Render Free (`lifeos-api`), data in MongoDB Atlas Free.
- The repository `jateenyadav/lifeos-online` is public. Secrets live only in Render and Netlify settings.
- `WEB_ORIGINS` and the AI keys are `sync: false` in `render.yaml`, so a Blueprint sync never blanks them.
- Optional "LifeOS AI": add `GROQ_API_KEY` and/or `GEMINI_API_KEY` in Render → lifeos-api → Environment.
  Without them, Personal AI still works with local Ollama or your own OpenAI/Bedrock key.

## 1. What the error means

The app cannot reach its backend.
The backend is the checker that verifies your login.

The old default was `http://10.0.2.2:4000/api`.
That address only works inside an Android emulator.
It does not point to your computer from a real phone.
Your computer's Wi-Fi address only works on the same local network.

The fix is a public HTTPS backend and an online database.
HTTPS is a locked connection between your phone and the server.
Changing a URL cannot put a server online by itself.

## 2. Publish the code safely

This project includes `render.yaml`.
A blueprint is a recipe that tells Render how to run your server.
The recipe uses the free service plan. It does not create paid resources.

Git records file changes like a history notebook.
A repository is the project folder stored in that notebook.
The existing `.gitignore` rules keep local secrets out of Git.

The GitHub terminal sign-in works on this computer.
The intended new private repository is `jateenyadav/lifeos-online`.
The existing public repository is not used.

If creation or pushing fails, run these commands from this project folder.
Only run the repository creation command if the private repository does not already exist.

```sh
gh auth login -h github.com
git add .
git diff --cached --name-only
git commit -m "Prepare LifeOS online backend"
gh repo create lifeos-online --private --source=. --remote=origin --push
```

`gh auth login` signs you in through your own browser.
`git add .` selects files using the existing ignore rules.
The file review must not include real `.env` files, passwords, or signing keys.
`git commit` saves the selected files in the local history.
`gh repo create` creates a private repository and uploads that history.

If the repository already exists and `origin` is configured, use `git push -u origin main` instead.

The `gh` command is GitHub's terminal tool. It is already installed on this computer.
The uploaded files must include `package.json`, `package-lock.json`, `render.yaml`, and `server/`.
Do not manually upload hidden settings files through the browser.

This folder now has a local Git repository on branch `main`.
Render needs a connected code repository before it can build this blueprint.
Connecting the Render plugin alone does not upload your code or deploy it.

## 3. Prepare Render Free

Render is the online computer that runs the Express checker.
The Render connection must be enabled before an assistant can create or inspect the service.
Connecting GitHub to this chat does not connect GitHub to Render.

1. Sign in to **Render**.
2. Click **New**, then **Blueprint**.
3. Click **Connect GitHub** if needed. Sign in on GitHub yourself.
4. Allow Render to access only the private `lifeos-online` repository.
5. Return to Render and click **Connect** beside `jateenyadav/lifeos-online`.
6. Set **Blueprint Name** to `LifeOS Online`.
7. Set **Branch** to `main` and **Blueprint Path** to `render.yaml`.
8. Check that the preview contains one **Web Service**, named `lifeos-api`, with plan **Free** and region **Singapore**.
9. Render asks for `MONGODB_URI` and `GOOGLE_CLIENT_IDS`. Leave this page open. Create Atlas in another tab using section 4. Paste the private database link into Render, not chat. For the Google field, copy `GOOGLE_WEB_CLIENT_ID` from `apps/mobile/config/development.json`, as described in section 5.
10. Click **Deploy Blueprint** only after the database value is entered and the plan is still **Free**.

Do not add Render Postgres, a disk, a paid instance, or a paid workspace upgrade.
Keep a payment method off the account for this free-only setup.
If a screen requires payment, stop before accepting it.

If the service is created through the Render connection instead, use these exact settings:

- Repository: the new private `jateenyadav/lifeos-online`; branch: `main`.
- Type: Web Service; runtime: Node; name: `lifeos-api`; region: Singapore; plan: Free.
- Root Directory: leave empty. The build uses the root `package-lock.json`.
- Build Command: `npm ci --omit=dev --workspace server`.
- Start Command: `npm start --workspace server`.
- Health Check Path: `/api/health`.
- `NODE_VERSION=22`, `NODE_ENV=production`, `SESSION_DAYS=7`, `COOKIE_SAME_SITE=lax`, `TRUST_PROXY_HOPS=1`.
- `WEB_ORIGINS`: empty for the native phone app.
- `MONGODB_URI`: enter privately in Render. A service cannot start successfully without it.
- `GOOGLE_CLIENT_IDS`: the Google Web client ID described in section 5.

Render supplies the service port. The server already listens on `0.0.0.0`.
Both `/health` and `/api/health` ping the database with a 5-second timeout.
They return `{"status":"ok","database":"connected"}` only when the database answers.
The blueprint uses `/api/health` before treating the server as healthy.
`TRUST_PROXY_HOPS=1` accounts for Render forwarding HTTPS requests to Express.
`WEB_ORIGINS` is empty because this deployment is for the native mobile app.
Unknown browser origins remain blocked for writes.
If you also publish React, add its exact HTTPS origin to `WEB_ORIGINS` in Render.

## 4. Your action: create MongoDB Atlas Free

MongoDB Atlas is storage hosted online instead of on your laptop.
A cluster is the online box that holds your databases.
Your local accounts are not copied there automatically.

### A. Free cluster

1. Sign in to **MongoDB Atlas** in your own browser.
2. Open the **Projects** menu. Click **New Project** if you do not have a LifeOS project.
3. Name it `LifeOS`. Click **Next**, then **Create Project**.
4. Click **Project Overview**, then **Create**. Some accounts show **Build a Database** instead.
5. Click **Free**, also called **M0**. Do not choose **Flex** or a paid tier.
6. Choose **AWS**.
7. Choose **Singapore (ap-southeast-1)** if it is offered for Free. Otherwise choose the closest region that still says **Free**.
8. Set **Name** to `lifeos-free`.
9. Leave sample data off. Click **Create**.

### B. Database user

A database user is the backend's key to the storage box.
It is not your Atlas browser sign-in.

1. In **Security**, click **Database & Network Access**, then **Database Users**. Older screens call this **Database Access**.
2. Click **Add New Database User**.
3. Select **Password** authentication.
4. Set **Username** to `lifeos_app`.
5. Click **Autogenerate Secure Password** if offered. Save the password in your own password manager. Do not send it in chat.
6. Under **Database User Privileges**, use **Specific Privileges**, click **Add Specific Privilege**, and select **readWrite** for database `lifeos`. Leave collection empty for all collections in that database.
7. If your screen only offers built-in roles, select **Read and write to any database**. Do not select **Atlas admin**.
8. Click **Add User**. If the initial Security Quickstart appears instead, use the same username and password, then **Create Database User**.

### C. Network Access: allow all IPs

An IP address is a computer's network address, like a street address.
`0.0.0.0/0` lets any internet address reach the database login door.
It does not remove the password requirement, but it increases exposure.
Use the strong generated password. Keep it only in Render and your password manager.
The phone talks to Express, never directly to Atlas.

1. In **Security**, click **Database & Network Access**, then **IP Access List**. Older screens call this **Network Access**.
2. Click **Add IP Address**.
3. Click **Allow Access from Anywhere**. Or enter `0.0.0.0/0` in **Access List Entry**.
4. Set **Comment** to `LifeOS Render`.
5. Leave **Save as temporary access list** unchecked for this setup.
6. Click **Confirm**. Wait until the entry says **Active**.

### D. Copy the private database link

1. Click **Database**, then **Clusters**.
2. Find `lifeos-free`. Click **Connect**.
3. Click **Drivers**. Select **Node.js** and its current driver version.
4. Copy the connection string into a private local editor, not chat.
5. Set the username to `lifeos_app` and replace the password placeholder yourself.
6. Put `lifeos` after the `/` and before the `?`.
7. Keep the Atlas hostname and query settings that Atlas supplied.

The shape is shown below. It is a placeholder, not a working database link:

```text
mongodb+srv://lifeos_app:<ENCODED_PASSWORD>@<ATLAS_HOST>/lifeos?<ATLAS_OPTIONS>
```

If the password contains special characters, URL-encode the password only.
URL encoding changes special characters into safe address text.
For example, `@` becomes `%40`, `#` becomes `%23`, and `/` becomes `%2F`.
Never enter the password into an online encoding website.
You can encode it locally with this private terminal prompt. It does not put the password in shell history:

```sh
read -s 'ATLAS_PASSWORD?Atlas database password (hidden): '; printf '\n'; printf '%s' "$ATLAS_PASSWORD" | node -e 'let password="";process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>password+=chunk);process.stdin.on("end",()=>console.log(encodeURIComponent(password)))'; unset ATLAS_PASSWORD
```

The encoded result is still a secret. Copy it privately, then clear the terminal display.

### E. Paste the link into Render yourself

If the Blueprint creation screen is still open, paste the finished link into its **MONGODB_URI** value box. Confirm **Free**, then click **Deploy Blueprint**.

If `lifeos-api` already exists:

1. Open the Render dashboard. Click **lifeos-api**.
2. Click **Environment** in the left menu.
3. Click **Edit** in **Environment Variables**.
4. Click **Add Environment Variable** if `MONGODB_URI` does not exist.
5. Set **Key** to `MONGODB_URI`.
6. Paste your finished private Atlas link into **Value**.
7. Click **Save, rebuild, and deploy**.
8. Open **Logs**. Wait for `LifeOS API ready on port ... MongoDB connected.`
9. Wait for the service to say **Live**.

Do not upload your local `server/.env`. Its MongoDB address points to your laptop.
Do not share the Atlas password, database link, or a screenshot showing the value in chat.

## 5. Secrets and Google sign-in

This backend does NOT use JWTs or a shared login-token signing secret.
A session is an event wristband proving that you signed in.
`server/src/auth.js` generates a fresh token from 32 secure random bytes for each session.
The database keeps only its SHA-256 hash, not the token itself.
A hash is a blender: token in, unreadable mush out, no reverse button.
The Flutter app stores the token in secure device storage.
Sessions last 7 days and survive backend restarts because Atlas stores them.
Do not add an unused `JWT_SECRET` or `SESSION_SECRET` to Render.
No other hosting secret is needed for password login.

For Google login, a client ID is Google's public label for your app, not a password.
The app and backend must use the same Google Web client ID.
The existing local development settings already have one. Preserve it.

1. Open `apps/mobile/config/development.json` locally. Copy `GOOGLE_WEB_CLIENT_ID` without the quotation marks.
2. In Render, open **lifeos-api**, then **Environment**, then **Edit**.
3. Set **GOOGLE_CLIENT_IDS** to that Web client ID. Do not use the Android client ID.
4. Click **Save, rebuild, and deploy**.
5. In **Google Auth Platform**, open **Clients** and check the Android client uses package name `com.lifeos.lifeos_mobile`.
6. Register the SHA-1 of the certificate that signs this APK. A SHA-1 fingerprint is the app maker's stamp.
7. Follow `docs/GOOGLE_AUTH.md` for the exact Google console clicks and signing-key command.

The current release build uses the debug signing key. Register that key for phone testing.
The current Mac's debug certificate SHA-1 is:

```text
14:A2:9C:E7:AD:CA:F3:34:8A:3D:88:74:5F:3D:AC:D8:C8:D0:E1:C5
```

To register that certificate in the existing Google project:

1. Open **Google Auth Platform**, then **Clients**.
2. Open the existing Android client if it already uses this package and SHA-1. Do not create a duplicate.
3. If it does not exist, click **Create client**.
4. Select **Application type**, then **Android**.
5. Set **Name** to `LifeOS Android Test`.
6. Set **Package name** to `com.lifeos.lifeos_mobile`.
7. Paste the SHA-1 above into **SHA-1 certificate fingerprint**.
8. Click **Create**.

The Android client ID does not go into Render or the Flutter JSON settings.
Keep the existing Web client ID in `GOOGLE_CLIENT_IDS` on Render and `GOOGLE_WEB_CLIENT_ID` in the app settings.
The SHA-1 is a public fingerprint, not a password. Recheck it if you replace the debug keystore or build on another computer.
If Google's project is in Testing, add your Google account under **Audience**, then **Test users**, then **Add users**.
A Google client secret is NOT needed for this implementation.
The blueprint marks the database link and Google client IDs as `sync: false`. Later blueprint changes will not replace these dashboard values.
Try a different Google email from the email used for password sign-up.
LifeOS does not silently join an existing password account to a Google account.

Render's free service can sleep after 15 minutes without requests.
Waking it can take about a minute.
The app allows 90 seconds for login, registration, Google login, and restoring a saved session.
Free hosting is not an uptime guarantee.
Keep **Free** and do not add a payment method for this free-only setup.
Render may suspend free services or builds if you exhaust the free limits.

## 6. Connect and rebuild Android after Render is Live

Run these commands from the LifeOS root folder.

```sh
npm run setup:api
```

Paste the real Render HTTPS address when asked.
The script adds `/api` if you pasted the service home address.
It checks `/api/health` and requires a connected database.
It saves the URL to both `apps/mobile/config/development.json` and `apps/mobile/config/production.json`.
It keeps existing Google client IDs and other app settings.
Failed health checks do not change those files.
Both settings files are ignored by Git.

```sh
npm run api:check
```

This checks the saved online backend again.

```sh
npm run build:android
```

This checks the backend and builds an Android install file using the production settings.
An APK is an Android app's installation package.
The file is `apps/mobile/build/app/outputs/flutter-apk/app-release.apk`.
Copy it to your phone and install it over the old build.
On the phone, open **Files**, tap `app-release.apk`, allow **Install unknown apps** for Files if asked, then tap **Install**.
Do not uninstall the old app first if you want to keep its saved session.
If Android says the signing keys differ, an update is impossible. Only then uninstall and install again. This clears the saved session and you must log in again.
For a phone connected by USB with USB debugging enabled:

```sh
"$HOME/Library/Android/sdk/platform-tools/adb" devices
"$HOME/Library/Android/sdk/platform-tools/adb" install -r apps/mobile/build/app/outputs/flutter-apk/app-release.apk
```

The first command lists your phone. Unlock it and accept **Allow USB debugging**.
The second command installs the new APK as an update.
If you change Google IDs later, also update the matching keys in `apps/mobile/config/production.json` before building.

For a connected development phone, use:

```sh
npm run dev:mobile
```

That uses the updated development settings and the same online backend.
Do not use plain `flutter run` without its settings-file argument.
The server URL is stored inside the built app.
Hot reload cannot change that built-in URL.

The current Android release configuration still uses a debug signing key.
It is suitable for testing installation, not a Play Store release.
Create your own release signing key before distributing through the store.

## 7. Final real-phone test

1. Turn **Wi-Fi off**. Turn **Mobile data on**. Check a normal website loads.
2. Open the newly installed LifeOS app. Tap **New here? Create account**. Use a new email and a password of at least 8 characters.
3. Create the account. If Render was asleep, wait up to 90 seconds. After 5 seconds the app shows **Waking up the server, this can take up to a minute**.
4. Use **Sign out**. Enter the same email and password. Tap **Sign in**. Your home screen should open.
5. Remove LifeOS from recent apps without signing out. Reopen it. Your home screen should return without another password.
6. Use **Sign out**, then **Continue with Google**. Pick a Google account with a different email from your password account.
7. Remove LifeOS from recent apps and reopen it again. The Google account should still be signed in.
8. Optional sleep test: leave the app closed for over 15 minutes without sending health checks. Reopen on mobile data. Wait for the wake-up message and then your home screen.

Existing local accounts will not exist in a new Atlas database.
Do not run the public demo seed on a hosted production backend.
To preserve old accounts, migrate the database privately before switching.
The phone can use the hosted server without your laptop being on.

## 8. Error fixes

**No online backend is configured**

Meaning: no verified online address has been saved for release builds.
Why: Render is not live yet, or `npm run setup:api` has not finished successfully.
Fix: finish the Render and Atlas steps. Run `npm run setup:api`, paste the public Render address into the terminal prompt, then run `npm run api:check` and `npm run build:android`.

**Cannot reach an Android emulator address**

Meaning: the installed app still points at `10.0.2.2`.
Why: the app was built without the online settings.
Fix: run `npm run setup:api`, then `npm run build:android`, then reinstall the APK.

**Health check returned HTTP 503**

Meaning: the backend is not ready.
Why: the service is starting or MongoDB cannot connect.
Fix: open Render **Logs**. Check `MONGODB_URI`, the database user, and Atlas **Network Access**. Redeploy and run `npm run api:check`.

**Invalid ID/email or password after deployment**

Meaning: the new online database does not recognize those credentials.
Why: your old account may only exist in local MongoDB.
Fix: tap **New here? Create account**, or migrate your existing database privately.

## Official references

- [Render blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render free hosting behavior](https://render.com/docs/free)
- [Render environment variables](https://render.com/docs/configure-environment-variables)
- [Create an Atlas Free cluster](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/)
- [Atlas database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/)
- [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [Connect MongoDB Atlas to Render](https://www.mongodb.com/docs/atlas/reference/partner-integrations/render/)

These describe hosting setup. They do not mean this project is already deployed.
