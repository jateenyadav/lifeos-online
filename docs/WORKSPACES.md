# Your daily spaces

## 1. Start with Today

1. Run `npm run dev` from the project folder.
2. Open `http://localhost:5173` and sign in.
3. Today shows your scheduled routines, due reminders, recent workouts, and monthly spending.
4. Choose a quick entry card to open the right editor.
5. Use the sidebar to open a whole space.

On mobile, keep the backend running and run `npm run dev:mobile` in another terminal.
Use the five buttons at the bottom of the screen.

## 2. Notes and reminders

- Create a title, details, and a tag.
- Choose Note or Reminder. A reminder needs a date.
- Pin useful notes to the top.
- Search titles, details, and tags.
- Filter notes, reminders, pinned entries, and archived entries.
- Complete reminders, or reopen them later.
- Archive an entry to hide it. Restore it from Archived.
- Edit saved entries. Delete only after confirming.

Reminders appear in the app. They do not send phone or browser notifications yet.

## 3. Workout journal

- Log a name, date, type, minutes, and effort.
- Keep exercises, sets, reps, and your own notes in the details box.
- Use a quick-start name to save typing. It does not save until you choose Save.
- Look at sessions, minutes, and active days for the last seven days.
- Search or filter your past sessions.
- Use Repeat on web or Use again on mobile to start from a past session.

This records your activity. It does not prescribe a workout plan.

## 4. Daily routines

- Add medicine, skin care, water, or your own habit.
- Choose Morning, Afternoon, Evening, or Anytime.
- Choose the days when you want to repeat it.
- Check it off from Today or Daily routines.
- Undo a check-in when needed.
- Choose an earlier date to fill in missed history.
- See the last seven days and your current streak.

A streak is a run of completed scheduled days. Days you did not schedule do not break it.
An unfinished current day does not erase the streak from previous days.
Medicine tracking records your existing routine. It does not choose medicines or doses.

## 5. Spending journal

- Add a title, INR amount, date, category, payment method, and optional note.
- The app accepts up to two decimal places.
- Choose a month to see its expenses and category totals.
- Set a separate budget for each month.
- See the money remaining or the amount over budget.
- Search and filter expenses.
- Export CSV on web. On mobile, Copy CSV puts the text on your clipboard.

CSV is a plain file format that a spreadsheet can read.
Web export includes the expenses currently shown by the month, search, and category filters.
Amounts are stored as whole paise. This avoids rounding errors while adding money.

On supported Android phones, **Spend → Enable tracking** can check future notifications
and queue recognised English INR payment confirmations for your review.
It requires explicit notification access. It does not import old notifications.
iPhone uses manual entry because it cannot read other apps' notifications.
Read [Notification spending](NOTIFICATION_SPENDING.md) for setup, privacy, and limits.
The Payments, People, and Trips views support remembered recipients, self transfers, lending, returns, and equal trip splits.
Read [Money review](MONEY_REVIEW.md) for examples and API fields.

## 6. How saving works

```text
Screen (React or Flutter) → Checker (Express) → Storage (MongoDB)
```

The screen sends an entry when you choose Save or check off a routine.
With notification tracking enabled, Android can save pending payment reviews in the background.
Only reviews confirmed as Spending add personal expenses.
The checker verifies your login, entry values, and ownership.
Storage keeps each entry under your account.
Other accounts cannot list, edit, delete, or check off your entries.
Browser writes also check the request origin.

The website uses the existing secure login cookie.
Mobile uses its existing stored session token.
No new API key or Google console setting is needed.
Restart the backend after this update so the new routes and database collections are available.

Use Refresh saved spaces after making a change on another device.
Web also checks every 30 seconds while visible and when you return to the window.
Mobile refreshes on return and detected-payment events.
You need a working network connection to load and save.
Detected payments have an encrypted offline waiting list on Android.
Offline manual editing, general background sync, and reminder notifications come later.

## 7. Where each part lives

- `apps/web/src/Dashboard.jsx`: sidebar, addresses, loading, errors, and the shared page frame.
- `apps/web/src/workspaces/Today.jsx`: daily overview and quick actions.
- `apps/web/src/workspaces/Notes.jsx`: notebook and reminders.
- `apps/web/src/workspaces/Workouts.jsx`: workout journal.
- `apps/web/src/workspaces/Routines.jsx`: routine schedule and daily history.
- `apps/web/src/workspaces/Spending.jsx`: expenses, budgets, and CSV export.
- `apps/web/src/workspaces/useWorkspace.js`: loading and saving through the API.
- `apps/web/src/workspaces/workspaces.css`: compact layouts and mobile browser styling.
- `apps/mobile/lib/screens/home_screen.dart`: mobile page frame and bottom navigation.
- `apps/mobile/lib/workspaces/`: separate mobile spaces, entry editor, and saved-data controller.
- `server/src/workspaces.js`: protected routes and entry checks.
- `server/src/workspace-models.js`: MongoDB models and owner-scoped storage.

## 8. API routes

All paths start with `/api/workspaces`. Every route needs a valid login.

- `GET /`: load notes, workouts, routines, expenses, and budgets for this account.
- `POST /notes`, `/workouts`, `/routines`, or `/expenses`: create an entry.
- `POST /budgets`: create or replace the budget for one month.
- `PATCH /COLLECTION/ID`: edit only supplied fields. Unedited fields stay unchanged.
- `DELETE /COLLECTION/ID`: delete an owned entry.
- `POST /routines/ID/check`: send a date and a completed boolean.

A check-in uses an atomic database operation. Repeating it does not create duplicate dates.
Editing a routine preserves its check-in history.
Invalid values return 400. Missing login returns 401. A wrong write origin returns 403.
An entry belonging to another account returns 404, just like a missing entry.

## 9. Build one small feature yourself

1. Choose one space file, such as `Notes.jsx`.
2. Add a new filter button.
3. Use that filter to choose which entries appear.
4. Add a test in `apps/web/src/test/Dashboard.test.jsx`.
5. Run `npm run lint`, `npm run build`, and `npm run test -w apps/web`.
