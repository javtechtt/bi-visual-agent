/**
 * LLM Adapter — single module responsible for all LLM communication.
 *
 * Uses OpenAI exclusively (gpt-4o for text completions).
 * Returns null when OPENAI_API_KEY is not configured — callers
 * fall back to their deterministic logic.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';

// ─── Types ─────────────────────────────────────────────────

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens?: number;
  label?: string;
}

export interface LlmResponse {
  text: string;
  provider: 'openai';
  model: string;
}

// ─── Main Entry Point ──────────────────────────────────────

export async function llmComplete(request: LlmRequest): Promise<LlmResponse | null> {
  if (!config.OPENAI_API_KEY) {
    logger.info({ label: request.label ?? 'llm' }, 'No OPENAI_API_KEY — skipping LLM call');
    return null;
  }

  const label = request.label ?? 'llm';
  logger.info({ label, maxTokens: request.maxTokens ?? 600 }, 'LLM request');

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

    const model = 'gpt-4o';
    const response = await client.chat.completions.create({
      model,
      max_tokens: request.maxTokens ?? 600,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    logger.info({ label, model, tokens: response.usage?.total_tokens }, 'OpenAI response received');

    return { text, provider: 'openai', model };
  } catch (err) {
    logger.error({ err, label }, 'LLM call failed');
    return null;
  }
}

/**
 * Call LLM and parse a JSON object from the response.
 * Returns null if unavailable or response isn't valid JSON.
 */
export async function llmCompleteJSON<T>(request: LlmRequest): Promise<{ data: T; provider: string; model: string } | null> {
  const response = await llmComplete(request);
  if (!response) return null;

  const jsonMatch = response.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn({ label: request.label }, 'LLM response contained no JSON');
    return null;
  }

  try {
    const data = JSON.parse(jsonMatch[0]) as T;
    return { data, provider: response.provider, model: response.model };
  } catch {
    logger.warn({ label: request.label, raw: jsonMatch[0].slice(0, 200) }, 'LLM response JSON parse failed');
    return null;
  }
}
