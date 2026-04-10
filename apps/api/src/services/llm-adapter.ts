/**
 * LLM Adapter — single module responsible for all LLM communication.
 *
 * Supports OpenAI (primary) and Anthropic (fallback). The provider is
 * selected based on which API key is configured:
 *   1. OPENAI_API_KEY set → use OpenAI
 *   2. ANTHROPIC_API_KEY set → use Anthropic
 *   3. Neither → return null (caller uses deterministic fallback)
 *
 * All provider-specific logic is contained here. The rest of the app
 * calls llmComplete() and gets back a string — no provider leakage.
 */

import { config } from '../config.js';
import { logger } from '../logger.js';

// ─── Types ─────────────────────────────────────────────────

export interface LlmRequest {
  /** System prompt — sets the role and constraints */
  system: string;
  /** User message — the actual query or payload */
  user: string;
  /** Max tokens in the response */
  maxTokens?: number;
  /** Optional label for logging */
  label?: string;
}

export interface LlmResponse {
  /** The raw text response from the model */
  text: string;
  /** Which provider was used */
  provider: 'openai' | 'anthropic';
  /** Model identifier */
  model: string;
}

type Provider = 'openai' | 'anthropic' | null;

// ─── Provider Detection ────────────────────────────────────

function detectProvider(): Provider {
  if (config.OPENAI_API_KEY) return 'openai';
  if (config.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

// ─── Main Entry Point ──────────────────────────────────────

/**
 * Send a completion request to the configured LLM provider.
 * Returns null if no provider is configured (caller should use
 * its deterministic fallback).
 */
export async function llmComplete(request: LlmRequest): Promise<LlmResponse | null> {
  const provider = detectProvider();
  const label = request.label ?? 'llm';

  if (!provider) {
    logger.info({ label }, 'No LLM API key configured — skipping LLM call');
    return null;
  }

  logger.info({ label, provider, maxTokens: request.maxTokens ?? 600 }, 'LLM request');

  try {
    if (provider === 'openai') {
      return await callOpenAI(request);
    }
    return await callAnthropic(request);
  } catch (err) {
    logger.error({ err, label, provider }, 'LLM call failed');
    return null;
  }
}

/**
 * Convenience: call LLM and parse a JSON object from the response.
 * Returns null if the LLM is unavailable or the response isn't valid JSON.
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

// ─── OpenAI Provider ───────────────────────────────────────

async function callOpenAI(request: LlmRequest): Promise<LlmResponse> {
  // Dynamic import to avoid loading the SDK when not needed
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

  logger.info(
    { provider: 'openai', model, tokens: response.usage?.total_tokens },
    'OpenAI response received',
  );

  return { text, provider: 'openai', model };
}

// ─── Anthropic Provider ────────────────────────────────────

async function callAnthropic(request: LlmRequest): Promise<LlmResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  const model = 'claude-sonnet-4-20250514';
  const response = await client.messages.create({
    model,
    max_tokens: request.maxTokens ?? 600,
    system: request.system,
    messages: [{ role: 'user', content: request.user }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

  logger.info(
    { provider: 'anthropic', model },
    'Anthropic response received',
  );

  return { text, provider: 'anthropic', model };
}
