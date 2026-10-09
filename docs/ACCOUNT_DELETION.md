# Delete a LifeOS account

## In the mobile app

1. Sign in to the account you want to delete.
2. Open **Account options**, the three-dot menu at the top right.
3. Choose **Delete account**.
4. Enter your password if you use password login.
5. Type `DELETE`.
6. Choose **Delete account**, or **Confirm with Google** for Google login.
7. For Google login, choose the same Google account used for LifeOS.

**Cancel** and a cancelled Google confirmation do not delete anything.
A wrong password or different Google identity does not delete anything.
Once deletion succeeds, the app returns to the login screen.

## What is removed

- The LifeOS user account and all its sessions.
- Notes, workouts, routines, expenses, budgets, and hidden duplicate records.
- Payment reviews, remembered recipients, trips, and trip items.
- Saved AI knowledge.
- This phone's saved session and queued payment notifications.

Other accounts are not changed.
Your Google account is not deleted.
This does not erase data already processed by third-party AI providers or copies in infrastructure backups.
Any third-party or backup retention must be explained in the privacy policy before launch.
If this phone cannot clear local settings after deletion, the app stays signed out and asks you to clear LifeOS app data.

## Backend and release requirements

The mobile action calls `DELETE /api/auth/account`.
The request includes a session and explicit confirmation, then checks the password or Google token again.
The backend removes all account-owned collections in one database transaction.
A transaction is an all-or-nothing operation. A failed cleanup does not leave a partially deleted account.
This requires MongoDB transaction support. Atlas supports this; a standalone local MongoDB server does not.
Use a replica set if testing this endpoint against local MongoDB.

Deploy the updated backend and install the updated mobile app before real-phone testing.
Local code edits alone do not update the running Render service or the app already installed on a phone.
Test deletion only with a disposable account. Do not delete your real account to test a release.

Google Play also requires a public webpage where users can request account deletion without the app.
That external webpage is a separate remaining release task. This mobile feature alone does not finish the publishing checklist.

## Code and tests

- `server/src/account-deletion.js`: account-scoped, transactional database cleanup.
- `server/src/auth.js`: verifies the active session and deletion credentials.
- `server/src/app.js`: validates the request and clears the cookie after success.
- `apps/mobile/lib/screens/delete_account_dialog.dart`: warning, password, and typed confirmation.
- `apps/mobile/lib/auth/auth_controller.dart`: server request and local cleanup.

From the project root:

```sh
node --test server/test/account-deletion.test.js server/test/auth.test.js
```

The backend tests use isolated memory fixtures. They never delete real database records.
They verify all collection scopes, session revocation, confirmation, identity checks, and transaction failure handling.
Actual database rollback still needs a test against a disposable transaction-capable MongoDB database.

From `apps/mobile`:

```sh
flutter test test/account_deletion_test.dart
```

The mobile tests cover cancellation, password and Google confirmation, API failures, local cleanup failures, duplicate taps, and narrow screens.
