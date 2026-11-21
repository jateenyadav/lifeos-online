# LifeOS Money (v2) — design and API contract

This file is the single contract between the server (`server/`), the website (`apps/web/`) and the
Flutter app (`apps/mobile/`). The behaviour is ported from SpendSense (`~/Desktop/RND/spendsense`,
Dart): when this file is silent, do what SpendSense does.

## 0. Rules that never change

- Money is always an **integer number of paise** (`amountMinor`). Never floats in money maths.
- Dates are `YYYY-MM-DD` strings in the user's local day; optional `time` is `HH:mm`.
- **Raw bank SMS / notification text never leaves the phone.** The phone parses it and sends only
  structured fields (amount, direction, merchant, account last digits, UTR, date, channel, bank).
  Never log full message bodies anywhere (phone or server). Never send them to an AI provider.
- Every route is under `/api/money` and needs the signed-in session (same auth as `/api/workspaces`).
  Errors use the existing `ApiError` JSON `{ error: "plain sentence" }`.
- Every list is scoped to `userId`. Every id in a body is checked to belong to the user.
- Deleting the account (`server/src/account-deletion.js`) must delete every collection below.
- No fake features: if something can't work (e.g. SMS on iPhone / web), the UI says so plainly.

## 1. Concepts (from SpendSense)

**Own amount.** `ownMinor = clamp(amountMinor − peerShareMinor − reimburseMinor, 0, amountMinor)`.
Spending (expenses) = sum of `ownMinor` over cleared **debits** that are not transfers.
Income = sum of `ownMinor` over cleared **credits** that are not transfers and not refunds.
Refunds (`refundOfId` set, credit) **reduce expenses** instead of adding income.
Pending/failed transactions count nowhere. Self-transfers count nowhere.

**Peer answers** (`peerTag`) on a payment to/from a person:

| peerTag | meaning | money | khata entry created | peerShareMinor |
|---|---|---|---|---|
| `lent` | they owe me all | out | gave, amount | amount |
| `split` | I paid the bill for N people (2–6) | out | gave, amount − floor(amount/N) | same as khata |
| `repaid` | I was paying them back | out | gave, amount | amount |
| `borrowed` | they gave me money I owe back | in | got, amount | amount |
| `got_back` | they were paying me back | in | got, amount | amount |
| `owe_owner` | paid with **their** card/money (add-on card) | out | got, amount (credit refund: gave) | 0 (still my spending) |
| `personal` | normal payment / gift | any | none | 0 |
| `left` | "just leave it" — decide later; listed in Khata → Left for later | any | none | 0 |

Changing or clearing the answer removes the old linked khata entry and resets `peerShareMinor`.

**Khata sign:** balance > 0 ⇒ the person owes me; < 0 ⇒ I owe them. `gave` = +amount, `got` = −amount.
Adjustments are stored separately (never edit entries): types `on_me, waived, disputed,
pending_confirmation, shared_expense, discount, custom`; the first five reduce toward zero by default.
Shown: actual balance, adjusted balance (= actual + active adjustments).

**Opening balance (old khata).** Entries imported from old notes have `isOpening: true`. The ledger
sorts `isOpening` entries **last** (below everything recorded in the app, whatever their dates) under
a heading "Old khata · opening balance (before the app)". Running balance is shown per row
(computed oldest→newest in display order reversed: openings first, then the rest by date, id).

**Paid for me.** A manual khata "You got" entry with `paidForMe: true` also creates a debit
transaction (`source: 'khata'`, `peerTag: 'owe_owner'`, title = note or `Paid by <name>`,
category chosen or Other) so it shows in spending, charts and can be claimed for reimbursement.
Editing the entry keeps amount/date/note in step; deleting it deletes the transaction.

**Reimbursements.** `POST claim` on a debit marks `reimburseTag: 'claim'`, `reimburseMinor` = chosen
amount ≤ own part (amount − peerShare) — it stops counting as spending while waiting. When money comes
in, `POST received` on a credit with a list of claim ids: claims are covered oldest first
(`allocate`): each claim's `reimburseMinor` becomes the covered part (a shortfall counts as spending
again), the claim gets `reimbursedById = creditId`; the credit gets `reimburseTag: 'received'`,
`reimburseMinor = matched` (so only the extra is income). Undo restores each claim to its whole own
part and clears the credit. For a claim paid with someone else's card (`peerTag owe_owner`) the UI
shows "Paid with X's card: pay X back in Khata when the money comes."

