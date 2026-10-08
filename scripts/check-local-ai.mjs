import { createAiProviders } from '../server/src/ai-providers.js';
import { buildAiContext } from '../server/src/ai-context.js';

async function main() {
  const model = process.argv[2] || 'llama3.2:3b';
  const providers = createAiProviders();
  const status = await providers.status();
  if (!status.available) throw new Error(status.message);
  if (!status.models.includes(model))
    throw new Error(
      `Model ${model} is not ready. Finish ollama pull ${model}, then run this check again.`,
    );
  const question =
    'What is the exact product name in my saved sample skin care note?';
  const data = await buildAiContext({
    store: { listForAi: async () => [] },
    knowledge: {
      list: async () => [
        {
          id: 'sample',
          title: 'Sample skin care note',
          topic: 'routines',
          content:
            'My saved product name is RiverLight Cream. This is sample text for a software check, not medical advice.',
        },
      ],
    },
    userId: 'sample-only',
    topics: ['routines'],
    question,
  });
  console.log(
    `Checking ${model} locally with sample data. No real tracker data or cloud keys are used.`,
  );
  const answer = await providers.answer({
    provider: 'local',
    model,
    system: `Answer using only these saved reference facts. Give the exact product name and cite its source label. Do not invent facts or give treatment advice.\n${data.context}`,
    messages: [{ role: 'user', content: question }],
  });
  console.log(answer);
  if (!answer.includes('RiverLight Cream'))
    throw new Error(
      'The local model did not repeat the expected saved fact. Try a different chat model.',
    );
  console.log(
    'Local AI check passed. The model answered from the saved sample note.',
  );
}

await main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
