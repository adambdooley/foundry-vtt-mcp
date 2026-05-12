/**
 * Mac Setup Tools - Check status and run ComfyUI auto-installer
 */

import { Logger } from '../logger.js';
import { isMac } from '../utils/platform.js';
import { MacInstaller, SetupProgress } from '../setup/mac-installer.js';

export class MacSetupTools {
  private logger: Logger;
  private installer: MacInstaller;
  private setupInProgress: boolean = false;
  private lastProgress?: SetupProgress;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'MacSetupTools' });
    this.installer = new MacInstaller(logger);

    // Set up progress callback
    this.installer.setProgressCallback(progress => {
      this.lastProgress = progress;
      this.logger.info('Setup progress update', progress);
    });
  }

  getTools() {
    return [
      {
        name: 'check-mac-setup-status',
        description:
          'Check if ComfyUI and AI models are installed on Mac (Apple Silicon only). Returns installation status and whether system can run AI map generation.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'run-mac-setup',
        description:
          'Auto-install ComfyUI Desktop and SDXL model on Mac (Apple Silicon only). Downloads ~2.7GB total. Use this when user wants to enable AI map generation on Mac.',
        inputSchema: {
          type: 'object',
          properties: {
            skip_comfyui: {
              type: 'boolean',
              description: 'Skip ComfyUI installation (if already installed manually)',
            },
            skip_model: {
              type: 'boolean',
              description: 'Skip model download (if already downloaded)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get-mac-setup-progress',
        description:
          'Get current progress of Mac setup (if running). Shows download progress, installation stage, and any errors.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  async handleToolCall(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'check-mac-setup-status':
        return await this.checkSetupStatus();

      case 'run-mac-setup':
        return await this.runSetup(args);

      case 'get-mac-setup-progress':
        return await this.getSetupProgress();

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private async checkSetupStatus(): Promise<any> {
    if (!isMac()) {
      return {
        platform: process.platform,
        message: 'Mac-specific setup tools are only available on macOS',
      };
    }

    const status = this.installer.getSetupStatus();

    return {
      platform: 'darwin',
      arch: process.arch,
      canRun: status.canRun,
      reason: status.reason,
      comfyUIInstalled: status.comfyUIInstalled,
      modelsInstalled: status.modelsInstalled,
      foundryDetected: status.foundryDetected,
      ready: status.ready,
      message: status.ready ? 'AI map generation is ready' : status.reason || 'Setup required',
    };
  }

  private async runSetup(args: any): Promise<any> {
    if (!isMac()) {
      throw new Error('Mac setup is only available on macOS');
    }

    if (this.setupInProgress) {
      return {
        error: 'Setup already in progress',
        progress: this.lastProgress,
      };
    }

    const { canRun, reason } = this.installer.canRunComfyUI();
    if (!canRun) {
      throw new Error(reason);
    }

    this.setupInProgress = true;

    try {
      await this.installer.runSetup({
        skipComfyUI: args.skip_comfyui === true,
        skipModels: args.skip_models === true,
        skipFoundryModule: args.skip_foundry_module === true,
      });

      return {
        success: true,
        message: 'Setup completed successfully',
        status: this.installer.getSetupStatus(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Setup failed', { error: message });

      return {
        success: false,
        error: message,
        progress: this.lastProgress,
      };
    } finally {
      this.setupInProgress = false;
    }
  }

  private async getSetupProgress(): Promise<any> {
    if (!isMac()) {
      throw new Error('Mac setup is only available on macOS');
    }

    return {
      inProgress: this.setupInProgress,
      progress: this.lastProgress || {
        stage: 'idle',
        progress: 0,
        message: 'No setup in progress',
      },
    };
  }
}