**Someone else's card.** An account with `ownerName` set: every debit on it, past and future, gets
`peerTag: 'owe_owner'` and a linked khata "got" entry for contact `ownerName` (created if missing);
credits (refunds) on it create "gave". Its dues are left out of net worth.

**Self-transfer.** Two transactions, equal amount, opposite direction, two of the user's accounts,
within 3 days → suggested; same UTR or debit text naming the other account's last digits → linked
automatically. Linked pair share a `transferId`. Manual link/unlink. "Transfer to my untracked
account" marks a single txn `isTransfer: true`.

**Duplicates.** Same `sourceKey` ⇒ ignored (idempotent). Same UTR ⇒ duplicate, merged (keep first,
add the second source to `sources`). Same amount + direction + account + within 10 minutes from a
different source (sms vs notification) ⇒ merged. Weaker matches are kept with `possibleDuplicateOf`.

**Subscriptions.** Detected from history (≥3 debits, same normalised merchant, similar amount ±10%,
weekly / monthly / quarterly / yearly gap): name, amount, period, next expected date, monthly and
yearly cost. Port `lib/domain/recurring/recurring.dart`.

**Credit cards.** Account `type: 'credit_card'` with `creditLimitMinor`, `billMinor`, `minDueMinor`,
`dueDate`, `statementDay`, `billPaidAt`. Derived: outstanding (= −balance), available =
limit − outstanding, usage %, spend this cycle, days to due, overdue. Port `card_math.dart`.

**Balances.** `balance = openingMinor + cleared credits − cleared debits` on that account.
`followBank: true` (default) ⇒ when the phone sends an "Avl Bal" figure, the server moves
`openingMinor` so balance equals the bank figure (audit-logged, transactions never changed).
`followBank: false` ⇒ keep `bankBalanceMinor` for "Bank said ₹X vs app ₹Y" + "Match bank balance".

## 2. Collections (Mongoose, all with `userId`, timestamps)

```
MoneyAccount   { name, type: savings|current|salary|credit_card|cash|wallet|other, bank, last4,
                 openingMinor=0, ownerName=null, followBank=true, bankBalanceMinor=null,
                 bankBalanceAt=null, creditLimitMinor=0, billMinor=0, minDueMinor=0, dueDate=null,
                 statementDay=null, billPaidAt=null, needsConfirm=false, archived=false }
MoneyTxn       { date, time=null, amountMinor, direction: debit|credit, title, category,
                 purpose='', channel: UPI|Card|NetBanking|Wallet|Cash|Other, accountId=null, note='',
                 status: cleared|pending|failed, needsReview=false,
                 source: manual|sms|notification|screenshot|khata|import|legacy, sources=[...],
                 sourceKey (unique per user, sparse), utr=null, sourceApp='', bank='', last4='',
                 counterparty='', isPerson=false,
                 peerTag=null, peerShareMinor=0, splitPeople=null, contactId=null,
                 isTransfer=false, transferId=null, refundOfId=null, possibleDuplicateOf=null,
                 reimburseTag=null, reimburseMinor=0, reimbursedById=null, deleted=false }
                 indexes: {userId,date}, {userId,sourceKey} unique partial, {userId,utr}
KhataContact   { name (unique per user, case-insensitive key), phone='', note='', archived=false }
KhataEntry     { contactId, direction: gave|got, amountMinor, date, note='', dueDate=null,
                 isOpening=false, linkedTxnId=null, paidForMe=false }
KhataAdjustment{ contactId, type, deltaMinor (signed), note='', active=true }
MoneyPhoto     { ownerType: 'khata_contact'|'txn', ownerId, mime: image/jpeg|image/png|image/webp,
                 data (base64, ≤ 1.5 MB decoded; clients downscale to ≤1600 px first), caption='' }
MoneyBudget    { month 'YYYY-MM', category ('*' = whole month), limitMinor }  unique {userId,month,category}
MerchantMemory { key (normalised merchant), title, category, isPerson }   unique {userId,key}
MoneyAudit     { entity, entityId, action, before, after }   (no message bodies, ever)
```

Categories — expense: `Food, Groceries, Travel, Fuel, Shopping, Bills, Rent, Health, Entertainment,
Education, Investments, Other`; income: `Salary, Refund, Interest, Gift, Other income`.

## 3. Migration from the old spending space

