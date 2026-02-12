/**
 * AI Service for main process - handles API calls to avoid CORS issues
 * Anthropic API does not support CORS, so we must call it from Node.js
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

export interface TranscribeRequest {
  config: AIConfig;
  audioData: string; // base64-encoded audio
  fileName: string;
}

export interface TranscribeResponse {
  success: boolean;
  text?: string;
  error?: string;
}

export async function transcribeAudio(
  request: TranscribeRequest,
): Promise<TranscribeResponse> {
  const { config, audioData, fileName } = request;

  try {
    if (!config.openAiKey) {
      return {
        success: false,
        error:
          'OpenAI API key is required for transcription (Whisper is OpenAI-only)',
      };
    }

    const openai = new OpenAI({
      apiKey: config.openAiKey,
    });

    const buffer = Buffer.from(audioData, 'base64');
    const tempPath = path.join(os.tmpdir(), `geckit-${Date.now()}-${fileName}`);
    fs.writeFileSync(tempPath, buffer);

    try {
      const fileStream = fs.createReadStream(tempPath);
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: fileStream,
      });

      return {
        success: true,
        text: transcription.text,
      };
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
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

      case 'openrouter': {
        if (!config.openRouterKey) {
          return { success: false, error: 'OpenRouter API key is required' };
        }

        const openrouter = new OpenAI({
          apiKey: config.openRouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
        });

        const orCompletion = await openrouter.chat.completions.create({
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          model: modelId,
        });

        return {
          success: true,
          text: orCompletion.choices[0].message.content || 'No response',
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
          .filter(
            (block): block is Anthropic.TextBlock => block.type === 'text',
          )
          .map((block) => block.text)
          .join('');

        return {
          success: true,
          text: textContent || 'No response',
        };
      }

      default:
        return {
          success: false,
          error: `Unknown provider: ${config.provider}`,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
