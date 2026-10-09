# LifeOS mobile

One Flutter codebase for Android and iOS, connected to the same Express API and MongoDB as the React website.

## Real phone on any network

Follow [Online backend setup](../../docs/ONLINE_BACKEND.md).
From the LifeOS root, run `npm run setup:api` and paste your deployed HTTPS server address.
Then run `npm run build:android` and install `build/app/outputs/flutter-apk/app-release.apk` from this folder.
The old emulator address cannot work on a real phone.
The setup updates both development and release settings without removing your Google IDs.
The backend must actually be deployed before these commands can succeed.

## Features and local development

Android spending can check new notifications after explicit consent and notification access.
It recognises common English INR payment confirmations and queues them for review, not every possible message.
An optional Android floating review reminder opens the full form in LifeOS.
iPhone cannot read other apps' notifications and keeps manual entry and synced payment review.
Web and mobile share recipient memory, self transfers, money with people, and trip splits.
Read [Money review](../../docs/MONEY_REVIEW.md) for examples and limits.
See `../../docs/NOTIFICATION_SPENDING.md` for setup, privacy, and phone limits.

Start with the root `README.md`. Google OAuth configuration is explained in `../../docs/GOOGLE_AUTH.md`.

```sh
flutter pub get
flutter run --dart-define-from-file=config/development.json
```

From the LifeOS root folder, `npm run dev:mobile` loads the same settings automatically.
Use `npm run dev:mobile -- -d DEVICE_ID` to choose a device from `flutter devices`.
Keep `npm run dev` running in another terminal for the backend.

VS Code's **LifeOS mobile** launch configuration loads these settings too.
Select your simulator, then press **F5**.
Android Studio's **main.dart** run configuration also includes the settings file.

Plain `flutter run` does not read `config/development.json` automatically.
On iOS, `npm run setup:google` also saves the Google IDs in native app settings.
The app reads these settings before showing the login screen.
This lets iOS Google login work from Xcode or plain `flutter run` too.
Android and custom API addresses still need the settings-file argument.
Fully stop and restart the app with the command above if Google settings are missing.
Hot reload does not load changed client IDs.

The Google button stays tappable after startup.
If configuration is missing, it explains the next step instead of silently doing nothing.
The iOS simulator still needs a separate iOS client ID and return URL.
Run `npm run setup:google` from the LifeOS root to save both Web and iOS IDs.
See step 6 of `../../docs/GOOGLE_AUTH.md` for the exact Google console steps.

Tap **New here? Create account** to register with a name, email, password, and confirmation.
Passwords need at least 8 characters and at most 72 bytes.
Registration signs you in and saves your session in secure storage.
Sign out and use the same email and password on web, Android, or iOS.
See `../../docs/EMAIL_AUTH.md` for the full beginner guide.

To delete a LifeOS account, open the top-right **Account options** menu and choose **Delete account**.
Type `DELETE` and confirm with your password or the same Google account.
This deletes saved LifeOS data and signs out every device. It does not delete your Google account.
The updated backend must be deployed before the installed app can use this action.
See `../../docs/ACCOUNT_DELETION.md` for the data cleanup and test commands.

An empty `API_BASE_URL` selects `http://10.0.2.2:4000/api` for the Android emulator or `http://127.0.0.1:4000/api` for the iOS simulator. A real phone needs your computer's LAN address instead.

Release builds require an HTTPS `API_BASE_URL`, real OAuth client IDs, your own signing configuration, and completed native Google setup. Local HTTP permissions are debug-only.

Android release signing reads `android/key.properties`.
Set `storePassword`, `keyPassword`, `keyAlias`, and `storeFile` in that local file.
`storeFile` is the absolute path to your upload keystore.
Release builds use this upload key, not the development key.
Keep the settings file, keystore, and passwords private. The signing files are excluded from Git.

To build a Google Play upload bundle, run this from `apps/mobile`:

```sh
flutter build appbundle --release --dart-define-from-file=config/production.json
```

The bundle is saved to `build/app/outputs/bundle/release/app-release.aab`.