Run once per user, lazily on the first `/api/money/*` call (store a `moneyMigratedAt` flag on the user)
and idempotent (`sourceKey: legacy:expense:<id>` / `legacy:payment:<id>`):
- every old `Expense` (not deleted) → `MoneyTxn` debit, `source: 'legacy'`, same title/date/amount/
  category (old `payment` value → `channel`; `Card`→Card, `UPI`→UPI, …);
- confirmed old `Payment`s of kind lent/borrowed/repayment_* → khata entries for `person`
  (contact created), and their txns with the matching `peerTag`; `self_transfer` → `isTransfer`;
  `income` → credit txn; pending old payments → txns with `needsReview: true`;
- old `Budget {month, limitMinor}` → `MoneyBudget {month, category:'*'}`.
Old collections stay readable (not deleted) so nothing is lost. Trips (`trips`, `tripItems`) stay as
they are and are shown inside Money → Trips.

## 4. API (all JSON, all under `/api/money`)

Lists return `{ items: [...] }`. Every txn returned includes the derived `ownMinor`.

```
GET    /overview?month=YYYY-MM
       → { month, spentMinor, incomeMinor, netMinor, budget:{limitMinor,usedMinor}|null,
           byCategory:[{category, minor}], daily:[{date, minor}] (spend per day in month),
           trend:[{month, spentMinor, incomeMinor}] (last 12 months),
           topMerchants:[{title, minor, count}], netWorthMinor, khata:{owedToMeMinor, iOweMinor},
           reviewCount, leftCount, reimburse:{waitingMinor, waitingCount},
           comingUp:[{kind:'card_bill'|'subscription'|'khata_due', title, date, amountMinor}] }
GET    /txns?from=&to=&q=&category=&accountId=&direction=&source=&status=&review=1&left=1&limit=&cursor=
POST   /txns                         manual add (date, amountMinor, direction, title, category, …)
PATCH  /txns/:id                     edit fields (title, category, purpose, note, date, amount, accountId, status)
DELETE /txns/:id                     soft delete; linked khata entries removed; photos removed
POST   /txns/ingest                  phone capture. Body {items:[{sourceKey, source:'sms'|'notification'|'screenshot',
                                     date, time, amountMinor, direction, title, counterparty, channel, bank, last4,
                                     utr, sourceApp, availableBalanceMinor?, confidence (0..1)}]}  (≤ 50 per call)
                                     → per item {status:'created'|'merged'|'duplicate', txn}. Confidence < 0.7 ⇒
                                     needsReview. Unknown last4 ⇒ new account with needsConfirm:true.
                                     Merchant memory fills category. Self-transfer + duplicate rules run here.
POST   /txns/:id/peer                {peerTag, contactName?, contactId?, splitPeople?} (null peerTag clears)
POST   /txns/:id/refund-of           {originalId} | {originalId:null}
POST   /txns/:id/transfer            {otherId} link, or {untracked:true}; DELETE /txns/:id/transfer unlinks
GET    /transfers/suggestions        → [{a, b}] pairs to confirm
POST   /txns/:id/reimburse/claim     {amountMinor?}      DELETE /txns/:id/reimburse/claim
POST   /txns/:id/reimburse/received  {claimIds:[...]} → {matchedMinor, extraMinor, shortMinor}
POST   /txns/:id/reimburse/preview   {claimIds:[...]} → same numbers, nothing saved
DELETE /txns/:id/reimburse/received  undo
GET    /reimbursements               → {waitingMinor, items:[{txn, payBackTo|null, paidBy|null, waiting}]}

GET    /accounts                     → items with balanceMinor, card:{outstanding, available, usagePct,
                                       cycleSpendMinor, daysToDue, overdue}|null, bankSaidMinor
POST   /accounts   PATCH /accounts/:id   DELETE /accounts/:id (txns keep, accountId cleared)
POST   /accounts/:id/match-bank      openingMinor moved so balance == bankBalanceMinor
POST   /accounts/:id/bill-paid

GET    /khata                        → {owedToMeMinor, iOweMinor, contacts:[{contact, balance:{actualMinor,
                                       adjustedMinor, givenMinor, receivedMinor}, lastDate, overdue}],
                                       left:[txn...]}   ('left' = txns with peerTag 'left')
POST   /khata/contacts  PATCH /khata/contacts/:id  DELETE /khata/contacts/:id (entries, adjustments, photos)
GET    /khata/contacts/:id           → {contact, balance, entries:[{...entry, runningMinor}] (display order:
                                       app entries newest first, opening entries last), adjustments, photos:[{id, caption}]}
POST   /khata/contacts/:id/entries   {direction, amountMinor, date, note, dueDate, paidForMe?, category?}
PATCH  /khata/entries/:id            DELETE /khata/entries/:id
POST   /khata/contacts/:id/adjustments {type, amountMinor, reduce:boolean, note}
PATCH  /khata/adjustments/:id {active}   DELETE /khata/adjustments/:id
POST   /khata/contacts/:id/swap      flip gave/got on every entry (the "Swap who owes whom" fix)
POST   /khata/import/parse           {text, mode:'person'|'bulk'} → bulk: {people:[{name, tag, lines:[{signedMinor,
                                       note, date}], linesMinor, statedMinor, choice}]}; person: {lines, totalMinor}
                                       (port text_import.dart + bulk_import.dart exactly, incl. k/lac/lakh,
                                       Indian digit groups, dates like "3sep", brackets, "pending" section)
POST   /khata/import/save            {people:[{name, choice:'lines'|'linesAndFix'|'totalOnly'|'skip',
                                       plusTheyOwe:boolean, lines, statedMinor}], photoIds?:[...]} → every entry
                                       isOpening:true; photos attached to each person
POST   /photos                       {ownerType, ownerId|null, mime, data(base64), caption} → {id}
GET    /photos/:id                   → the image bytes (Content-Type mime, private cache)
DELETE /photos/:id

GET    /subscriptions                → [{title, amountMinor, period, nextDate, monthlyMinor, yearlyMinor, count}]
GET    /budgets?month=   PUT /budgets {month, category, limitMinor}   DELETE /budgets/:id
GET    /merchants  PATCH /merchants/:key {title?, category?}   (category change back-fills that merchant's txns)
GET    /export.csv?from=&to=
```

