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

## 2. Start local AI on your Mac

Ollama is a program that runs an AI model on your computer.

Install it once, if needed:

```sh
brew install ollama
```

Start Ollama in its own terminal:

```sh
OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 ollama serve
```

Keep this terminal open.
`OLLAMA_NO_CLOUD=1` turns off Ollama cloud features.
`127.0.0.1` means this computer only.
Port `11434` is Ollama's numbered door.
Do not expose Ollama directly to the internet.

Open a second terminal.
Download the default model once:

```sh
ollama pull llama3.2:3b
```

The first download needs internet and about 2 GB of disk space.
Later local answers do not need a cloud API key.
For a smaller model, use `ollama pull llama3.2:1b` and select `llama3.2:1b` in **Model ID**.
Small models can give weaker answers.

After the download finishes, check a real local answer from the project folder:

```sh
npm run ai:check
```

This uses a made-up skin care note. It does not read or write your real records.
It checks that the model repeats the saved product name.
For a different downloaded model, use `npm run ai:check -- llama3.2:1b`.

From the LifeOS project folder:

```sh
npm run db:up
npm run dev
```

The first command starts local MongoDB. Docker must be running.
The second starts the backend on port `4000` and website on port `5173`.
Open `http://localhost:5173/#ai` and sign in.
Choose **Local AI (Ollama, no key)**.
Click **Check local AI**.
Keep **Model ID** set to `llama3.2:3b`, or choose a downloaded model.
Enter your question and click **Ask AI**.

The defaults work without changing existing environment files.
Optional values live in `server/.env`:

```dotenv
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
```

`OLLAMA_URL` only accepts a numeric loopback HTTP address.
Restart the backend after changing it.
Do not put cloud keys in the web or mobile build settings.

Keep `MONGODB_URI=mongodb://127.0.0.1:27017/lifeos` for local storage.
If your MongoDB address points to a hosted database, the data is not fully local.
Mobile calls the same backend computer. The model does not run inside the phone.
Keep the backend and Ollama running while using mobile.
Use the existing `API_BASE_URL` setup for your simulator or real phone.

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

## 4. Optional OpenAI API key

An API key is a secret service pass, like a key to a paid locker.
Only the **Personal AI** screen has these connection fields.

