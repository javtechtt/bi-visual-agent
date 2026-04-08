import { z } from 'zod';

// ─── Tool Definition Framework ──────────────────────────────

export interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  name: string;
  description: string;
  category: 'data' | 'analytics' | 'advisory' | 'system';
  inputSchema: TInput;
  outputSchema: TOutput;
}

export function defineTool<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
  config: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return config;
}

// ─── Tool Registry ──────────────────────────────────────────

const registry = new Map<string, ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>>();

export function registerTool(tool: ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool "${tool.name}" is already registered`);
  }
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition<z.ZodTypeAny, z.ZodTypeAny> | undefined {
  return registry.get(name);
}

export function getToolsByCategory(
  category: ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>['category'],
): ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>[] {
  return Array.from(registry.values()).filter((t) => t.category === category);
}

export function getAllTools(): ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>[] {
  return Array.from(registry.values());
}
