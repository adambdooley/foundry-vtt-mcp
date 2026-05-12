import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface MapGenerationToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  backendComfyUIHandlers?: any; // Access to backend ComfyUI service
}

interface JobData {
  id: string;
  status: 'queued' | 'generating' | 'processing' | 'complete' | 'failed' | 'expired';
  created_at: number;
  started_at?: number;
  completed_at?: number;
  progress_percent: number;
  current_stage: string;
  result?: any;
  error?: string;
  attempts: number;
  max_attempts: number;
  params: {
    prompt: string;
    scene_name: string;
    size: string;
    grid_size: number;
  };
}

export class MapGenerationTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private backendComfyUIHandlers: any;
  private jobs = new Map<string, JobData>(); // Simple in-memory job storage
  private jobStartTimes = new Map<string, number>();
  private lastStatusCheck = new Map<string, number>();
  private jobIdCounter = 0;

  constructor(options: MapGenerationToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'MapGenerationTools' });
    this.backendComfyUIHandlers = options.backendComfyUIHandlers;
  }

  getToolDefinitions(): Tool[] {
    return [
      {
        name: 'generate-map',
        description: 'Start AI map generation using D&D Battlemaps SDXL (async)',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                'Map description (will be enhanced with "2d DnD battlemap" trigger and perspective)',
            },
            scene_name: {
              type: 'string',
              description:
                'Short, creative name for the Foundry scene (e.g., "Harbor District", "Moonlit Tavern", "Crystal Caverns"). Be creative and evocative!',
            },
            size: {
              type: 'string',
              enum: ['small', 'medium', 'large'],
              default: 'medium',
              description: 'Map size (small=1024px, medium=1536px, large=2048px)',
            },
            grid_size: {
              type: 'number',
              default: 70,
              description: 'Pixels per 5ft square for Foundry scene setup',
            },
          },
          required: ['prompt', 'scene_name'],
        },
      },
      {
        name: 'check-map-status',
        description:
          'Check status of map generation job. Progress updates appear automatically in Foundry VTT. DO NOT check frequently - this wastes tokens. Only check if user explicitly asks for status.',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: {
              type: 'string',
              description: 'Job ID to check status for',
            },
          },
          required: ['job_id'],
        },
      },
      {
        name: 'cancel-map-job',
        description: 'Cancel a running map generation job',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: {
              type: 'string',
              description: 'Job ID to cancel',
            },
          },
          required: ['job_id'],
        },
      },
      {
        name: 'list-scenes',
        description: 'List all available Foundry VTT scenes with their details',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional filter to search scene names (case-insensitive)',
              default: '',
            },
            include_active_only: {
              type: 'boolean',
              description: 'Only return the currently active scene',
              default: false,
            },
          },
        },
      },
      {
        name: 'switch-scene',
        description: 'Switch to a different Foundry VTT scene by name or ID',
        inputSchema: {
          type: 'object',
          properties: {
            scene_identifier: {
              type: 'string',
              description: 'Scene name or ID to switch to',
            },
            optimize_view: {
              type: 'boolean',
              description: 'Automatically optimize the view for the scene',
              default: true,
            },
          },
          required: ['scene_identifier'],
        },
      },
    ];
  }

  async listScenes(input: any): Promise<any> {
    const safeInput = input ?? {};
    try {
      const params = {
        filter: typeof safeInput.filter === 'string' ? safeInput.filter : undefined,
        include_active_only: Boolean(safeInput.include_active_only),
      };
      return await this.foundryClient.query('foundry-mcp-bridge.list-scenes', params);
    } catch (error: any) {
      this.logger.error('List scenes failed', { error, input: safeInput });
      return { success: false, error: error?.message ?? 'Unknown error' };
    }
  }

  async switchScene(input: any): Promise<any> {
    const safeInput = input ?? {};
    try {
      const sceneIdentifier =
        typeof safeInput.scene_identifier === 'string'
          ? safeInput.scene_identifier
          : safeInput.sceneId;
      if (!sceneIdentifier || typeof sceneIdentifier !== 'string' || !sceneIdentifier.trim()) {
        return { success: false, error: 'scene_identifier is required' };
      }

      const params = {
        scene_identifier: sceneIdentifier,
        optimize_view: safeInput.optimize_view !== false,
      };

      return await this.foundryClient.query('foundry-mcp-bridge.switch-scene', params);
    } catch (error: any) {
      this.logger.error('Switch scene failed', { error, input: safeInput });
      return { success: false, error: error?.message ?? 'Unknown error' };
    }
  }

  async generateMap(input: any): Promise<any> {
    const safeInput = input ?? {};
    try {
      this.logger.info('Map generation requested via MCP', { input: safeInput });

      const prompt = typeof safeInput.prompt === 'string' ? safeInput.prompt.trim() : '';
      if (!prompt) {
        return 'Error: Prompt is required and must be a string.';
      }

      const sceneName = typeof safeInput.scene_name === 'string' ? safeInput.scene_name.trim() : '';
      if (!sceneName) {
        return 'Error: Scene name is required and must be a string.';
      }

      const size = typeof safeInput.size === 'string' ? safeInput.size : 'medium';
      const gridSizeRaw =
        typeof safeInput.grid_size === 'number' ? safeInput.grid_size : Number(safeInput.grid_size);
      const gridSize = Number.isFinite(gridSizeRaw) ? gridSizeRaw : 70;

      const params = {
        prompt,
        scene_name: sceneName,
        size,
        grid_size: gridSize,
      } as const;

      const response = await this.foundryClient.query('foundry-mcp-bridge.generate-map', params);
      if (response?.error) {
        throw new Error(response.error);
      }

      const jobId = response?.jobId ?? 'unknown';
      const estimatedTime = response?.estimatedTime ?? 'varies by hardware and quality setting';
      const lines = [
        `Map generation started. Job ID: ${jobId}`,
        '',
        `Prompt: ${params.prompt}`,
        `Size: ${params.size} (${this.getSizePixels(params.size)})`,
        `Grid size: ${params.grid_size}px`,
        '',
        `Generation time: ${estimatedTime}`,
        '',
        'Progress updates will appear automatically in Foundry VTT.',
        'Once complete, the map will be imported as a new scene.',
        'Do NOT check status frequently - this wastes tokens.',
      ];

      return lines.join('\n');
    } catch (error: any) {
      this.logger.error('Map generation failed', { error, input: safeInput });
      return `Error: ${error?.message ?? 'Unknown error'}`;
    }
  }

  async checkMapStatus(input: any): Promise<any> {
    const safeInput = input ?? {};
    try {
      const jobIdCandidate =
        typeof safeInput.job_id === 'string' ? safeInput.job_id : safeInput.jobId;
      const jobId = typeof jobIdCandidate === 'string' ? jobIdCandidate.trim() : '';
      if (!jobId) {
        return 'Error: job_id is required.';
      }

      this.logger.info('Map status check requested via MCP', { jobId, input: safeInput });

      const response = await this.foundryClient.query('foundry-mcp-bridge.check-map-status', {
        job_id: jobId,
      });
      if (response?.error) {
        const message = response?.message ?? response?.error ?? 'Failed to check job status';
        return `Error: ${message}`;
      }

      const job = response?.job;
      if (!job) {
        return `Job ${jobId} not found. It may have expired or been cleaned up.`;
      }

      switch (job.status) {
        case 'queued':
          return `Job ${jobId} is queued. Status: ${job.current_stage ?? 'Pending'}.`;
        case 'generating':
        case 'processing':
          return `Job ${jobId} in progress. Stage: ${job.current_stage ?? 'Processing'}. Progress: ${job.progress_percent ?? 0}%`;
        case 'complete': {
          const duration = job.result?.generation_time_ms;
          const durationText =
            typeof duration === 'number'
              ? ` Generation time: ${Math.round(duration / 1000)}s.`
              : '';
          return `Job ${jobId} completed successfully.${durationText}`;
        }
        case 'failed':
          return `Job ${jobId} failed. Reason: ${job.error ?? 'Unknown error'}.`;
        case 'expired':
          return `Job ${jobId} has expired.`;
        default:
          return `Job ${jobId} returned status "${job.status}".`;
      }
    } catch (error: any) {
      this.logger.error('Status check failed', { error, input: safeInput });
      return `Error checking status: ${error?.message ?? 'Unknown error'}`;
    }
  }

  async cancelMapJob(input: any): Promise<any> {
    const safeInput = input ?? {};
    try {
      const jobIdCandidate =
        typeof safeInput.job_id === 'string' ? safeInput.job_id : safeInput.jobId;
      const jobId = typeof jobIdCandidate === 'string' ? jobIdCandidate.trim() : '';
      if (!jobId) {
        return 'Error: job_id is required.';
      }

      this.logger.info('Map job cancellation requested via MCP', { jobId, input: safeInput });

      const response = await this.foundryClient.query('foundry-mcp-bridge.cancel-map-job', {
        job_id: jobId,
      });
      if (response?.error) {
        const message = response?.message ?? response?.error ?? 'Failed to cancel map job';
        return `Error: ${message}`;
      }

      const status =
        typeof response?.status === 'string'
          ? response.status
          : response?.success
            ? 'success'
            : 'unknown';
      const message = response?.message ?? 'Map generation job cancelled.';
      return `${message} (status: ${status})`;
    } catch (error: any) {
      this.logger.error('Map job cancellation failed', { error, input: safeInput });
      return `Error cancelling job: ${error?.message ?? 'Unknown error'}`;
    }
  }

  private getSizePixels(size: string): string {
    switch (size) {
      case 'small':
        return '1024x1024';
      case 'large':
        return '2048x2048';
      case 'medium':
      default:
        return '1536x1536';
    }
  }

  private generateJobId(): string {
    this.jobIdCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.jobIdCounter.toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `job_${timestamp}_${counter}_${random}`;
  }

  async shutdown(): Promise<void> {
    this.logger.info('MapGenerationTools shutdown complete');
  }
}
