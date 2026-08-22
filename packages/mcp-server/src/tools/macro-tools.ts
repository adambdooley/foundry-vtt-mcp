import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface MacroToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * Foundry Macro DOCUMENT management behind a single manage-macros action switch.
 *
 * SECURITY: the MCP never executes macro code. "create" stores a Macro document
 * for a human to click; a script macro's JavaScript runs solely on a human
 * hotbar click.
 */
export class MacroTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: MacroToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'MacroTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-macros',
        description:
          'Create, list, or delete Foundry Macro documents (clickable hotbar buttons).\n' +
          '- "create": Store a macro. A "chat" macro sends its command as chat/roll text when\n' +
          '  clicked; a "script" macro\'s JavaScript executes SOLELY when a human clicks it.\n' +
          '  This tool never runs macro code. Optionally assign a hotbar slot (1 to 50).\n' +
          '- "list": List macros with ID, name, type, and a command preview, optionally filtered\n' +
          '  by a case-insensitive name substring (read-only).\n' +
          '- "delete": Delete a macro by ID or exact name. Use "list" first if unsure of the ID.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'list', 'delete'],
              description: 'Operation to perform.',
            },
            // ── create ──────────────────────────────────────────────────────
            name: {
              type: 'string',
              description:
                'Required for "create". Display name of the macro (also its hotbar label).',
            },
            type: {
              type: 'string',
              enum: ['chat', 'script'],
              description:
                'For "create": "chat" sends its command as chat/roll text on click; "script" runs its JavaScript only when a human clicks it (default: chat).',
            },
            command: {
              type: 'string',
              description:
                'Required for "create". For a chat macro, the text or roll a click will send (e.g. "/roll 2d6+3"). For a script macro, the JavaScript that runs ONLY on a human click.',
            },
            img: {
              type: 'string',
              description: 'For "create": icon image path for the macro.',
            },
            hotbarSlot: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'For "create": hotbar slot (1 to 50) on the current user\'s hotbar.',
            },
            // ── list ────────────────────────────────────────────────────────
            search: {
              type: 'string',
              description: 'For "list": case-insensitive substring to match against macro names.',
            },
            // ── delete ──────────────────────────────────────────────────────
            macro: {
              type: 'string',
              description:
                'Required for "delete". Macro ID or name. Name match is case-insensitive; pass the ID if several macros share a name.',
            },
          },
          required: ['action'],
        },
      },
    ];
  }

  async handleManageMacros(args: any) {
    const { action } = z.object({ action: z.enum(['create', 'list', 'delete']) }).parse(args ?? {});

    switch (action) {
      case 'create':
        return this.query(
          'create-macro',
          z.object({
            name: z.string().min(1),
            type: z.enum(['chat', 'script']).default('chat'),
            command: z.string().min(1),
            img: z.string().min(1).optional(),
            hotbarSlot: z.number().int().min(1).max(50).optional(),
          }),
          args
        );
      case 'list':
        return this.query('list-macros', z.object({ search: z.string().min(1).optional() }), args);
      case 'delete':
        return this.query('delete-macro', z.object({ macro: z.string().min(1) }), args);
    }
  }

  /** Parse args against the action's schema, then forward only those fields to the bridge. */
  private async query(method: string, schema: z.ZodTypeAny, args: unknown) {
    const parsed = schema.parse(args ?? {});
    this.logger.info(`Macro action: ${method}`);
    try {
      return await this.foundryClient.query(`foundry-mcp-bridge.${method}`, parsed);
    } catch (error) {
      this.logger.error(`Failed: ${method}`, error);
      throw new Error(
        `Failed to ${method.replace(/-/g, ' ')}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
