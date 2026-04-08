import type { AgentContext, AgentRoleType } from '@bi/types';
import { ADVISORY_AGENT_SYSTEM_PROMPT } from '@bi/prompts';
import { logger } from '../logger.js';

class AdvisoryAgent {
  readonly role: AgentRoleType = 'advisory';

  async execute(task: string, context: AgentContext): Promise<Record<string, unknown>> {
    logger.info({ sessionId: context.sessionId, task }, 'Advisory agent executing');

    // TODO: integrate with LLM using ADVISORY_AGENT_SYSTEM_PROMPT
    void ADVISORY_AGENT_SYSTEM_PROMPT;

    return {
      agent: this.role,
      sessionId: context.sessionId,
      task,
      status: 'completed',
      result: {
        message: 'Advisory agent processing — LLM integration pending',
      },
      completedAt: new Date().toISOString(),
    };
  }
}

export const advisoryAgent = new AdvisoryAgent();
