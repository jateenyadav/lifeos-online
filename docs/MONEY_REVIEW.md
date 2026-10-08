# Payment review, people, and trips

## 1. Open the feature

1. Start MongoDB and run `npm run dev` from the project folder.
2. Open `http://localhost:5173/#spending` and sign in.
3. On mobile, sign in and open **Spend**.
4. Look for **Your money, with context**.
5. Use **Payments**, **People**, or **Trips**.

Both screens use the same account-owned database.
The browser cannot read phone notifications.
Android capture is optional. See [notification setup](NOTIFICATION_SPENDING.md).
iPhone uses manual recording or reviews synced from another device.

## 2. Review a payment

Choose **Review payment** on a pending payment, or **Record payment** for manual entry.
Check **What was this payment for?**, **Is the amount correct? (INR)**, and **Who is this with?**.
You can correct the amount before saving.

Choose a **Payment type**:

1. **Spending** adds one expense to your personal spending journal.
2. **Self transfer** records movement between your own accounts without adding spending.
3. **I lent money** records money someone owes you.
4. **I borrowed money** records money you owe someone.
5. **Someone paid me back** reduces what that person owes you.
6. **I paid someone back** reduces what you owe that person.
7. **Income** records money received without adding spending.

A detected incoming payment cannot be classified as an outgoing payment, or the other way around.
Self transfer is available for either direction.
Detected alerts are suggestions, not verified bank transactions.
Choose **Not mine / Ignore** to dismiss a wrong match.

Choose **Remember purpose, person and type for this UPI ID or number** to save a recipient profile.
The recipient must be a complete UPI ID or a 10 to 15 digit number.
UPI IDs are matched without letter case. Spaces, brackets, and hyphens in phone numbers are removed.
Phone matching keeps country-code digits exactly as entered. It does not guess missing country codes.
The next matching payment gets suggested details but still waits for **Save**.
The previous amount is never copied.
Incoming and outgoing profiles are not mixed, except self transfers.
Each account has its own remembered recipients.
You can change a profile's details by checking the remember box on a later saved payment.
Profile deletion and confirmed-payment editing in this money view are not implemented yet.
The existing expense journal still supports editing and deleting expenses.

## 3. Track money with people

1. Record **I lent money**, person **Ria**, amount **1000**.
2. Record **Someone paid me back**, person **Ria**, amount **400**.
3. Record **I lent money**, person **Ria**, amount **200**.
4. Open **People**. Ria owes you **₹800**.
5. Use **Record repayment** when more money comes back.

The view shows total given, total received, and the remaining balance.
Only confirmed payments affect it.
Names are matched without letter case. Use distinct names for different people.
Money borrowed and lent to the same person is combined into one net balance.
This is a record of payments. LifeOS does not move money or contact that person.

## 4. Plan and split a trip

1. Open **Trips**, then **Plan a trip**.
2. Enter the trip name, other people's names, budget, and optional dates.
3. **Me** is included automatically. Use unique names.
4. Save the trip and choose **Add shared cost**.
5. Enter the amount, who paid, and who shares that cost.
6. Shares are equal among the selected people.
7. Choose **Record trip repayment** after someone pays another member back.

For a ₹900 cost paid by Me and shared by Me, Ria, and Sam, each share is ₹300.
Me should receive ₹600. Ria and Sam each owe ₹300.
If Ria pays Me ₹300, Ria's balance becomes zero and Me should receive ₹300.
Every paise is kept. Extra paise are assigned in the selected-person order.
The total of all balances stays zero.
Trip repayments change balances but do not increase trip costs.
Trip costs are separate from personal spending to avoid accidental double counting.
This version is one account's trip record. It does not invite other accounts or share edit access.
Unequal percentage splits, itinerary activities, and linking detected payments to a trip need separate work.

## 5. API

All routes below start with `/api/workspaces/money` and require the existing signed-in session.
Browser writes require an allowed Origin. Mobile sends `X-Client-Type: mobile` and its Bearer session token.

- `POST /notifications`: save a structured INR alert as pending review.
- `POST /payments`: record and confirm a manual payment.
- `POST /payments/:id/confirm`: confirm a pending payment.
- `POST /payments/:id/dismiss`: dismiss a pending review with an empty JSON object.
- `POST /trips`: create a trip plan.
- `POST /trip-items`: record one shared cost or repayment.
- `GET /summary`: get people's net balances and trip balances.

`GET /api/workspaces` also returns `payments`, `payees`, `trips`, and `tripItems`.
Direct generic create, edit, or delete routes for those collections are blocked.
Money amounts are whole paise, not floating-point rupees.

A manual payment request looks like this:

```json
{
  "clientKey": "a-new-unique-save-id",
  "title": "Lunch",
  "date": "2026-10-07",
  "amountMinor": 12550,
  "kind": "expense",
  "person": "Lunch shop",
  "recipientKey": "lunch@upi",
  "category": "Food",
  "payment": "UPI",
  "note": "",
  "remember": true
}
```

`clientKey` is a retry ticket. Keep the same ticket for retries of the same save.
Use a new ticket for a new payment or trip item.
Confirm uses the same fields except `clientKey`.
Payment kinds are `expense`, `self_transfer`, `lent`, `borrowed`, `repayment_received`, `repayment_paid`, and `income`.
Payment methods are `UPI`, `Card`, `Wallet`, `Cash`, and `Other`.
Lending, borrowing, and repayments require a person.

A notification uses title, date, amountMinor, category, payment, note, and recipientKey.
It also requires currency `INR`, sourceApp, a 64-character lowercase SHA-256 notificationKey, and direction `incoming` or `outgoing`.
It cannot choose a kind, person, or remember flag. Those are chosen during review.
The full notification is never accepted by this endpoint.

A trip uses title, members including Me, budgetMinor, startDate, and endDate.
A trip item uses clientKey, tripId, title, date, amountMinor, kind, payer, and participants.
Item kind is `expense` or `settlement`. A settlement has one different receiving participant.

Database indexes prevent duplicate alert reviews, confirmed expenses, recipient profiles, and trip items.
Identical payment confirmation retries succeed. Conflicting confirmation retries return HTTP 409.
Confirmation and expense/profile creation are separate retry-safe writes, not one database transaction.
If saving fails after confirmation, retry the same draft to finish creating its expense/profile.
Do not dismiss the draft or create a new manual payment for the same failed save.
Trip-plan creation itself does not have a retry ticket yet.
The older `/api/workspaces/notification-expenses` endpoint remains for older mobile clients.
It still auto-adds expenses. The current Android client does not use it.

## 6. Checks and files

Run `npm test`, `npm run test:integration`, `npm run lint`, and `npm run build` from the project folder.
Integration tests use a database ending in `_test`, never your normal database.
Run `flutter analyze` and `flutter test` from `apps/mobile`.
Run `./gradlew :app:testDebugUnitTest :app:assembleDebug` from `apps/mobile/android`.
Gradle needs Java 17 or newer and the Android SDK.

- `server/src/money.js`: validation, review workflow, people, and trip routes.
- `server/src/workspace-models.js`: MongoDB records and duplicate protection.
- `apps/web/src/workspaces/MoneyHub.jsx`: browser payment, people, and trip forms.
- `apps/mobile/lib/spending/money_hub.dart`: mobile money views.
- `apps/mobile/lib/spending/money_editor.dart`: mobile money forms.
- `apps/mobile/android/app/src/main/kotlin/com/lifeos/lifeos_mobile/PaymentReviewBanner.kt`: Android floating reminder.
