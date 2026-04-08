import type { OrchestratorRequest, RoutingDecision, AgentContext } from '@bi/types';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '@bi/prompts';
import { dataAgent } from './data-agent.js';
import { analyticsAgent } from './analytics-agent.js';
import { advisoryAgent } from './advisory-agent.js';
import { logger } from '../logger.js';

class Orchestrator {
  async handle(request: OrchestratorRequest): Promise<Record<string, unknown>> {
    const context: AgentContext = {
      sessionId: request.sessionId,
      userId: 'system', // TODO: extract from auth
      traceId: crypto.randomUUID(),
      startedAt: new Date(),
    };

    logger.info({ sessionId: request.sessionId, query: request.query }, 'Orchestrator received query');

    const routing = await this.route(request);

    logger.info({ routing }, 'Routing decision');

    const results: Record<string, unknown>[] = [];

    for (const subtask of routing.subtasks) {
      const agent = this.resolveAgent(subtask.agent);
      if (agent) {
        const result = await agent.execute(subtask.task, context);
        results.push(result);
      }
    }

    return {
      sessionId: request.sessionId,
      routing,
      results,
      completedAt: new Date().toISOString(),
    };
  }

  private async route(request: OrchestratorRequest): Promise<RoutingDecision> {
    // TODO: call LLM with ORCHESTRATOR_SYSTEM_PROMPT to determine routing
    // For now, return a default routing to data agent
    void ORCHESTRATOR_SYSTEM_PROMPT;

    return {
      targetAgent: 'data',
      reasoning: 'Default routing — LLM integration pending',
      subtasks: [
        {
          agent: 'data',
          task: request.query,
          priority: 1,
        },
      ],
    };
  }

  private resolveAgent(role: string) {
    switch (role) {
      case 'data':
        return dataAgent;
      case 'analytics':
        return analyticsAgent;
      case 'advisory':
        return advisoryAgent;
      default:
        logger.warn({ role }, 'Unknown agent role');
        return null;
    }
  }
}

export const orchestrator = new Orchestrator();
