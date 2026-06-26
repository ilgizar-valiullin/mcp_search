import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Orchestrator } from '../search/orchestrator.js';
import { IntentClassifier } from '../search/intent-classifier.js';
import { logger } from '../utils/logger.js';

const SearchRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
});

export function registerSearchTool(server: McpServer, orchestrator: Orchestrator, classifier: IntentClassifier): void {
  server.registerTool(
    'search',
    {
      description: 'Search the web for documentation, code examples, and other resources',
      inputSchema: SearchRequestSchema,
    },
    async (args) => {
      try {
        const parsed = SearchRequestSchema.parse(args);
        const classification = await classifier.classify(parsed.query);
        const intent = classification.intent;

        logger.info({ query: parsed.query, intent }, 'Search requested');

        const response = await orchestrator.search({
          query: parsed.query,
          intent,
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
