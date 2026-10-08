# New-notification payment review

## 1. What this version can do

This version checks future Android notifications after you enable tracking.
It does not load the notification tray or notification history.
It checks apps without a bank-app allowlist.
The reader runs outside the Flutter screen, so closing the screen does not stop it.

The current spending journal uses INR only.
The reader recognises common English spending messages with `₹`, `INR`, or `Rs`.
It looks for clear completed outgoing and incoming payments.
Examples include paid, debited, sent, spent, withdrawn, deducted, credited, and received.
Amounts are saved as whole paise.
One rupee is 100 paise.

Refunds, OTP messages, payment requests, offers, failed payments, pending payments,
and ambiguous messages are skipped.
Messages with several different transaction amounts are skipped rather than guessed.
Other languages, currencies, images, and some grouped notification layouts need manual entry.
A notification is not bank proof. Another app can write misleading text.
Recognised payments wait for review. They do not immediately increase spending.
Choose **Review payment**, check the amount and purpose, and choose the payment type.
Only **Spending** creates a personal expense after **Save**.
Self transfers, income, lending, and repayments do not increase spending.
Categories start as **Other**, unless you previously remembered that recipient.
Read [Money review](MONEY_REVIEW.md) for people balances and trip splits.

## 2. Why it cannot work on every phone

Android provides notification access after the owner gives permission.
iOS does not provide an equivalent public API for reading other apps' notifications.
An iOS notification extension only handles notifications for its own app.
Use **Record payment** or **Add expense** on iPhone.
Payments captured by your Android device can also be reviewed on iPhone or web in the same account.
A future bank-data connection or statement-import feature would be a separate project.
It would need a chosen provider, supported banks, and explicit consent.

Even Android does not promise every notification.
Some low-memory Android 10 and older phones do not support notification listeners.
Work profiles and phone-management policies may block access.
Android can hide sensitive notification content.
Bank apps can hide details or send no notification.
Force stopping LifeOS, uninstalling it, or removing access stops capture.
Some manufacturers restrict background apps.
Messages delivered while the reader is disconnected cannot safely be recovered without reading history.
This version deliberately does not read history.

The Android floating review banner needs a separate **Display over other apps** permission.
It shows **Review in LifeOS** and **Later** for about 20 seconds.
Editing and saving happen inside LifeOS, not inside the floating window.
It is not shown when LifeOS is already visible or the phone is locked.
Other apps can block overlays, so a banner is not guaranteed over bank apps.
Background network and battery delays mean the banner is not guaranteed immediately after payment.
iPhone and browser use review cards inside LifeOS, not a system-wide floating window.

LifeOS is not a replacement SMS app. It requests no SMS permission.
Becoming a default SMS app requires a real messaging implementation and does not capture all wallet alerts.
Apple also has a restricted default carrier-messaging framework. It is not universal notification access.

Official references:

- https://developer.android.com/reference/android/service/notification/NotificationListenerService
- https://developer.android.com/about/versions/15/behavior-changes-all
- https://developer.apple.com/documentation/usernotifications
- https://developer.android.com/reference/android/app/job/JobInfo.Builder
- https://developer.android.com/security/fraud-prevention/activities
- https://developer.android.com/reference/android/provider/Telephony
- https://developer.apple.com/documentation/telephonymessagingkit

## 3. Start the app

From the LifeOs project folder:

1. Run `npm run db:up` to start MongoDB if it is not already running.
2. Run `npm run dev` to start the backend and website.
3. In another terminal, run `flutter devices` to find your Android device ID.
4. Run `npm run dev:mobile -- -d DEVICE_ID` with that ID.
5. Sign in and open **Spend**.
6. Choose **Enable tracking**.
7. Read the explanation. Choose **Allow and open settings**.
8. In Android notification-access settings, choose **LifeOS spending tracker**.
9. Turn on **Allow notification access** and confirm Android's warning.
10. Return to LifeOS. The card should show **On. Checking new notifications from all apps.**
11. Optionally choose **Enable floating review banner**.
12. Read the explanation and choose **Allow and open settings**.
13. In Android settings, choose LifeOS and allow **Display over other apps**.
14. Return to LifeOS. New recognised payments can open a floating reminder when the app is in the background.

The Android emulator uses `http://10.0.2.2:4000/api` for your computer's backend.
For a real phone, put your computer's local-network address in
`apps/mobile/config/development.json` under `API_BASE_URL`.
For example, use `http://192.168.1.20:4000/api` only if `192.168.1.20` is your computer.
Keep the phone and computer on the same Wi-Fi.
Allow the backend through your computer's firewall.
Release builds require an HTTPS backend.
This feature does not need a Google API key.

## 4. How saving works

