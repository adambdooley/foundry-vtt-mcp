import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface EffectManagementToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const manageEffectsSchema = z
  .object({
    action: z.enum(['create', 'update', 'delete']),
    actorIdentifier: z.string().min(1),
    parentType: z.enum(['actor', 'item']),
    parentItemIdentifier: z.string().min(1).optional(),
    effectId: z.string().min(1).optional(),
    effectData: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasParentItemIdentifier = Object.prototype.hasOwnProperty.call(
      data,
      'parentItemIdentifier'
    );
    const hasEffectId = Object.prototype.hasOwnProperty.call(data, 'effectId');
    const hasEffectData = Object.prototype.hasOwnProperty.call(data, 'effectData');

    if (data.parentType === 'item' && !data.parentItemIdentifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentItemIdentifier'],
        message: 'parentItemIdentifier is required when parentType is "item"',
      });
    }
    if (data.parentType === 'actor' && hasParentItemIdentifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentItemIdentifier'],
        message: 'parentItemIdentifier is only supported when parentType is "item"',
      });
    }

    if (data.action === 'create') {
      if (hasEffectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectId'],
          message: 'effectId is not supported for create',
        });
      }
      if (!data.effectData) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectData'],
          message: 'effectData is required for create',
        });
      } else if (
        typeof data.effectData.name !== 'string' ||
        data.effectData.name.trim().length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectData', 'name'],
          message: 'effectData.name is required for create and must be a non-empty string',
        });
      }
    }

    if (data.action === 'update') {
      if (!data.effectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectId'],
          message: 'effectId is required for update',
        });
      }
      if (!data.effectData || Object.keys(data.effectData).length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectData'],
          message: 'effectData is required for update and must contain at least one field',
        });
      } else if (data.effectId) {
        for (const idField of ['_id', 'id'] as const) {
          if (
            Object.prototype.hasOwnProperty.call(data.effectData, idField) &&
            data.effectData[idField] !== data.effectId
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['effectData', idField],
              message: `effectData.${idField} must match effectId when provided`,
            });
          }
        }
      }
    }

    if (data.action === 'delete') {
      if (!data.effectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectId'],
          message: 'effectId is required for delete',
        });
      }
      if (hasEffectData) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectData'],
          message: 'effectData is not supported for delete',
        });
      }
    }
  });

export class EffectManagementTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: EffectManagementToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'EffectManagementTools' });
  }

  getToolDefinitions() {
    return [
      {
        name: 'manage-effects',
        description:
          'Create, update, or delete an ActiveEffect on an Actor or on an embedded Item owned by that Actor. Effect payloads are generic Foundry ActiveEffect document data. Use parentType "item" with parentItemIdentifier for Item-owned effects.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update', 'delete'],
              description: 'ActiveEffect operation to perform.',
            },
            actorIdentifier: {
              type: 'string',
              description: 'Actor ID or exact case-insensitive Actor name.',
            },
            parentType: {
              type: 'string',
              enum: ['actor', 'item'],
              description: 'Whether the ActiveEffect belongs to the Actor or an embedded Item.',
            },
            parentItemIdentifier: {
              type: 'string',
              description:
                'Required only for parentType "item". Embedded Item ID or exact case-insensitive name.',
            },
            effectId: {
              type: 'string',
              description: 'Required for update and delete. The ActiveEffect document ID.',
            },
            effectData: {
              type: 'object',
              additionalProperties: true,
              description:
                'Generic ActiveEffect document fields. Required for create and update; create requires a non-empty name.',
            },
          },
          required: ['action', 'actorIdentifier', 'parentType'],
          additionalProperties: false,
        },
      },
    ];
  }

  async handleManageEffects(args: unknown): Promise<any> {
    const parsed = manageEffectsSchema.safeParse(args);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      return { success: false, error: `Invalid arguments: ${detail}` };
    }

    this.logger.info('Managing ActiveEffect', {
      action: parsed.data.action,
      actorIdentifier: parsed.data.actorIdentifier,
      parentType: parsed.data.parentType,
    });

    try {
      return await this.foundryClient.query('foundry-mcp-bridge.manageEffects', parsed.data);
    } catch (error) {
      this.logger.error('Failed to manage ActiveEffect', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
