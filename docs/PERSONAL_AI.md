# Personal AI

## 1. What this adds

Open **Personal AI** on the website.
Tap **AI** on mobile.

You can ask about saved workouts, daily routines, skin care, and spending.
Choose which data topics the AI may read.
You can also save your own gym plans, product notes, and spending rules.
The website can import small `.txt` and `.md` files.
Mobile supports pasting text.

This is **not model training from scratch or fine-tuning**.
A model is a ready-made answer engine, like a person who already knows a language.
The app gives that engine relevant pages from your own notebook for each question.
This is called retrieval: finding useful notes before answering.
Your data does not change the model's internal learned values.
There is no training progress bar because no training job runs.

## 2. Turn on LifeOS AI (server keys)

LifeOS AI is free for users. Nobody types a key in the app.
The server holds the AI keys, like a shop that pays the electricity bill for its customers.

1. Get a free key from [Groq](https://console.groq.com/keys) or [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in `server/.env` as `GROQ_API_KEY=...` or `GEMINI_API_KEY=...` (any one is enough).
3. On Render, add the same name in **lifeos-api → Environment**.
4. Restart the API. The start log says `LifeOS AI (free cloud models) is on.`

`AI_DAILY_LIMIT` (default 30) is how many questions each user can ask per day.
While no key is set, `GET /api/ai/status` says `lifeos.available: false`,
and the website hides **Personal AI** and **Tell LifeOS** by itself.

## 3. Add your gym and skin care data

1. Save entries in **Workout tracker** and **Daily routines** as usual.
2. Open **Personal AI**.
3. Under **Add your own knowledge**, enter **Knowledge title**.
4. Choose **Knowledge topic**.
5. Paste your own plan or product details in **Knowledge text**.
6. On web, you can instead choose a file under **Import text file (.txt or .md)**.
7. Read the imported text, then click **Save knowledge**.
8. Ask a question. The new knowledge is available immediately.

Each entry can contain up to 10,000 characters.
You can save up to 100 entries.
There is no PDF, image, or spreadsheet parser in this version.
Use **Delete knowledge** to remove an old entry after confirming.
Saved tracker edits and deletions are read fresh for the next answer.

Example questions:

- What skin care routines have I saved?
- What exercises did I log on my last workout?
- What does my saved gym plan say about Monday?
- Where did I spend most this month?

## 4. Privacy and limits

- AI reads only the signed-in user's selected data topics.
- Tracker data includes workouts, routines and check-ins, Money transactions, and budgets.
- Spending uses your own part only: friends' shares, refunds, reimbursements and self-transfers are left out.
- Raw bank SMS or notification text never reaches the server, so it never reaches the AI.
- Trips, ordinary notes, login details, and account emails are not included.
- Knowledge entries are saved in the same MongoDB database as your trackers.
- You must agree before data is sent (`cloudConsent: true`). Changing data topics clears chat and consent.
- AI can suggest things but cannot create, edit, or delete records. Tell LifeOS only proposes one; you press Save.
- The backend scans at most 2,000 recent records per data type.
- It builds a current-month spending summary using UTC calendar dates and exact stored paise amounts.
- It selects relevant text by matching question words, not by sending your whole database.
- At most 13 source entries and roughly 14,000 characters of reference text go into an answer.
- Up to three recent chat pairs are included, with 1,000 characters per message.
- Source labels such as `[S1]` point to data provided to the model. They are not proof the model interpreted it correctly.
- AI can be wrong. This is not medical, treatment, or investment advice.

## 5. Common errors

**LifeOS AI is not set up on this server yet**

Meaning: the server has no AI key.
Cause: `GROQ_API_KEY` and `GEMINI_API_KEY` are both empty.
Fix: add one key (step 2 above) and restart the API.

**You've used today's free AI questions**

Meaning: you reached `AI_DAILY_LIMIT` for today.
Cause: the daily allowance protects the free keys.
Fix: wait until midnight UTC, or raise `AI_DAILY_LIMIT` on your own server.

**LifeOS AI is busy right now**

Meaning: every free provider said "too many requests".
Cause: the free quota is shared and was busy.
Fix: wait a minute and ask again.

## 6. Code map and checks

`Screen (React or Flutter) → Checker (Express) → Storage (MongoDB)`

The screen sends a question and the chosen data topics.
The checker loads your saved data and finds useful snippets.
Storage keeps knowledge and tracker records, not chat history.
The checker calls the free cloud models with the server's keys.

- `apps/web/src/workspaces/PersonalAi.jsx`: web chat and knowledge editor.
- `apps/mobile/lib/workspaces/personal_ai_space.dart`: mobile chat and knowledge editor.
- `server/src/ai.js`: private AI routes, validation, consent checks, and request limits.
- `server/src/ai-cloud.js` and `server/src/lib/kit-ai.js`: LifeOS AI (Groq → Gemini → OpenRouter) and the daily allowance.
- `server/src/ai-context.js`: saved-data summaries and text retrieval (Money v2 for spending).
- `server/src/ai-actions.js`: Tell LifeOS proposals.
- `server/src/ai-models.js`: private MongoDB knowledge storage and usage counters.
- `server/test/ai.test.js`: data isolation and mocked provider tests.

From the project root:

```sh
npm test
npm run lint
```

Automated tests use mocked AI replies. They do not prove your Groq or Gemini key works.