```text
New Android notification → Phone checker → Encrypted waiting list
                                            ↓
Screen (Flutter) ← Checker (Express) → Storage (MongoDB)
```

The phone checker extracts amount, direction, payment type, and a merchant name when clear.
It also extracts a complete UPI ID or UPI recipient phone number when visible in the alert.
These recipient details are stored under your account and can be remembered only after you choose to do so.
The full notification, OTP, account number, and unrelated messages are not stored or uploaded.
The waiting list and background session token are encrypted with an Android device key.
They are excluded from Android backups and phone-to-phone transfers.
The saved entry includes its source app and a one-way duplicate-check code.
The duplicate-check code is like a fingerprint. It helps recognise the same payment again.

Android schedules sending when a network is available.
Pending reviews and saved expenses appear under your existing LifeOS account on Android, iPhone, and web.
Choose **Check saved expenses** or **Refresh saved spaces** to see updates.
Android may delay background sending to save battery.
A periodic recovery job checks for a stuck waiting list, subject to Android's scheduling limits.
The website refreshes while visible every 30 seconds and when you return to its window.
Mobile refreshes when you return to LifeOS or a new detected-payment event reaches the open app.

If a request is retried, MongoDB keeps only one payment review for its duplicate-check code.
Repeated confirmation of the same reviewed details does not add another expense.
Different details for an already confirmed payment are rejected rather than silently changed.
The same reference, amount, currency, and notification date share a code across apps.
Without a reference, separate apps may still generate duplicate expenses.
Identical references with different dates may also need manual cleanup.
There is no safe universal way to identify the same bank payment from arbitrary text.
Edits are not overwritten by retries.
Deleting a notification-linked expense keeps a hidden duplicate marker so a retry cannot restore it.

**Stop tracking** pauses new capture and sending.
Already queued entries stay encrypted on the phone and can send when you enable tracking again.
Re-enabling starts a new time boundary. Notifications from the paused period are not imported.
Signing out or switching accounts deletes the local waiting list and background credentials.
Already saved cloud payments, remembered recipients, and expenses remain in the original account.
If the background session expires, sign in again to resume sending queued entries for that account.

## 5. Check the feature

1. Leave an old payment notification on the phone before enabling tracking.
2. Enable tracking. The old notification must not appear as a payment review.
3. Receive a new notification such as `You paid INR 125.50 to Lunch shop via UPI. Ref 123456789012`.
4. Open **Spend** and choose **Check saved expenses** after background sending finishes.
5. Choose **Review payment**. Check the amount, date, recipient, and purpose. Choose **Save**.
6. Compare with a failed-payment notification. It must not add spending.
7. Disconnect the network, receive a new matching notification, then reconnect.
8. Check that the waiting count goes down and only one review appears. Spending must wait for your confirmation.
9. Edit or delete a confirmed expense. A retry must not undo your change.
10. Choose **Stop tracking**. Another notification must not be imported.

Use a notification from another test app or a real bank app.
LifeOS deliberately ignores its own notifications.
Do not send real money just to test the parser.

From the project folder, run `npm test`, `npm run lint`, and `npm run build`.
Run `npm run test:integration` with a local test MongoDB database to check concurrent duplicate imports.
From `apps/mobile`, run `flutter analyze` and `flutter test`.
From `apps/mobile/android`, run `./gradlew :app:testDebugUnitTest` for the native parser and time-boundary tests.
Gradle needs Java 17 or newer and the Android SDK.

## 6. Where each part lives

- `apps/mobile/lib/spending/notification_tracking_card.dart`: consent, permission state, waiting count, and stop button.
- `apps/mobile/lib/spending/notification_bridge.dart`: Flutter-to-Android calls.
- `apps/mobile/lib/auth/auth_controller.dart`: account changes and background credential cleanup.
- `apps/mobile/android/app/src/main/kotlin/com/lifeos/lifeos_mobile/SpendingNotificationListener.kt`: future-notification callbacks.
- `apps/mobile/android/app/src/main/kotlin/com/lifeos/lifeos_mobile/TransactionParser.kt`: conservative spending detection and duplicate codes.
- `apps/mobile/android/app/src/main/kotlin/com/lifeos/lifeos_mobile/NotificationStore.kt`: encrypted credentials and offline waiting list.
- `apps/mobile/android/app/src/main/kotlin/com/lifeos/lifeos_mobile/NotificationSyncJob.kt`: background upload and retries.
- `apps/mobile/android/app/src/main/kotlin/com/lifeos/lifeos_mobile/PaymentReviewBanner.kt`: optional floating reminder.
- `server/src/money.js`: authenticated pending review, confirmation, remembered recipients, people, and trips.
- `server/src/workspace-models.js`: account-owned expenses and duplicate prevention.