The old `/api/workspaces` `expenses`/`budgets` endpoints keep working for one release but the web and
mobile apps stop using them. The AI context (`server/src/ai-context.js`) and Tell LifeOS
(`server/src/ai-actions.js`) read/write `MoneyTxn` instead of `Expense`. Demo data seeds MoneyTxn,
accounts (1 bank, 1 credit card, 1 add-on card "Rohan"), khata people (one with opening entries),
one reimbursement claim and a subscription pattern.

## 5. Removed (they did not work on the live site)

- Local AI (Ollama) and bring-your-own-key OpenAI / AWS Bedrock: code, UI, docs, `@aws-sdk` dependency.
- The decorative card in the web sidebar.
- Personal AI and Tell LifeOS are **hidden** while `/api/ai/status` says LifeOS AI is not set up
  (they appear by themselves once GROQ/GEMINI keys exist on the server).

## 6. Phone capture (Android only)

- SMS: `RECEIVE_SMS` + `READ_SMS` (runtime permission, explicit opt-in screen). A `SmsReceiver`
  drops OTP / promo / personal text natively, keeps a durable encrypted queue; Flutter parses with the
  ported SpendSense parsers (`lib/money/parsing/*`, from `spendsense/lib/domain/parsing`), then
  `POST /txns/ingest`. Inbox import of past bank SMS (user-chosen range, default 90 days).
- Notifications: keep the existing listener; feed it through the same Dart parser and ingest.
- Screenshot: share/pick an image → ML Kit text recognition on device → ported screenshot parser →
  review → ingest with `source:'screenshot'`. Old khata screenshot → text → `/khata/import/parse`.
- Honest limits shown in-app: force-stopped apps get nothing until reopened; UPI Lite often sends no
  SMS; iPhone has no SMS access (manual + screenshot only).

## Server notes

What the server (`server/src/money/*`) actually does, where the contract above was silent or
could not be followed word for word. Endpoint names and list shapes are exactly as in §4.

**Errors.** Every error body is `{ message, error }` (same sentence). Old clients read `message`.

**Single-object responses.**
- Transactions: `{ txn }` for `POST /txns` (201, or 200 when the same `clientKey` was sent before),
  `PATCH /txns/:id`, `POST /txns/:id/peer`, `/refund-of`, `/reimburse/claim`, `DELETE /reimburse/claim`,
  `DELETE /reimburse/received`, `DELETE /txns/:id/transfer`, `POST /txns/:id/transfer {untracked}`.
  `POST /txns/:id/transfer {otherId}` → `{ txn, other }`.
- `POST /reimburse/received` → `{ covered:{claimId:minor}, matchedMinor, extraMinor, shortMinor, txn }`;
  `/reimburse/preview` → the same numbers without `txn`.
