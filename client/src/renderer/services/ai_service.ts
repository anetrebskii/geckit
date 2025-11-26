/**
 * AI Service for renderer process
 * Uses IPC to communicate with main process to avoid CORS issues
 * (Anthropic API does not support browser CORS)
 */

export type AIProvider = 'openai' | 'anthropic';

export interface AIConfig {
  provider: AIProvider;
  openAiKey?: string;
  anthropicKey?: string;
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

// Anthropic (Claude) models
export const ANTHROPIC_MODELS = [
  // Claude 4.5 series (Latest - 2025)
  'claude-opus-4-5-20251124',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251015',
  // Claude 3.5 series (2024)
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  // Claude 3 series (Legacy)
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

export function getModelsForProvider(provider: AIProvider): string[] {
  switch (provider) {
    case 'openai':
      return OPENAI_MODELS;
    case 'anthropic':
      return ANTHROPIC_MODELS;
    default:
      return OPENAI_MODELS;
  }
}

export function getDefaultModelForProvider(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-sonnet-4-5-20250929';
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
