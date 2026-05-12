import { MODULE_ID } from './constants.js';

export interface TransactionAction {
  type: 'create' | 'update' | 'delete';
  entityType: 'Actor' | 'Token' | 'Scene' | 'Item';
  entityId?: string;
  originalData?: any;
  newData?: any;
  rollbackAction?: () => Promise<void>;
}

export interface Transaction {
  id: string;
  timestamp: Date;
  description: string;
  actions: TransactionAction[];
  completed: boolean;
  rolledBack: boolean;
}

export class TransactionManager {
  private moduleId: string = MODULE_ID;
  private activeTransactions: Map<string, Transaction> = new Map();
  private transactionHistory: Transaction[] = [];

  /**
   * Start a new transaction
   */
  startTransaction(description: string): string {
    const transactionId = foundry.utils.randomID();
    const transaction: Transaction = {
      id: transactionId,
      timestamp: new Date(),
      description,
      actions: [],
      completed: false,
      rolledBack: false,
    };

    this.activeTransactions.set(transactionId, transaction);

    return transactionId;
  }

  /**
   * Add an action to an active transaction
   */
  addAction(transactionId: string, action: TransactionAction): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found or already completed`);
    }

    transaction.actions.push(action);
  }

  /**
   * Commit a transaction (mark as completed)
   */
  commitTransaction(transactionId: string): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    transaction.completed = true;
    this.activeTransactions.delete(transactionId);

    // Add to history (keep last 50 transactions)
    this.transactionHistory.push(transaction);
    if (this.transactionHistory.length > 50) {
      this.transactionHistory.shift();
    }
  }

  /**
   * Rollback a transaction (undo all actions)
   */
  async rollbackTransaction(
    transactionId: string
  ): Promise<{ success: boolean; errors: string[] }> {
    let transaction = this.activeTransactions.get(transactionId);

    // Also check completed transactions for rollback
    if (!transaction) {
      transaction = this.transactionHistory.find(t => t.id === transactionId);
    }

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transaction.rolledBack) {
      throw new Error(`Transaction ${transactionId} has already been rolled back`);
    }

    const errors: string[] = [];

    // Rollback actions in reverse order
    for (let i = transaction.actions.length - 1; i >= 0; i--) {
      const action = transaction.actions[i];

      try {
        await this.rollbackAction(action);
      } catch (error) {
        const errorMsg = `Failed to rollback action ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[${this.moduleId}]`, errorMsg);
      }
    }

    transaction.rolledBack = true;

    // Remove from active transactions if it was there
    this.activeTransactions.delete(transactionId);

    const success = errors.length === 0;

    return { success, errors };
  }

  /**
   * Rollback a specific action
   */
  private async rollbackAction(action: TransactionAction): Promise<void> {
    switch (action.type) {
      case 'create':
        await this.rollbackCreate(action);
        break;
      case 'update':
        await this.rollbackUpdate(action);
        break;
      case 'delete':
        await this.rollbackDelete(action);
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Rollback a create action (delete the created entity)
   */
  private async rollbackCreate(action: TransactionAction): Promise<void> {
    if (!action.entityId) {
      throw new Error('Cannot rollback create action: missing entityId');
    }

    switch (action.entityType) {
      case 'Actor':
        const actor = game.actors.get(action.entityId);
        if (actor) {
          await actor.delete();
        }
        break;

      case 'Token':
        // Find token in current scene
        const scene = (game.scenes as any).current;
        if (scene) {
          const token = scene.tokens.get(action.entityId);
          if (token) {
            await token.delete();
          }
        }
        break;

      default:
        throw new Error(`Rollback not implemented for entity type: ${action.entityType}`);
    }
  }

  /**
   * Rollback an update action (restore original data)
   */
  private async rollbackUpdate(action: TransactionAction): Promise<void> {
    if (!action.entityId || !action.originalData) {
      throw new Error('Cannot rollback update action: missing entityId or originalData');
    }

    switch (action.entityType) {
      case 'Actor':
        const actor = game.actors.get(action.entityId);
        if (actor) {
          await actor.update(action.originalData);
        }
        break;

      default:
        throw new Error(`Rollback not implemented for entity type: ${action.entityType}`);
    }
  }

  /**
   * Rollback a delete action (recreate the entity)
   */
  private async rollbackDelete(action: TransactionAction): Promise<void> {
    if (!action.originalData) {
      throw new Error('Cannot rollback delete action: missing originalData');
    }

    switch (action.entityType) {
      case 'Actor':
        await Actor.create(action.originalData);
        break;

      default:
        throw new Error(`Rollback not implemented for entity type: ${action.entityType}`);
    }
  }

  /**
   * Get active transactions
   */
  getActiveTransactions(): Transaction[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): Transaction[] {
    return [...this.transactionHistory];
  }

  /**
   * Clear old transactions from history
   */
  clearHistory(): void {
    this.transactionHistory = [];
  }

  /**
   * Cancel an active transaction without rollback (use for cleanup)
   */
  cancelTransaction(transactionId: string): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Create rollback action for actor creation
   */
  createActorCreationAction(actorId: string): TransactionAction {
    return {
      type: 'create',
      entityType: 'Actor',
      entityId: actorId,
    };
  }

  /**
   * Create rollback action for token creation
   */
  createTokenCreationAction(tokenId: string): TransactionAction {
    return {
      type: 'create',
      entityType: 'Token',
      entityId: tokenId,
    };
  }
}

// Export singleton instance
export const transactionManager = new TransactionManager();
