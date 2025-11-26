/**
 * AI Service for main process - handles API calls to avoid CORS issues
 * Anthropic API does not support CORS, so we must call it from Node.js
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

export interface SendMessageRequest {
  config: AIConfig;
  modelId: string;
  messages: ChatMessage[];
}

export interface SendMessageResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export async function sendChatMessage(
  request: SendMessageRequest,
): Promise<SendMessageResponse> {
  const { config, modelId, messages } = request;

  try {
    switch (config.provider) {
      case 'openai': {
        if (!config.openAiKey) {
          return { success: false, error: 'OpenAI API key is required' };
        }

        const openai = new OpenAI({
          apiKey: config.openAiKey,
        });

        const completion = await openai.chat.completions.create({
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          model: modelId,
        });

        return {
          success: true,
          text: completion.choices[0].message.content || 'No response',
        };
      }

      case 'anthropic': {
        if (!config.anthropicKey) {
          return { success: false, error: 'Anthropic API key is required' };
        }

        const anthropic = new Anthropic({
          apiKey: config.anthropicKey,
        });

        // Separate system message from other messages for Anthropic API
        const systemMessage = messages.find((m) => m.role === 'system');
        const chatMessages = messages
          .filter((m) => m.role !== 'system')
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));

        const response = await anthropic.messages.create({
          model: modelId,
          max_tokens: 4096,
          system: systemMessage?.content,
          messages: chatMessages,
        });

        // Extract text from content blocks
        const textContent = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        return {
          success: true,
          text: textContent || 'No response',
        };
      }

      default:
        return { success: false, error: `Unknown provider: ${config.provider}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

