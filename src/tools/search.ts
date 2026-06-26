import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../utils/config.js';
import { Orchestrator } from '../search/orchestrator.js';
import { IntentClassifier } from '../search/intent-classifier.js';
import { logger } from '../utils/logger.js';

const AgentSearchSchema = config.INTENT_CLASSIFICATION_ENABLED
  ? z.object({
      query: z.string().min(1, 'Query cannot be empty'),
      freshness: z.enum(['any', 'day', 'week', 'month']).default('any'),
      include_content: z.boolean().default(false),
    })
  : z.object({
      query: z.string().min(1, 'Query cannot be empty'),
      intent: z.enum(['web', 'docs', 'github', 'news']).default('web'),
      freshness: z.enum(['any', 'day', 'week', 'month']).default('any'),
      include_content: z.boolean().default(false),
    });

export function registerSearchTool(server: McpServer, orchestrator: Orchestrator, classifier: IntentClassifier): void {
  server.registerTool(
    'search',
    {
      description: 'Search the web for documentation, code examples, and other resources',
      inputSchema: AgentSearchSchema,
    },
    async (args) => {
      try {
        const parsed = AgentSearchSchema.parse(args);
        const intent: 'web' | 'docs' | 'github' | 'news' = config.INTENT_CLASSIFICATION_ENABLED
          ? await classifier.classify(parsed.query)
          : (parsed as typeof parsed & { intent: 'web' | 'docs' | 'github' | 'news' }).intent;

        logger.info({ query: parsed.query, intent, classification: config.INTENT_CLASSIFICATION_ENABLED }, 'Search requested');

        const response = await orchestrator.search({
          query: parsed.query,
          intent,
          freshness: parsed.freshness,
          include_content: parsed.include_content,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        logger.error({ err }, 'Search tool error');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
