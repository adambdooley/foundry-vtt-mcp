import { Logger } from '../logger.js';

export interface MCPError {
  type: 'user' | 'system' | 'permission' | 'validation' | 'connection';
  message: string;
  details?: any;
  suggestions?: string[];
  recoverable: boolean;
}

export class ErrorHandler {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'ErrorHandler' });
  }

  /**
   * Map Foundry errors to user-friendly MCP errors
   */
  mapFoundryError(error: any, context: string): MCPError {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorLower = errorMessage.toLowerCase();

    // Permission errors
    if (errorLower.includes('access denied') || errorLower.includes('permission')) {
      return {
        type: 'permission',
        message: 'Permission denied for this operation',
        details: errorMessage,
        suggestions: [
          'Check module settings in Foundry VTT',
          'Ensure you have the required permissions',
          'Ask a GM to enable this feature',
        ],
        recoverable: true,
      };
    }

    // Connection errors
    if (
      errorLower.includes('connection') ||
      errorLower.includes('websocket') ||
      errorLower.includes('timeout')
    ) {
      return {
        type: 'connection',
        message: 'Connection to Foundry VTT failed',
        details: errorMessage,
        suggestions: [
          'Ensure Foundry VTT is running',
          'Check that the MCP Bridge module is enabled',
          'Verify connection settings in module configuration',
        ],
        recoverable: true,
      };
    }

    // Validation errors
    if (
      errorLower.includes('not found') ||
      errorLower.includes('invalid') ||
      errorLower.includes('missing')
    ) {
      if (context.includes('compendium') || context.includes('creature')) {
        return {
          type: 'validation',
          message: 'Creature not found in compendiums',
          details: errorMessage,
          suggestions: [
            'Try searching with a different creature name',
            'Check if the compendium pack is available',
            'Use more specific terms (e.g., "goblin warrior" instead of "goblin")',
          ],
          recoverable: true,
        };
      }

      return {
        type: 'validation',
        message: 'Invalid request or missing data',
        details: errorMessage,
        suggestions: [
          'Check that all required parameters are provided',
          'Verify the data exists in Foundry VTT',
        ],
        recoverable: true,
      };
    }

    // Actor creation specific errors
    if (errorLower.includes('actor creation') || errorLower.includes('create actor')) {
      return {
        type: 'system',
        message: 'Failed to create actor in Foundry VTT',
        details: errorMessage,
        suggestions: [
          'Check that the source compendium entry is valid',
          'Ensure Foundry VTT has sufficient permissions',
          'Try creating actors one at a time instead of in bulk',
        ],
        recoverable: true,
      };
    }

    // Scene/token errors
    if (errorLower.includes('scene') || errorLower.includes('token')) {
      return {
        type: 'system',
        message: 'Failed to modify scene or place tokens',
        details: errorMessage,
        suggestions: [
          'Ensure a scene is currently active',
          'Check scene modification permissions',
          'Try creating actors without adding to scene',
        ],
        recoverable: true,
      };
    }

    // Transaction/rollback errors
    if (errorLower.includes('rollback') || errorLower.includes('transaction')) {
      return {
        type: 'system',
        message: 'Operation was rolled back due to errors',
        details: errorMessage,
        suggestions: [
          'The system prevented partial failures by undoing changes',
          'Try the operation again with different parameters',
          'Check Foundry VTT console for more details',
        ],
        recoverable: true,
      };
    }

    // Generic system errors
    return {
      type: 'system',
      message: 'An unexpected error occurred',
      details: errorMessage,
      suggestions: [
        'Check Foundry VTT console for more details',
        'Try the operation again',
        'Contact support if the issue persists',
      ],
      recoverable: false,
    };
  }

  /**
   * Format error for MCP client response
   */
  formatErrorMessage(mcpError: MCPError, toolName: string): string {
    const typeEmoji = this.getErrorEmoji(mcpError.type);
    const recoveryText = mcpError.recoverable ? '🔄 **This can be fixed**' : '⚠️ **System error**';

    let message = `${typeEmoji} **${mcpError.message}**\n\n${recoveryText}`;

    if (mcpError.suggestions && mcpError.suggestions.length > 0) {
      message += '\n\n**Suggestions:**\n';
      message += mcpError.suggestions.map(suggestion => `• ${suggestion}`).join('\n');
    }

    if (mcpError.type === 'validation' && toolName === 'create-actor-from-compendium') {
      message +=
        '\n\n💡 **Tip:** Try using the `search-compendium` tool first to see what creatures are available.';
    }

    return message;
  }

  /**
   * Log error with appropriate level
   */
  logError(mcpError: MCPError, toolName: string, originalError?: any): void {
    const logData = {
      toolName,
      errorType: mcpError.type,
      message: mcpError.message,
      recoverable: mcpError.recoverable,
      details: mcpError.details,
    };

    switch (mcpError.type) {
      case 'user':
      case 'validation':
        this.logger.warn('User/validation error', logData);
        break;
      case 'permission':
        this.logger.warn('Permission error', logData);
        break;
      case 'connection':
        this.logger.error('Connection error', logData);
        break;
      case 'system':
      default:
        this.logger.error('System error', logData);
        if (originalError) {
          this.logger.error('Original error details', originalError);
        }
        break;
    }
  }

  /**
   * Get emoji for error type
   */
  private getErrorEmoji(type: MCPError['type']): string {
    switch (type) {
      case 'user':
        return '👤';
      case 'validation':
        return '❌';
      case 'permission':
        return '🔒';
      case 'connection':
        return '🔌';
      case 'system':
        return '⚙️';
      default:
        return '❓';
    }
  }

  /**
   * Handle tool execution error with proper formatting
   */
  handleToolError(error: any, toolName: string, context: string = ''): never {
    const mcpError = this.mapFoundryError(error, `${toolName} ${context}`.trim());
    this.logError(mcpError, toolName, error);

    const formattedMessage = this.formatErrorMessage(mcpError, toolName);
    throw new Error(formattedMessage);
  }

  /**
   * Create validation error for missing parameters
   */
  createValidationError(message: string, suggestions: string[] = []): MCPError {
    return {
      type: 'validation',
      message,
      suggestions: [...suggestions, 'Check the tool documentation for required parameters'],
      recoverable: true,
    };
  }

  /**
   * Create permission error with helpful context
   */
  createPermissionError(operation: string, setting?: string): MCPError {
    const suggestions = [
      'Ask a GM to enable this feature in Foundry VTT',
      'Check the MCP Bridge module settings',
    ];

    if (setting) {
      suggestions.unshift(`Enable the "${setting}" setting in the MCP Bridge module`);
    }

    return {
      type: 'permission',
      message: `${operation} is not allowed`,
      suggestions,
      recoverable: true,
    };
  }
}

// Note: ErrorHandler should be instantiated with a proper logger, not exported as singleton
