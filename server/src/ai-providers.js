import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { ApiError } from './auth.js';

export function validateOllamaUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'OLLAMA_URL must be a loopback HTTP address, such as http://127.0.0.1:11434.',
    );
  return url.origin;
}

const safeModel = (name) =>
  typeof name === 'string' &&
  /^[a-zA-Z0-9._:/-]{1,200}$/.test(name) &&
  !/cloud/i.test(name);

export function createAiProviders({
  ollamaUrl = 'http://127.0.0.1:11434',
  fetchImpl = fetch,
  createBedrockClient = (options) => new BedrockRuntimeClient(options),
} = {}) {
  const localUrl = validateOllamaUrl(ollamaUrl);
  async function jsonRequest(url, body, headers = {}, timeout = 120000) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) {
        const local = url.startsWith(localUrl);
        const message = local
          ? response.status === 404
            ? 'Local model not found. Run ollama pull with the model name first.'
            : 'Ollama could not answer. Check its model and available memory.'
          : [401, 403].includes(response.status)
            ? 'OpenAI rejected the key. Check your API key and model access.'
            : response.status === 429
              ? 'OpenAI rate or billing limit reached. Check your account.'
              : 'OpenAI could not answer. Check your model ID and account.';
        throw new ApiError(response.status === 429 ? 429 : 502, message);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (['TimeoutError', 'AbortError'].includes(error.name))
        throw new ApiError(
          504,
          'AI took too long. Try a smaller model or a shorter question.',
        );
      throw new ApiError(
        503,
        url.startsWith(localUrl)
          ? 'Cannot reach local AI. Start Ollama, download a model, then retry.'
          : 'Cannot reach OpenAI. Check the server internet connection.',
      );
    }
  }

  return {
    async status() {
      try {
        const result = await jsonRequest(
          `${localUrl}/api/tags`,
          undefined,
          {},
          4000,
        );
        const models = (result.models ?? [])
          .filter(
            (entry) =>
              safeModel(entry.name) &&
              !entry.remote_host &&
              !entry.remote_model,
          )
          .map((entry) => entry.name);
        return {
          available: true,
          models,
          message: models.length
            ? 'Ollama is running. Choose a downloaded local model.'
            : 'No local model found. Run ollama pull llama3.2:3b.',
        };
      } catch (error) {
        return { available: false, models: [], message: error.message };
      }
    },
    async answer({ provider, model, credentials, messages, system }) {
      let text;
      if (provider === 'local') {
        if (!safeModel(model))
          throw new ApiError(
            400,
            'Choose a local model. Cloud Ollama models are not allowed here.',
          );
        const details = await jsonRequest(
          `${localUrl}/api/show`,
          { model },
          {},
          10000,
        );
        if (details.remote_host || details.remote_model)
          throw new ApiError(
            400,
            'This model forwards to the cloud. Choose a downloaded local model.',
          );
        const result = await jsonRequest(`${localUrl}/api/chat`, {
          model,
          messages: [{ role: 'system', content: system }, ...messages],
          stream: false,
          options: { num_ctx: 8192, num_predict: 1000 },
        });
        text = result.message?.content;
      } else if (provider === 'openai') {
        const result = await jsonRequest(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [{ role: 'system', content: system }, ...messages],
            store: false,
            max_completion_tokens: 1000,
          },
          { Authorization: `Bearer ${credentials.apiKey}` },
        );
        text = result.choices?.[0]?.message?.content;
      } else if (provider === 'bedrock') {
        const client = createBedrockClient({
          region: credentials.region,
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            ...(credentials.sessionToken
              ? { sessionToken: credentials.sessionToken }
              : {}),
          },
          maxAttempts: 1,
        });
        try {
          const result = await client.send(
            new ConverseCommand({
              modelId: model,
              system: [{ text: system }],
              messages: messages.map((entry) => ({
                role: entry.role,
                content: [{ text: entry.content }],
              })),
              inferenceConfig: { maxTokens: 1000 },
            }),
            { abortSignal: AbortSignal.timeout(120000) },
          );
          text = result.output?.message?.content
            ?.map((entry) => entry.text ?? '')
            .join('\n');
        } catch (error) {
          const messages = {
            AccessDeniedException:
              'Bedrock access denied. Check IAM permissions and model access in your region.',
            UnrecognizedClientException:
              'AWS credentials were rejected. Check the access key, secret, and session token.',
            ExpiredTokenException:
              'AWS session expired. Enter fresh temporary credentials.',
            ValidationException:
              'Bedrock model or region is invalid. Use a Converse-compatible model ID or inference profile ID.',
            ResourceNotFoundException:
              'Bedrock model not found in this region. Check your model or inference profile ID.',
            ThrottlingException:
              'Bedrock rate limit reached. Wait before retrying.',
            AbortError: 'Bedrock took too long. Try again.',
          };
          throw new ApiError(
            502,
            messages[error.name] ??
              'Bedrock could not answer. Check credentials, region, model access, and internet connection.',
          );
        } finally {
          client.destroy();
        }
      }
      if (typeof text !== 'string' || !text.trim())
        throw new ApiError(502, 'AI returned no text. Try another model.');
      return text.trim().slice(0, 12000);
    },
  };
}
