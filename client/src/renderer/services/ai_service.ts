/**
 * AI Service for renderer process
 * Uses IPC to communicate with main process to avoid CORS issues
 * (Anthropic API does not support browser CORS)
 */

export type AIProvider = 'openai' | 'anthropic' | 'openrouter';

export interface AIConfig {
  provider: AIProvider;
  openAiKey?: string;
  anthropicKey?: string;
  openRouterKey?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SendMessageRequest {
  config: AIConfig;
  modelId: string;
  messages: ChatMessage[];
}

interface SendMessageResponse {
  success: boolean;
  text?: string;
  error?: string;
}

interface TranscribeRequest {
  config: AIConfig;
  audioData: string;
  fileName: string;
}

interface TranscribeResponse {
  success: boolean;
  text?: string;
  error?: string;
}

// Maximum number of messages to send to the AI (sliding window)
const MAX_CONTEXT_MESSAGES = 20;

// OpenAI models
export const OPENAI_MODELS = [
  'gpt-3.5-turbo',
  'gpt-4-turbo-preview',
  'gpt-4-0125-preview',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4o-mini-search-preview',
  'gpt-4o-search-preview',
  'o1',
  'o1-mini',
  'o3',
  'o3-mini',
  'o3-pro',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5-mini',
  'gpt-5',
  'gpt-5-nano',
];

// Anthropic (Claude) models - from https://platform.claude.com/docs/en/about-claude/models/overview
export const ANTHROPIC_MODELS = [
  // Claude 4.5 series (Latest - recommended)
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5-20251101',
  'claude-opus-4-1-20250805',
  // Claude 4.5 aliases (auto-update to latest snapshot)
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-opus-4-5',
  'claude-opus-4-1',
  // Legacy models (Claude 4 and 3.x)
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
];

// OpenRouter models — full catalog (freeSolo autocomplete also allows typing any model ID)
export const OPENROUTER_MODELS = [
  'ai21/jamba-large-1.7',
  'aion-labs/aion-1.0',
  'aion-labs/aion-1.0-mini',
  'aion-labs/aion-rp-llama-3.1-8b',
  'alfredpros/codellama-7b-instruct-solidity',
  'alibaba/tongyi-deepresearch-30b-a3b',
  'allenai/molmo-2-8b',
  'allenai/olmo-2-0325-32b-instruct',
  'allenai/olmo-3-32b-think',
  'allenai/olmo-3-7b-instruct',
  'allenai/olmo-3-7b-think',
  'allenai/olmo-3.1-32b-instruct',
  'allenai/olmo-3.1-32b-think',
  'alpindale/goliath-120b',
  'amazon/nova-2-lite-v1',
  'amazon/nova-lite-v1',
  'amazon/nova-micro-v1',
  'amazon/nova-premier-v1',
  'amazon/nova-pro-v1',
  'anthracite-org/magnum-v4-72b',
  'anthropic/claude-3-haiku',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.7-sonnet:thinking',
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-opus-4',
  'anthropic/claude-opus-4.1',
  'anthropic/claude-opus-4.5',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-sonnet-4.5',
  'arcee-ai/coder-large',
  'arcee-ai/maestro-reasoning',
  'arcee-ai/spotlight',
  'arcee-ai/trinity-large-preview:free',
  'arcee-ai/trinity-mini',
  'arcee-ai/trinity-mini:free',
  'arcee-ai/virtuoso-large',
  'baidu/ernie-4.5-21b-a3b',
  'baidu/ernie-4.5-21b-a3b-thinking',
  'baidu/ernie-4.5-300b-a47b',
  'baidu/ernie-4.5-vl-28b-a3b',
  'baidu/ernie-4.5-vl-424b-a47b',
  'bytedance-seed/seed-1.6',
  'bytedance-seed/seed-1.6-flash',
  'bytedance/ui-tars-1.5-7b',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'cohere/command-a',
  'cohere/command-r-08-2024',
  'cohere/command-r-plus-08-2024',
  'cohere/command-r7b-12-2024',
  'deepcogito/cogito-v2.1-671b',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-chat-v3.1',
  'deepseek/deepseek-r1',
  'deepseek/deepseek-r1-0528',
  'deepseek/deepseek-r1-0528:free',
  'deepseek/deepseek-r1-distill-llama-70b',
  'deepseek/deepseek-r1-distill-qwen-32b',
  'deepseek/deepseek-v3.1-terminus',
  'deepseek/deepseek-v3.1-terminus:exacto',
  'deepseek/deepseek-v3.2',
  'deepseek/deepseek-v3.2-exp',
  'deepseek/deepseek-v3.2-speciale',
  'eleutherai/llemma_7b',
  'essentialai/rnj-1-instruct',
  'google/gemini-2.0-flash-001',
  'google/gemini-2.0-flash-lite-001',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-image',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash-lite-preview-09-2025',
  'google/gemini-2.5-flash-preview-09-2025',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-pro-preview',
  'google/gemini-2.5-pro-preview-05-06',
  'google/gemini-3-flash-preview',
  'google/gemini-3-pro-image-preview',
  'google/gemini-3-pro-preview',
  'google/gemma-2-27b-it',
  'google/gemma-2-9b-it',
  'google/gemma-3-12b-it',
  'google/gemma-3-12b-it:free',
  'google/gemma-3-27b-it',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-4b-it',
  'google/gemma-3-4b-it:free',
  'google/gemma-3n-e2b-it:free',
  'google/gemma-3n-e4b-it',
  'google/gemma-3n-e4b-it:free',
  'gryphe/mythomax-l2-13b',
  'ibm-granite/granite-4.0-h-micro',
  'inception/mercury',
  'inception/mercury-coder',
  'inflection/inflection-3-pi',
  'inflection/inflection-3-productivity',
  'kwaipilot/kat-coder-pro',
  'liquid/lfm-2.2-6b',
  'liquid/lfm-2.5-1.2b-instruct:free',
  'liquid/lfm-2.5-1.2b-thinking:free',
  'liquid/lfm2-8b-a1b',
  'mancer/weaver',
  'meituan/longcat-flash-chat',
  'meta-llama/llama-3-70b-instruct',
  'meta-llama/llama-3-8b-instruct',
  'meta-llama/llama-3.1-405b',
  'meta-llama/llama-3.1-405b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'meta-llama/llama-3.2-11b-vision-instruct',
  'meta-llama/llama-3.2-1b-instruct',
  'meta-llama/llama-3.2-3b-instruct',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'meta-llama/llama-guard-2-8b',
  'meta-llama/llama-guard-3-8b',
  'meta-llama/llama-guard-4-12b',
  'microsoft/phi-4',
  'microsoft/wizardlm-2-8x22b',
  'minimax/minimax-01',
  'minimax/minimax-m1',
  'minimax/minimax-m2',
  'minimax/minimax-m2-her',
  'minimax/minimax-m2.1',
  'mistralai/codestral-2508',
  'mistralai/devstral-2512',
  'mistralai/devstral-medium',
  'mistralai/devstral-small',
  'mistralai/ministral-14b-2512',
  'mistralai/ministral-3b-2512',
  'mistralai/ministral-8b-2512',
  'mistralai/mistral-7b-instruct',
  'mistralai/mistral-7b-instruct-v0.1',
  'mistralai/mistral-7b-instruct-v0.2',
  'mistralai/mistral-7b-instruct-v0.3',
  'mistralai/mistral-large',
  'mistralai/mistral-large-2407',
  'mistralai/mistral-large-2411',
  'mistralai/mistral-large-2512',
  'mistralai/mistral-medium-3',
  'mistralai/mistral-medium-3.1',
  'mistralai/mistral-nemo',
  'mistralai/mistral-saba',
  'mistralai/mistral-small-24b-instruct-2501',
  'mistralai/mistral-small-3.1-24b-instruct',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'mistralai/mistral-small-3.2-24b-instruct',
  'mistralai/mistral-small-creative',
  'mistralai/mixtral-8x22b-instruct',
  'mistralai/mixtral-8x7b-instruct',
  'mistralai/pixtral-12b',
  'mistralai/pixtral-large-2411',
  'mistralai/voxtral-small-24b-2507',
  'moonshotai/kimi-k2',
  'moonshotai/kimi-k2-0905',
  'moonshotai/kimi-k2-0905:exacto',
  'moonshotai/kimi-k2-thinking',
  'moonshotai/kimi-k2.5',
  'morph/morph-v3-fast',
  'morph/morph-v3-large',
  'neversleep/llama-3.1-lumimaid-8b',
  'neversleep/noromaid-20b',
  'nex-agi/deepseek-v3.1-nex-n1',
  'nousresearch/deephermes-3-mistral-24b-preview',
  'nousresearch/hermes-2-pro-llama-3-8b',
  'nousresearch/hermes-3-llama-3.1-405b',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'nousresearch/hermes-3-llama-3.1-70b',
  'nousresearch/hermes-4-405b',
  'nousresearch/hermes-4-70b',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-12b-v2-vl',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-nano-9b-v2',
  'nvidia/nemotron-nano-9b-v2:free',
  'openai/chatgpt-4o-latest',
  'openai/gpt-3.5-turbo',
  'openai/gpt-3.5-turbo-0613',
  'openai/gpt-3.5-turbo-16k',
  'openai/gpt-3.5-turbo-instruct',
  'openai/gpt-4',
  'openai/gpt-4-0314',
  'openai/gpt-4-1106-preview',
  'openai/gpt-4-turbo',
  'openai/gpt-4-turbo-preview',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o',
  'openai/gpt-4o-2024-05-13',
  'openai/gpt-4o-2024-08-06',
  'openai/gpt-4o-2024-11-20',
  'openai/gpt-4o-audio-preview',
  'openai/gpt-4o-mini',
  'openai/gpt-4o-mini-2024-07-18',
  'openai/gpt-4o-mini-search-preview',
  'openai/gpt-4o-search-preview',
  'openai/gpt-4o:extended',
  'openai/gpt-5',
  'openai/gpt-5-chat',
  'openai/gpt-5-codex',
  'openai/gpt-5-image',
  'openai/gpt-5-image-mini',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/gpt-5-pro',
  'openai/gpt-5.1',
  'openai/gpt-5.1-chat',
  'openai/gpt-5.1-codex',
  'openai/gpt-5.1-codex-max',
  'openai/gpt-5.1-codex-mini',
  'openai/gpt-5.2',
  'openai/gpt-5.2-chat',
  'openai/gpt-5.2-codex',
  'openai/gpt-5.2-pro',
  'openai/gpt-audio',
  'openai/gpt-audio-mini',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-120b:exacto',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-20b:free',
  'openai/gpt-oss-safeguard-20b',
  'openai/o1',
  'openai/o1-pro',
  'openai/o3',
  'openai/o3-deep-research',
  'openai/o3-mini',
  'openai/o3-mini-high',
  'openai/o3-pro',
  'openai/o4-mini',
  'openai/o4-mini-deep-research',
  'openai/o4-mini-high',
  'opengvlab/internvl3-78b',
  'openrouter/aurora-alpha',
  'openrouter/auto',
  'openrouter/bodybuilder',
  'openrouter/free',
  'perplexity/sonar',
  'perplexity/sonar-deep-research',
  'perplexity/sonar-pro',
  'perplexity/sonar-pro-search',
  'perplexity/sonar-reasoning-pro',
  'prime-intellect/intellect-3',
  'qwen/qwen-2.5-72b-instruct',
  'qwen/qwen-2.5-7b-instruct',
  'qwen/qwen-2.5-coder-32b-instruct',
  'qwen/qwen-2.5-vl-7b-instruct',
  'qwen/qwen-max',
  'qwen/qwen-plus',
  'qwen/qwen-plus-2025-07-28',
  'qwen/qwen-plus-2025-07-28:thinking',
  'qwen/qwen-turbo',
  'qwen/qwen-vl-max',
  'qwen/qwen-vl-plus',
  'qwen/qwen2.5-coder-7b-instruct',
  'qwen/qwen2.5-vl-32b-instruct',
  'qwen/qwen2.5-vl-72b-instruct',
  'qwen/qwen3-14b',
  'qwen/qwen3-235b-a22b',
  'qwen/qwen3-235b-a22b-2507',
  'qwen/qwen3-235b-a22b-thinking-2507',
  'qwen/qwen3-30b-a3b',
  'qwen/qwen3-30b-a3b-instruct-2507',
  'qwen/qwen3-30b-a3b-thinking-2507',
  'qwen/qwen3-32b',
  'qwen/qwen3-4b:free',
  'qwen/qwen3-8b',
  'qwen/qwen3-coder',
  'qwen/qwen3-coder-30b-a3b-instruct',
  'qwen/qwen3-coder-flash',
  'qwen/qwen3-coder-next',
  'qwen/qwen3-coder-plus',
  'qwen/qwen3-coder:exacto',
  'qwen/qwen3-coder:free',
  'qwen/qwen3-max',
  'qwen/qwen3-max-thinking',
  'qwen/qwen3-next-80b-a3b-instruct',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'qwen/qwen3-next-80b-a3b-thinking',
  'qwen/qwen3-vl-235b-a22b-instruct',
  'qwen/qwen3-vl-235b-a22b-thinking',
  'qwen/qwen3-vl-30b-a3b-instruct',
  'qwen/qwen3-vl-30b-a3b-thinking',
  'qwen/qwen3-vl-32b-instruct',
  'qwen/qwen3-vl-8b-instruct',
  'qwen/qwen3-vl-8b-thinking',
  'qwen/qwq-32b',
  'raifle/sorcererlm-8x22b',
  'relace/relace-apply-3',
  'relace/relace-search',
  'sao10k/l3-euryale-70b',
  'sao10k/l3-lunaris-8b',
  'sao10k/l3.1-70b-hanami-x1',
  'sao10k/l3.1-euryale-70b',
  'sao10k/l3.3-euryale-70b',
  'stepfun/step-3.5-flash',
  'stepfun/step-3.5-flash:free',
  'switchpoint/router',
  'tencent/hunyuan-a13b-instruct',
  'thedrummer/cydonia-24b-v4.1',
  'thedrummer/rocinante-12b',
  'thedrummer/skyfall-36b-v2',
  'thedrummer/unslopnemo-12b',
  'tngtech/deepseek-r1t-chimera',
  'tngtech/deepseek-r1t-chimera:free',
  'tngtech/deepseek-r1t2-chimera',
  'tngtech/deepseek-r1t2-chimera:free',
  'tngtech/tng-r1t-chimera',
  'tngtech/tng-r1t-chimera:free',
  'undi95/remm-slerp-l2-13b',
  'upstage/solar-pro-3:free',
  'writer/palmyra-x5',
  'x-ai/grok-3',
  'x-ai/grok-3-beta',
  'x-ai/grok-3-mini',
  'x-ai/grok-3-mini-beta',
  'x-ai/grok-4',
  'x-ai/grok-4-fast',
  'x-ai/grok-4.1-fast',
  'x-ai/grok-code-fast-1',
  'xiaomi/mimo-v2-flash',
  'z-ai/glm-4-32b',
  'z-ai/glm-4.5',
  'z-ai/glm-4.5-air',
  'z-ai/glm-4.5-air:free',
  'z-ai/glm-4.5v',
  'z-ai/glm-4.6',
  'z-ai/glm-4.6:exacto',
  'z-ai/glm-4.6v',
  'z-ai/glm-4.7',
  'z-ai/glm-4.7-flash',
  'z-ai/glm-5',
];

export function getModelsForProvider(provider: AIProvider): string[] {
  switch (provider) {
    case 'openai':
      return OPENAI_MODELS;
    case 'anthropic':
      return ANTHROPIC_MODELS;
    case 'openrouter':
      return OPENROUTER_MODELS;
    default:
      return OPENAI_MODELS;
  }
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-sonnet-4-5'; // Best balance of intelligence, speed, and cost
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    default:
      return 'gpt-4o-mini';
  }
}