- `POST|PATCH /accounts…`, `/match-bank`, `/bill-paid` → `{ account }` (with balanceMinor, card, bankSaidMinor).
- `POST|PATCH /khata/contacts` → `{ contact }`; entries → `{ entry }`; adjustments → `{ adjustment }`.
- `POST /khata/contacts/:id/swap` → `{ changed, ...same as GET contact }`.
- `POST /khata/import/save` → 201 `{ people, entries, contacts:[{id,name}] }`.
- `POST /photos` → 201 `{ id }`. `PUT /budgets` → `{ budget }`. `PATCH /merchants/:key` → `{ merchant, updatedTxns }`.
- `GET /txns` → `{ items, nextCursor }` (pass `cursor=nextCursor` for the next page; default limit 100, max 500).
- `GET /transfers/suggestions` → `{ items:[{a, b, score, reasons}] }` (a = debit). `GET /subscriptions`,
  `/budgets` (each with `usedMinor`), `/merchants`, `/accounts` → `{ items }`.
- Deletes return 204 with no body.

**Extra optional fields the server accepts** (all safe to ignore):
- `POST /txns`: `clientKey` (8–80 chars; retry-safe), `counterparty`, `time`, `status`, `purpose`.
- `PATCH /txns/:id`: also `time`, `channel`, `needsReview` (send `false` to clear the Review item).
- `PATCH /accounts/:id`: any account field, incl. `needsConfirm:false` and `ownerName:null`.
- Ingest items: `counterpartyLast4` (other account's digits named in the text, for self-transfers),
  `accountType` (used only when a new account is created), `status`. `confidence` defaults to 1.
  Ingest is `.strict()`: unknown fields (e.g. a message `body`) are refused with 400.
- `POST /khata/import/parse|save`: optional `today` (`YYYY-MM-DD`, the user's local day). Save accepts
  the parse output back unchanged (`linesMinor`, `fixMinor` are ignored) and an optional `tag` per person.
- `POST /accounts/:id/bill-paid`: optional `{date}`.

**Rules and choices.**
- Subscriptions use the contract's numbers: ±10% amount and ≥3 payments for every period. The
  ported detector (`recurring.js`) keeps SpendSense's defaults (±15%, yearly/quarterly from 2) and
  its unit tests run with those.
- A refund marked with `refund-of` takes the original's category, so it reduces that category.
  `daily` shows spend per day with refunds taken off that day, never below 0.
- Deleting a bank-captured txn is a soft delete, so the phone re-sending the same `sourceKey` gets
  `duplicate` and it never comes back. Khata-made ("paid for me") txns are removed for real.
- Khata lines made from a payment cannot change amount/direction in Khata (change the payment).
  "Paid for me" lines keep their txn's amount, date, note/title and category in step.
- Contact names are unique by letters only, ignoring case and spaces ("Dada ji" = "DADAJI");
  names with no Latin letters fall back to the lower-cased name.
- New accounts from capture are named `"<bank> ••<last4>"`, type `savings` unless `accountType` is
  sent, `needsConfirm:true`. Same last digits with a different bank → a new account.
- `followBank` is skipped for credit cards (their "Avl" figure is the limit). The bank figure is
  applied as of the capture's date/time; a txn without a time counts from the start of its day.
- Cross-source merge (SMS ↔ notification, no UTR) needs both items to have a `time`.
- Self-transfer auto-link: same UTR (≥6 digits) or the text/`counterpartyLast4` naming the other own
  account's digits, within 3 days. Suggestions look at the last 90 days.
- Migration: old *pending* captured payments become cleared txns with `needsReview:true` (they are
  real payments and count, like new captures). Confirmed old "expense" payments are not copied twice
  (their Expense row is). Writes made through old app versions *after* a user's migration are not
  copied again (the flag is set once).
- Photos: at most 500 per user; uploads with no owner that are not attached within 24 h are removed.
  On import save, the first person gets the uploaded photo and every other person gets a copy.
  `GET /photos/:id` is `private, max-age=86400` and `Cross-Origin-Resource-Policy: same-site`.
- Body limit: 16 KB everywhere except `POST /api/money/photos` (2.2 MB, read only after the session check).
- Tell LifeOS proposals now include `path`: save by POSTing `proposal.values` to `/api${proposal.path}`.
  Spending proposals are `{collection:'txns', path:'/money/txns'}` with MoneyTxn fields.
  The AI context `counts` key for spending is now `txns` (was `expenses`).
- `GET /api/ai/status` → `{ lifeos: { available, providers, dailyLimit, message } }` only.

## Running locally

1. Start MongoDB (needs Docker Desktop running): `npm run db:up` (Mongo 8 on 127.0.0.1:27017).
   Without Docker: install MongoDB Community (`brew tap mongodb/brew && brew install mongodb-community`)
   and run `brew services start mongodb-community`.
2. Copy `server/.env.example` to `server/.env` (once). `MONGODB_URI=mongodb://127.0.0.1:27017/lifeos`.
3. Start the API: `npm run dev:api` (port 4000). Or API + website together: `npm run dev`.
4. Optional sample account with the Money v2 demo story: `npm run seed` (uses `SEED_*` in `server/.env`).
   "Try the demo" on the sign-in screen seeds the same story.
5. Quick check with curl (cookie session):
   ```sh
   curl -c c.txt -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
     -X POST localhost:4000/api/auth/register \
     -d '{"name":"Me","email":"me@example.com","password":"password123","confirmPassword":"password123"}'
   curl -b c.txt localhost:4000/api/money/overview
   ```
   Mobile clients send `X-Client-Type: mobile` and `Authorization: Bearer <token>` instead.
6. Tests: `npm test` (no database needed; Money uses `server/src/money/memory-store.js`).
   Real Mongo: `npm run test:integration` (database name must end in `_test`; account deletion
   is only checked there when Mongo runs as a replica set).

## Web notes

What the website (`apps/web/`) expects or assumes beyond §4. Nothing here blocks the web app.

- Single-object responses are read as `{ txn }`, `{ account }`, `{ contact }`, `{ entry }`, but the
  bare object also works. `PATCH /txns/:id` is sent `amountMinor` (not `amount`) and `needsReview:false`
  for "Looks right" / Review → Confirm.
- `GET /txns` paging uses `nextCursor` ("Show more").
- Txn photos: there is no list of a txn's photos in §4. The drawer shows `txn.photos:[{id, caption}]`
  if the server ever adds it; otherwise it shows only photos uploaded during this visit.
- Net-worth trend: §4 has only `netWorthMinor` (now). Insights shows the current figure plus an
  honest "income minus spending, added up" line from `trend`. A `netWorthTrend` would replace it.
- Transfer suggestions "Not a transfer" is dismissed on this screen only (no endpoint to remember it).
- Avatar colour pair: there is no profile endpoint to save `avatar`, so the choice is stored on the
  device (`localStorage`). `user.avatar` is used when the server sends it.
- Tell LifeOS saves to `/api${proposal.path}` and falls back to `/workspaces/<collection>`.
- Dev only: `MOCK_API=1 npm run dev -w apps/web` serves an in-memory fake of this contract
  (`apps/web/src/dev/fake-money.js` + `mock-api.js`); the tests use the same fake.

## Mobile notes

Written by the Flutter app work (apps/mobile, 0.2.0+2). Things the app needs that §4 does not cover yet:

- **Avatar colour pair.** DESIGN.md says it is stored on the user profile (`avatar`), but there is no
  endpoint to save it. The app keeps the choice on the phone and reads `user.avatar` if the server sends it.
  Needed: `PATCH /api/auth/me {avatar: 0..7}`.
- **Receipt photos on a txn.** `POST /photos {ownerType:'txn'}` works, but txns do not list their photos.
  The app shows `txn.photos` (`[id]` or `[{id}]`) when present. Needed: include `photos` on txn responses.
- **Card bill / due SMS.** The phone parses statement and due-date SMS (`card_bill_parser`) but there is no
  ingest shape for them, so they are dropped after parsing. Needed: e.g. `POST /accounts/bill-from-phone
  {bank, last4, billMinor, minDueMinor, dueDate, limitMinor?}`.
- **Opening entries without a date** come back with today's date, so the khata list says "Today".
  Keeping `date: null` (or the import date) for undated old lines would read better.
- **Ingest sourceKey** = `<source>:sha256(v1|source|normalisedSender|amountMinor|bucket|ref)`; bucket is
  `ref` when a bank reference exists, otherwise a 10-minute time bucket. Retries and inbox re-imports
  repeat the same key, so the server's unique `sourceKey` makes them idempotent.
- **Play Store:** `RECEIVE_SMS` / `READ_SMS` need the Play Console "SMS and Call Log permissions"
  declaration (core use: expense tracking) before this build can go to closed testing.
