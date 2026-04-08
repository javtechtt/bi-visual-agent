import type { AgentContext, AgentRoleType } from '@bi/types';
import { ANALYTICS_AGENT_SYSTEM_PROMPT } from '@bi/prompts';
import { config } from '../config.js';
import { logger } from '../logger.js';

class AnalyticsAgent {
  readonly role: AgentRoleType = 'analytics';

  async execute(task: string, context: AgentContext): Promise<Record<string, unknown>> {
    logger.info({ sessionId: context.sessionId, task }, 'Analytics agent executing');

    // TODO: integrate with LLM using ANALYTICS_AGENT_SYSTEM_PROMPT
    // TODO: delegate heavy computation to Python analytics service
    void ANALYTICS_AGENT_SYSTEM_PROMPT;

    return {
      agent: this.role,
      sessionId: context.sessionId,
      task,
      status: 'completed',
      result: {
        message: 'Analytics agent processing — LLM integration pending',
        analyticsServiceUrl: config.ANALYTICS_SERVICE_URL,
      },
      completedAt: new Date().toISOString(),
    };
  }

  async callAnalyticsService(
    endpoint: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(`${config.ANALYTICS_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Analytics service error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

export const analyticsAgent = new AnalyticsAgent();