/**
 * Trim messages to maintain a sliding window of recent context
 * Keeps system messages and the most recent user/assistant messages
 */
function trimMessagesToContext(messages: ChatMessage[]): ChatMessage[] {
  // Separate system messages from chat messages
  const systemMessages = messages.filter((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  // Keep only the most recent messages (sliding window)
  const maxChatMessages = MAX_CONTEXT_MESSAGES - systemMessages.length;
  const trimmedChatMessages = chatMessages.slice(-maxChatMessages);

  // Return system messages first, then recent chat messages
  return [...systemMessages, ...trimmedChatMessages];
}

/**
 * Send a chat message via IPC to the main process
 * This avoids CORS issues as the API call is made from Node.js
 * Messages are trimmed to maintain max 20 messages (sliding window)
 */
export async function sendChatMessage(
  config: AIConfig,
  modelId: string,
  messages: ChatMessage[],
): Promise<string> {
  // Trim messages to max context size (keeps most recent)
  const trimmedMessages = trimMessagesToContext(messages);

  const request: SendMessageRequest = {
    config,
    modelId,
    messages: trimmedMessages,
  };

  const response: SendMessageResponse = await window.electron.ai.chat(request);

  if (!response.success) {
    throw new Error(response.error || 'Unknown error');
  }

  return response.text || '';
}

export function getProviderDisplayName(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic (Claude)';
    case 'openrouter':
      return 'OpenRouter';
    default:
      return provider;
  }
}

export function getApiKeyForProvider(
  config: AIConfig,
  provider: AIProvider,
): string | undefined {
  switch (provider) {
    case 'openai':
      return config.openAiKey;
    case 'anthropic':
      return config.anthropicKey;
    case 'openrouter':
      return config.openRouterKey;
    default:
      return undefined;
  }
}

export function isProviderConfigured(
  config: AIConfig,
  provider: AIProvider,
): boolean {
  const key = getApiKeyForProvider(config, provider);
  return !!key && key.trim().length > 0;
}

/**
 * Transcribe audio via IPC to the main process (OpenAI Whisper)
 * Whisper is OpenAI-only, so an OpenAI API key is required regardless of the active provider
 */
export async function transcribeAudio(
  config: AIConfig,
  audioData: string,
  fileName: string,
): Promise<string> {
  const request: TranscribeRequest = {
    config,
    audioData,
    fileName,
  };

  const response: TranscribeResponse =
    await window.electron.ai.transcribe(request);

  if (!response.success) {
    throw new Error(response.error || 'Transcription failed');
  }

  return response.text || '';
}