1. Sign in to the [OpenAI platform](https://platform.openai.com/).
2. Choose your project.
3. Open [API keys](https://platform.openai.com/api-keys).
4. Click **Create new secret key**.
5. Name it `LifeOS`, create it, and copy the secret once.
6. In LifeOS, choose **OpenAI API key (cloud)**.
7. Paste it into **OpenAI API key**.
8. Set **Model ID** to a Chat Completions model your project can use. The starting value is `gpt-4.1-mini`.
9. Choose the data topics.
10. Read and check **I agree to send the selected data and chat to this cloud provider.**
11. Click **Ask AI**.

Put the key in that screen only. No file needs this value.
Check your project billing and usage limits before sending requests.
Cloud mode is not local mode.
The question, recent chat, and selected relevant data excerpts go to OpenAI.
The app sends `store: false` for generated-response storage.
That does not promise zero retention of all provider logs.

## 5. Optional AWS Bedrock access keys

Bedrock is AWS's hosted AI service.
A region is the service's location, like choosing a nearby branch office.
IAM is AWS's permission checker, like a security guard for your account.
Converse is Bedrock's common text-chat request format.

First choose an accessible model:

1. Sign in to your AWS console.
2. Search for **Amazon Bedrock** and open it.
3. Choose your region using the console's region selector.
4. Open **Model catalog**.
5. Choose a text model that supports Converse.
6. Open it in the playground and complete any required access or use-case steps.
7. Copy its model ID, or an inference profile ID if the model requires one.

An inference profile is a routing label, like a delivery address for a model.
Model access, supported regions, and account setup vary by model.
Ask your AWS administrator for `bedrock:InvokeModel` permission on the chosen model.
An inference profile can also require permissions on the profile and its routed models.
Do not use root-account access keys.

Prefer temporary credentials from an existing IAM Identity Center setup:

1. Sign in to your organization's **AWS access portal**.
2. Expand the AWS account you will use.
3. Next to the assigned role, click **Access keys** or **Command line or programmatic access**.
4. Copy the access key ID, secret access key, and session token from the credentials dialog.
5. In LifeOS, choose **AWS Bedrock access keys (cloud)** on web, or **AWS Bedrock (cloud)** on mobile.
6. Paste the region into **AWS region**, such as `us-east-1` if that is the region you chose.
7. Paste each credential into its matching AWS field.
8. Temporary credentials need **AWS session token (optional)** too.
9. Paste the model or inference profile ID into **Model ID**.
10. Choose the data topics, approve cloud sharing, then click **Ask AI**.

Put these values in the screen only. No project file needs them.
If you already have non-root IAM access keys, the same fields support them without a session token.
Temporary credentials expire. Paste fresh values when they do.
The app does not automatically refresh AWS credentials.
Check AWS costs before using the model.

## 6. Privacy and limits

- Local mode contacts only the configured loopback Ollama server.
- Cloud-named Ollama models and models reporting a remote host/model are rejected before personal data is sent.
- There is no automatic cloud fallback.
- AI reads only the signed-in user's selected data topics.
- Tracker data includes workouts, routines and check-ins, saved expenses, and budgets.
- Unreviewed payments, trips, ordinary notes, login details, and account emails are not included.
- Knowledge entries are saved in the same MongoDB database as your trackers.
- Cloud keys stay in screen memory and the current server request. They are not saved in MongoDB or browser storage.
- Changing provider, leaving AI, or refreshing clears keys and chat.
- Changing data topics clears chat and cloud consent.
- Real phones and remote browsers need an HTTPS backend connection for cloud keys. Local AI can use trusted-network development HTTP.
- Web and mobile block insecure remote cloud requests before sending keys. The Android emulator's `10.0.2.2` HTTP address also needs HTTPS for cloud mode. You can use local AI there, or cloud chat in the computer's localhost browser.
- The local development HTTP exception is only for connections reaching the backend from the same computer. Do not expose a plain-HTTP reverse proxy publicly.
- AI can suggest things but cannot create, edit, or delete tracker records.
- The backend scans at most 2,000 recent records per tracker data type, ordered by last edit.
- It builds a current-month spending summary using UTC calendar dates and exact stored paise amounts.
- It selects relevant text by matching question words, not by sending your whole database.
- At most 13 source entries and roughly 14,000 characters of reference text go into an answer.
- Up to three recent chat pairs are included, with 1,000 characters per message.
- Source labels such as `[S1]` point to data provided to the model. They are not proof the model interpreted it correctly.
- AI can be wrong. This is not medical, treatment, or investment advice.

## 7. Common errors

**Cannot reach local AI**

Meaning: the backend cannot reach Ollama.
Cause: Ollama is not running, or the address is wrong.
Fix: run `OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11434 ollama serve`, then click **Check local AI**.

**Local model not found**

Meaning: Ollama does not have the model you selected.
Cause: it was not downloaded, or the model ID is misspelled.
Fix: run `ollama pull llama3.2:3b`, then use `llama3.2:3b` in **Model ID**.

**AI took too long**

Meaning: the request reached the two-minute limit.
Cause: the model is loading or the computer does not have enough available memory.
Fix: download `llama3.2:1b`, choose it in **Model ID**, and ask a shorter question.

**Cloud keys need HTTPS**

Meaning: your remote connection would expose keys over plain HTTP.
Cause: a real phone or remote browser is using the development HTTP address.
Fix: keep **Local AI** selected, or configure an HTTPS backend before entering cloud keys.

**Bedrock access denied**

Meaning: AWS refused this model request.
Cause: missing IAM permissions, incomplete model setup, or the wrong region.
Fix: check the model in **Model catalog**, confirm the region, and ask your administrator for the chosen model's invoke permissions.

**AWS session expired**

Meaning: temporary keys are no longer valid.
Cause: their time limit ended.
Fix: reopen your AWS access portal, copy new credentials, and replace all three AWS credential fields.

## 8. Code map and checks

`Screen (React or Flutter) → Checker (Express) → Storage (MongoDB)`

The screen sends a question and selected connection.
The checker loads your saved data and finds useful snippets.
Storage keeps knowledge and tracker records, not keys or chat history.
The checker calls Ollama locally, or the explicitly chosen cloud service.

- `apps/web/src/workspaces/PersonalAi.jsx`: web chat, knowledge editor, and optional cloud fields.
- `apps/web/src/workspaces/personal-ai.css`: web layout and responsive styles.
- `apps/mobile/lib/workspaces/personal_ai_space.dart`: mobile chat and knowledge editor.
- `server/src/ai.js`: private AI routes, validation, consent checks, and request limits.
- `server/src/ai-context.js`: saved-data summaries and text retrieval.
- `server/src/ai-providers.js`: Ollama, OpenAI, and AWS Bedrock connections.
- `server/src/ai-models.js`: private MongoDB knowledge storage.
- `server/test/ai.test.js`: data isolation and mocked provider tests.
- `apps/web/src/test/PersonalAi.test.jsx`: web interaction tests.
- `apps/mobile/test/personal_ai_test.dart`: mobile interaction tests.
- `scripts/check-local-ai.mjs`: a real local-model check with sample data only.

From the project root:

```sh
npm test
npm run test:integration
npm run lint
npm run build
```

From `apps/mobile`:

```sh
flutter analyze
flutter test
```

Automated provider tests use mocked responses. They do not prove your OpenAI key or AWS account works.
Test cloud providers yourself with real, authorized credentials after reviewing costs and privacy.

## Official references

- [Ollama local-only mode](https://docs.ollama.com/faq)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Llama 3.2 model downloads](https://ollama.com/library/llama3.2)
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [AWS Bedrock Converse examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_bedrock-runtime_code_examples.html)
- [Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Bedrock invoke permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html)
- [AWS temporary credentials](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtogetcredentials.html)
