import { MODULE_ID } from './constants.js';

export const PERMISSION_LEVELS = {
  LOW_RISK: 'low', // Auto-allowed
  MEDIUM_RISK: 'medium', // Confirmation required
  HIGH_RISK: 'high', // Explicit permission + safeguards
} as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[keyof typeof PERMISSION_LEVELS];

export interface WriteOperation {
  name: string;
  level: PermissionLevel;
  description: string;
  settingKey: string;
  requiresGM?: boolean;
}

export interface PermissionCheck {
  allowed: boolean;
  reason?: string | undefined;
  requiresConfirmation?: boolean | undefined;
  warnings?: string[] | undefined;
}

export class PermissionManager {
  private moduleId: string = MODULE_ID;

  // Define all write operations and their risk levels
  private writeOperations: Record<string, WriteOperation> = {
    createActor: {
      name: 'Create Actor',
      level: PERMISSION_LEVELS.LOW_RISK,
      description: 'Create new actors from compendium entries',
      settingKey: 'allowWriteOperations',
      requiresGM: false,
    },
    modifyScene: {
      name: 'Modify Scene',
      level: PERMISSION_LEVELS.MEDIUM_RISK,
      description: 'Add tokens to scenes or modify scene elements',
      settingKey: 'allowWriteOperations',
      requiresGM: false,
    },
    bulkOperations: {
      name: 'Bulk Operations',
      level: PERMISSION_LEVELS.MEDIUM_RISK,
      description: 'Perform operations on multiple entities at once',
      settingKey: 'allowWriteOperations',
      requiresGM: false,
    },
    deleteData: {
      name: 'Delete Data',
      level: PERMISSION_LEVELS.HIGH_RISK,
      description: 'Delete actors, scenes, or other world data',
      settingKey: 'allowWriteOperations',
      requiresGM: true,
    },
    modifyWorld: {
      name: 'Modify World',
      level: PERMISSION_LEVELS.HIGH_RISK,
      description: 'Modify world settings or structure',
      settingKey: 'allowWriteOperations',
      requiresGM: true,
    },
  };

  /**
   * Check if a write operation is allowed (GM-focused safety checks)
   */
  checkWritePermission(
    operationName: string,
    context?: { quantity?: number; targetIds?: string[] }
  ): PermissionCheck {
    const operation = this.writeOperations[operationName];
    if (!operation) {
      return {
        allowed: false,
        reason: `Unknown operation: ${operationName}`,
      };
    }

    // Check setting-based permissions (GM safety toggles)
    const settingAllowed = game.settings.get(this.moduleId, operation.settingKey) as boolean;
    if (!settingAllowed) {
      return {
        allowed: false,
        reason: `${operation.name} is disabled in module settings`,
      };
    }

    return this.checkOperationSpecifics(operation, context);
  }

  /**
   * Check operation-specific rules and limits
   */
  private checkOperationSpecifics(
    operation: WriteOperation,
    context?: { quantity?: number; targetIds?: string[] }
  ): PermissionCheck {
    const warnings: string[] = [];
    let requiresConfirmation = false;

    // Check bulk operation limits
    if (context?.quantity && context.quantity > 1) {
      const maxActors = game.settings.get(this.moduleId, 'maxActorsPerRequest') as number;
      if (context.quantity > maxActors) {
        return {
          allowed: false,
          reason: `Quantity ${context.quantity} exceeds maximum allowed ${maxActors}`,
        };
      }

      // Bulk operations always require confirmation for quantities > 3 as a safety measure
      if (context.quantity > 3) {
        requiresConfirmation = true;
        warnings.push(`This will create ${context.quantity} actors`);
      }
    }

    // Medium risk operations may require confirmation based on settings
    if (operation.level === PERMISSION_LEVELS.MEDIUM_RISK) {
      requiresConfirmation = true;
      warnings.push(`This is a ${operation.level} risk operation: ${operation.description}`);
    }

    // High risk operations always require confirmation
    if (operation.level === PERMISSION_LEVELS.HIGH_RISK) {
      requiresConfirmation = true;
      warnings.push(`⚠️ HIGH RISK: ${operation.description}`);
    }

    return {
      allowed: true,
      ...(requiresConfirmation ? { requiresConfirmation } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  /**
   * Validate and sanitize operation parameters
   */
  validateOperationParameters(
    operationName: string,
    parameters: any
  ): { valid: boolean; errors: string[]; sanitized?: any } {
    const errors: string[] = [];
    let sanitized = { ...parameters };

    switch (operationName) {
      case 'createActor':
        if (!sanitized.creatureType || typeof sanitized.creatureType !== 'string') {
          errors.push('creatureType is required and must be a string');
        }

        if (sanitized.quantity) {
          const quantity = parseInt(sanitized.quantity);
          if (isNaN(quantity) || quantity < 1 || quantity > 10) {
            errors.push('quantity must be a number between 1 and 10');
          } else {
            sanitized.quantity = quantity;
          }
        }

        if (sanitized.customNames && !Array.isArray(sanitized.customNames)) {
          errors.push('customNames must be an array of strings');
        }
        break;

      case 'modifyScene':
        if (
          !sanitized.actorIds ||
          !Array.isArray(sanitized.actorIds) ||
          sanitized.actorIds.length === 0
        ) {
          errors.push('actorIds must be a non-empty array');
        }

        if (sanitized.placement && !['random', 'grid', 'center'].includes(sanitized.placement)) {
          errors.push('placement must be one of: random, grid, center');
        }
        break;

      default:
        // Generic validation for unknown operations
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: errors.length === 0 ? sanitized : undefined,
    };
  }

  /**
   * Get all available write operations and their current permission status
   */
  getOperationStatus(): Record<
    string,
    { operation: WriteOperation; allowed: boolean; reason?: string }
  > {
    const status: Record<string, any> = {};

    for (const [key, operation] of Object.entries(this.writeOperations)) {
      const check = this.checkWritePermission(key);
      status[key] = {
        operation,
        allowed: check.allowed,
        reason: check.reason,
      };
    }

    return status;
  }

  /**
   * Create a permission summary for debugging
   */
  getPermissionSummary(): {
    user: { name: string; isGM: boolean };
    settings: Record<string, boolean>;
    operations: Record<string, boolean>;
  } {
    const settingKeys = Object.values(this.writeOperations).map(op => op.settingKey);
    const settings: Record<string, boolean> = {};

    for (const key of settingKeys) {
      settings[key] = game.settings.get(this.moduleId, key) as boolean;
    }

    const operations: Record<string, boolean> = {};
    for (const [key] of Object.entries(this.writeOperations)) {
      operations[key] = this.checkWritePermission(key).allowed;
    }

    return {
      user: {
        name: game.user?.name || 'Unknown',
        isGM: game.user?.isGM || false,
      },
      settings,
      operations,
    };
  }

  /**
   * Log permission check for audit purposes
   */
  auditPermissionCheck(_operationName: string, _result: PermissionCheck, _parameters?: any): void {
    // Permission audit logging removed for production release
    // Previously logged permission checks for security auditing
  }
}

// Export singleton instance
export const permissionManager = new PermissionManager();
