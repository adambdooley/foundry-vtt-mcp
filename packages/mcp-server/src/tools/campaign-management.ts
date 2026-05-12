// Campaign Management Tools - Multipart Campaign System
// Provides journal-based campaign creation, dashboard generation, and progress tracking

import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { Logger } from '../logger.js';
import {
  CampaignStructureSchema,
  CampaignPartSchema,
  CampaignTemplateSchema,
  CampaignPartTypeSchema,
} from '@foundry-mcp/shared';
import type { CampaignStructure, CampaignPart, CampaignTemplate } from '@foundry-mcp/shared';

export class CampaignManagementTools {
  private foundryClient: FoundryClient;
  private errorHandler: ErrorHandler;
  private logger: Logger;

  constructor(foundryClient: FoundryClient, logger: Logger) {
    this.foundryClient = foundryClient;
    this.logger = logger;
    this.errorHandler = new ErrorHandler(this.logger);
  }

  getToolDefinitions() {
    return [
      {
        name: 'create-campaign-dashboard',
        description:
          'Create a comprehensive campaign dashboard journal with navigation, progress tracking, and part management',
        inputSchema: {
          type: 'object',
          properties: {
            campaignTitle: {
              type: 'string',
              description: 'Title of the campaign (e.g., "The Whisperstone Conspiracy")',
            },
            campaignDescription: {
              type: 'string',
              description: 'Brief description of the campaign theme and scope',
            },
            template: {
              type: 'string',
              enum: ['five-part-adventure', 'dungeon-crawl', 'investigation', 'sandbox', 'custom'],
              description: 'Campaign structure template to use',
            },
            customParts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['main_part', 'sub_part', 'chapter', 'session', 'optional'],
                  },
                  levelStart: { type: 'number', minimum: 1, maximum: 20 },
                  levelEnd: { type: 'number', minimum: 1, maximum: 20 },
                  subParts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                      },
                      required: ['title', 'description'],
                    },
                  },
                },
                required: ['title', 'description', 'type', 'levelStart', 'levelEnd'],
              },
              description: 'Custom campaign parts when template is "custom"',
            },
            defaultQuestGiver: {
              type: 'string',
              description: 'Default NPC name for quest giving (optional)',
            },
            defaultLocation: {
              type: 'string',
              description: 'Default campaign location/setting (optional)',
            },
          },
          required: ['campaignTitle', 'campaignDescription', 'template'],
        },
      },
    ];
  }

  /**
   * Handle create campaign dashboard request
   */
  async handleCreateCampaignDashboard(args: any): Promise<any> {
    try {
      const requestSchema = z.object({
        campaignTitle: z.string().min(1, 'Campaign title is required'),
        campaignDescription: z.string().min(1, 'Campaign description is required'),
        template: z.enum([
          'five-part-adventure',
          'dungeon-crawl',
          'investigation',
          'sandbox',
          'custom',
        ]),
        customParts: z
          .array(
            z.object({
              title: z.string().min(1),
              description: z.string().min(1),
              type: CampaignPartTypeSchema,
              levelStart: z.number().min(1).max(20),
              levelEnd: z.number().min(1).max(20),
              subParts: z
                .array(
                  z.object({
                    title: z.string().min(1),
                    description: z.string().min(1),
                  })
                )
                .optional(),
            })
          )
          .optional(),
        defaultQuestGiver: z.string().optional(),
        defaultLocation: z.string().optional(),
      });

      const request = requestSchema.parse(args);

      // Generate campaign structure based on template
      const campaignStructure = this.generateCampaignStructure(request);

      // Create dashboard journal entry
      const dashboardContent = this.generateDashboardHTML(campaignStructure);

      // Create the journal entry in Foundry (organized in campaign-specific folder)
      const journalResult = await this.foundryClient.query(
        'foundry-mcp-bridge.createJournalEntry',
        {
          name: `${request.campaignTitle} - Campaign Dashboard`,
          content: dashboardContent,
          folderName: request.campaignTitle, // Organize in campaign-named folder
        }
      );

      if (!journalResult || journalResult.error) {
        throw new Error(journalResult?.error || 'Failed to create campaign dashboard journal');
      }

      // Update campaign structure with dashboard journal ID
      campaignStructure.dashboardJournalId = journalResult.id;

      // Store campaign structure (would typically go to a world flag or journal)
      await this.storeCampaignStructure(campaignStructure);

      return {
        success: true,
        campaignId: campaignStructure.id,
        dashboardJournalId: journalResult.id,
        dashboardName: journalResult.name,
        campaignStructure: campaignStructure,
        message: `Campaign dashboard "${request.campaignTitle}" created successfully with ${campaignStructure.parts.length} parts`,
      };
    } catch (error) {
      return this.errorHandler.handleToolError(
        error,
        'create-campaign-dashboard',
        'campaign dashboard creation'
      );
    }
  }

  /**
   * Generate campaign structure from template
   */
  private generateCampaignStructure(request: any): CampaignStructure {
    const campaignId = `campaign-${Date.now()}`;
    const timestamp = Date.now();

    let parts: CampaignPart[] = [];

    if (request.template === 'custom' && request.customParts) {
      parts = request.customParts.map((part: any, index: number) => ({
        id: `${campaignId}-part-${index + 1}`,
        title: part.title,
        description: part.description,
        type: part.type,
        status: 'not_started' as const,
        dependencies: index > 0 ? [`${campaignId}-part-${index}`] : [],
        subParts: part.subParts?.map((subPart: any, subIndex: number) => ({
          id: `${campaignId}-part-${index + 1}-sub-${subIndex + 1}`,
          title: subPart.title,
          description: subPart.description,
          type: 'sub_part' as const,
          status: 'not_started' as const,
          createdAt: timestamp,
        })),
        ...(request.defaultQuestGiver && {
          questGiver: {
            id: `npc-${request.defaultQuestGiver.toLowerCase().replace(/\s+/g, '-')}`,
            name: request.defaultQuestGiver,
          },
        }),
        levelRecommendation: {
          start: part.levelStart,
          end: part.levelEnd,
        },
        gmNotes: '',
        playerContent: '',
        scaling: {
          adjustForPartySize: true,
          adjustForLevel: true,
          difficultyModifier: 0,
        },
        createdAt: timestamp,
      }));
    } else {
      parts = this.getTemplateParts(
        request.template,
        campaignId,
        timestamp,
        request.defaultQuestGiver
      );
    }

    return {
      id: campaignId,
      title: request.campaignTitle,
      description: request.campaignDescription,
      parts,
      metadata: {
        ...(request.defaultQuestGiver && {
          defaultQuestGiver: {
            id: `npc-${request.defaultQuestGiver.toLowerCase().replace(/\s+/g, '-')}`,
            name: request.defaultQuestGiver,
          },
        }),
        ...(request.defaultLocation && { defaultLocation: request.defaultLocation }),
        ...(request.template && { theme: request.template }),
        tags: [request.template],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Get template-based campaign parts
   */
  private getTemplateParts(
    template: string,
    campaignId: string,
    timestamp: number,
    defaultQuestGiver?: string
  ): CampaignPart[] {
    const templates: Record<string, any[]> = {
      'five-part-adventure': [
        {
          title: 'Hook & Introduction',
          description:
            'Draw the party into the adventure with compelling hooks and initial encounters',
          levels: [1, 2],
        },
        {
          title: 'Investigation & Clues',
          description: 'Gather information, explore leads, and uncover the scope of the threat',
          levels: [2, 4],
        },
        {
          title: 'Midpoint Revelation',
          description: 'Major discovery or plot twist that changes the stakes and direction',
          levels: [4, 6],
        },
        {
          title: 'Climactic Confrontation',
          description: 'Face the primary antagonist or overcome the central challenge',
          levels: [6, 8],
        },
        {
          title: 'Resolution & Rewards',
          description: 'Wrap up loose ends, distribute rewards, and set up future adventures',
          levels: [8, 9],
        },
      ],
      'dungeon-crawl': [
        {
          title: 'Approach & Entry',
          description: 'Navigate to the dungeon and overcome entrance challenges',
          levels: [1, 2],
        },
        {
          title: 'Upper Levels',
          description: 'Explore the first floors, encounter guardians and traps',
          levels: [2, 4],
          subParts: [
            { title: 'Rooms 1-3', description: 'Initial chambers and encounters' },
            { title: 'Rooms 4-6', description: 'Mid-level challenges and treasures' },
          ],
        },
        {
          title: 'Lower Levels',
          description: 'Delve deeper into more dangerous areas',
          levels: [4, 6],
          subParts: [
            { title: 'Rooms 7-9', description: 'Advanced traps and stronger enemies' },
            { title: 'Rooms 10-12', description: 'Elite encounters and hidden secrets' },
          ],
        },
        {
          title: 'Final Boss & Treasure',
          description: "Confront the dungeon's master and claim the ultimate prize",
          levels: [6, 8],
        },
      ],
      investigation: [
        {
          title: 'Crime Scene',
          description: 'Initial investigation of the incident and evidence gathering',
          levels: [1, 2],
        },
        {
          title: 'Witness Interviews',
          description: 'Question involved parties and gather testimonies',
          levels: [2, 3],
          subParts: [
            { title: 'Primary Witnesses', description: 'Key individuals with direct knowledge' },
            { title: 'Secondary Sources', description: 'Additional contacts and informants' },
          ],
        },
        {
          title: 'Following Leads',
          description: 'Pursue clues to multiple locations and uncover connections',
          levels: [3, 5],
          subParts: [
            { title: 'Location A', description: 'First lead destination' },
            { title: 'Location B', description: 'Second investigation site' },
            { title: 'Location C', description: 'Final clue location' },
          ],
        },
        {
          title: 'Confrontation',
          description: 'Face the culprit with evidence and resolve the case',
          levels: [5, 6],
        },
        {
          title: 'Resolution',
          description: 'Tie up loose ends and deliver justice or closure',
          levels: [6, 7],
        },
      ],
      sandbox: [
        {
          title: 'World Introduction',
          description: 'Establish the setting, key NPCs, and available opportunities',
          levels: [1, 3],
        },
        {
          title: 'Exploration Phase',
          description: 'Players choose their path and explore available content',
          levels: [3, 8],
        },
        {
          title: 'Consequences & Reactions',
          description: 'World responds to player actions with new challenges',
          levels: [8, 12],
        },
        {
          title: 'Player-Driven Climax',
          description: 'Major storyline chosen and pursued by players',
          levels: [12, 15],
        },
      ],
    };

    const templateParts = templates[template] || templates['five-part-adventure'];

    return templateParts.map((part, index) => ({
      id: `${campaignId}-part-${index + 1}`,
      title: part.title,
      description: part.description,
      type: 'main_part' as const,
      status: 'not_started' as const,
      dependencies: index > 0 ? [`${campaignId}-part-${index}`] : [],
      subParts: part.subParts?.map((subPart: any, subIndex: number) => ({
        id: `${campaignId}-part-${index + 1}-sub-${subIndex + 1}`,
        title: subPart.title,
        description: subPart.description,
        type: 'sub_part' as const,
        status: 'not_started' as const,
        createdAt: timestamp,
      })),
      ...(defaultQuestGiver && {
        questGiver: {
          id: `npc-${defaultQuestGiver.toLowerCase().replace(/\s+/g, '-')}`,
          name: defaultQuestGiver,
        },
      }),
      levelRecommendation: {
        start: part.levels[0],
        end: part.levels[1],
      },
      gmNotes: '',
      playerContent: '',
      scaling: {
        adjustForPartySize: true,
        adjustForLevel: true,
        difficultyModifier: 0,
      },
      createdAt: timestamp,
    }));
  }

  /**
   * Generate HTML content for campaign dashboard journal
   */
  private generateDashboardHTML(campaign: CampaignStructure): string {
    const progress = this.calculateProgress(campaign);
    const currentPart = campaign.parts.find((part: CampaignPart) => part.status === 'in_progress');

    return `<style>
.campaign-status-toggle {
  cursor: pointer;
  border-radius: 1em;
  padding: 0.3em 0.6em;
  margin: 0 0.2em;
  font-size: 0.9em;
  font-weight: bold;
  color: #fff;
  background: #777;
  border: 1px solid #555;
  transition: all 0.2s ease;
  display: inline-block;
  user-select: none;
}

.campaign-status-toggle:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.campaign-status-toggle.not-started {
  background: #6c757d;
  border-color: #495057;
}

.campaign-status-toggle.in-progress {
  background: #007bff;
  border-color: #0056b3;
}

.campaign-status-toggle.completed {
  background: #28a745;
  border-color: #1e7e34;
}

.campaign-status-toggle.skipped {
  background: #ffc107;
  border-color: #e0a800;
  color: #212529;
}

.campaign-part {
  margin-bottom: 1.5em;
  padding: 1em;
  border-left: 4px solid #ddd;
}

.campaign-part.in-progress {
  border-left-color: #007bff;
  background: rgba(0, 123, 255, 0.05);
}

.campaign-part.completed {
  border-left-color: #28a745;
  background: rgba(40, 167, 69, 0.05);
}
</style>

<div class="campaign-dashboard spaced">
  <h1>${campaign.title}</h1>
  
  <div class="campaign-overview readaloud">
    <p><strong>Campaign Progress:</strong> ${progress.completed} of ${progress.total} parts completed (${progress.percentage}%)</p>
    <p><strong>Current Focus:</strong> ${currentPart ? currentPart.title : 'Ready to begin'}</p>
    ${campaign.metadata.defaultLocation ? `<p><strong>Primary Setting:</strong> ${campaign.metadata.defaultLocation}</p>` : ''}
    ${campaign.metadata.defaultQuestGiver ? `<p><strong>Primary Quest Giver:</strong> ${campaign.metadata.defaultQuestGiver.name}</p>` : ''}
  </div>
  
  <h2>Campaign Parts</h2>
  <p><em>Click status indicators to update progress. Changes are saved automatically.</em></p>
  
  ${campaign.parts.map((part: CampaignPart, index: number) => this.generatePartHTML(part, index + 1, campaign)).join('\n  ')}
  
  <div class="campaign-notes gmnote">
    <h3>GM Notes</h3>
    <p><em>Campaign created: ${new Date(campaign.createdAt).toLocaleDateString()}</em></p>
    <p><em>Last updated: ${new Date(campaign.updatedAt).toLocaleDateString()}</em></p>
    ${campaign.description ? `<p><strong>Description:</strong> ${campaign.description}</p>` : ''}
    <p><em><strong>Campaign ID:</strong> ${campaign.id}</em></p>
  </div>
</div>`;
  }

  /**
   * Generate HTML for individual campaign part
   */
  private generatePartHTML(
    part: CampaignPart,
    partNumber: number,
    campaign: CampaignStructure
  ): string {
    const statusIcon = this.getStatusIcon(part.status);
    const isLocked = this.isPartLocked(part, campaign);
    const lockIcon = isLocked ? '[LOCKED] ' : '';

    // Generate simple status display
    const statusTracker = this.generateStatusTracker(part, campaign.id);

    let html = `<div class="campaign-part ${part.status} spaced">
    <h3>${lockIcon}Part ${partNumber}: ${part.title}</h3>
    <p><strong>Status:</strong> ${statusTracker}</p>
    <p><strong>Levels:</strong> ${part.levelRecommendation.start}-${part.levelRecommendation.end}</p>`;

    if (part.journalId) {
      html += `\n    <p><strong>@JournalEntry[${part.journalId}]{📖 View Details}</strong></p>`;
    }

    html += `\n    <p>${part.description}</p>`;

    // Add dependencies info if locked
    if (isLocked && part.dependencies.length > 0) {
      const depNames = part.dependencies
        .map((depId: string) => {
          const depPart = campaign.parts.find((p: CampaignPart) => p.id === depId);
          return depPart ? depPart.title : depId;
        })
        .join(', ');
      html += `\n    <p class="dependencies"><small><em>Requires completion of:</em> ${depNames}</small></p>`;
    }

    // Add sub-parts if they exist
    if (part.subParts && part.subParts.length > 0) {
      html += `\n    <div class="sub-parts">`;
      html += `\n      <h4>Sub-Parts:</h4>`;
      part.subParts.forEach((subPart: any, subIndex: number) => {
        const subStatusTracker = this.generateStatusTracker(subPart, campaign.id);
        html += `\n      <p><strong>${partNumber}.${subIndex + 1}: ${subPart.title}</strong> - Status: ${subStatusTracker}</p>`;
        if (subPart.journalId) {
          html += `\n      <p><strong>@JournalEntry[${subPart.journalId}]{📖 View Details}</strong></p>`;
        }
        html += `\n      <hr style="margin: 10px 0; border: 1px solid #ccc;">`;
      });
      html += `\n    </div>`;
    }

    html += `\n  </div>`;

    return html;
  }

  /**
   * Get status icon for visual indication
   */
  private getStatusIcon(status: string): string {
    const icons = {
      not_started: '⚪',
      in_progress: '🔄',
      completed: '✅',
      skipped: '⏭️',
    };
    return icons[status as keyof typeof icons] || '❓';
  }

  /**
   * Generate interactive status toggle element for Foundry hook system
   */
  private generateStatusTracker(part: CampaignPart | any, campaignId: string): string {
    const statusIcon = this.getStatusIcon(part.status);
    const statusDisplay = this.formatStatus(part.status);
    const statusClass = part.status.replace('_', '-'); // Convert to CSS class format

    // Interactive span that will be handled by Foundry hook system
    return `<span class="campaign-status-toggle ${statusClass}" 
                  data-campaign-id="${campaignId}" 
                  data-part-id="${part.id}"
                  title="Click to change status: ${statusDisplay}">
              ${statusIcon} ${statusDisplay}
            </span>`;
  }

  /**
   * Format status for display
   */
  private formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  }

  /**
   * Check if part is locked by dependencies
   */
  private isPartLocked(part: CampaignPart, campaign: CampaignStructure): boolean {
    if (part.dependencies.length === 0) return false;

    return part.dependencies.some((depId: string) => {
      const depPart = campaign.parts.find((p: CampaignPart) => p.id === depId);
      return !depPart || depPart.status !== 'completed';
    });
  }

  /**
   * Calculate overall campaign progress
   */
  private calculateProgress(campaign: CampaignStructure) {
    let total = 0;
    let completed = 0;

    campaign.parts.forEach((part: any) => {
      if (part.subParts && part.subParts.length > 0) {
        total += part.subParts.length;
        completed += part.subParts.filter((sp: any) => sp.status === 'completed').length;
      } else {
        total += 1;
        if (part.status === 'completed') completed += 1;
      }
    });

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percentage };
  }

  /**
   * Store campaign structure (simplified for create-only workflow)
   */
  private async storeCampaignStructure(campaign: CampaignStructure): Promise<void> {
    try {
      this.logger.info(
        `Campaign structure created: ${campaign.id} (GMs will track progress manually)`
      );
      // Note: Campaign structure is stored in the dashboard journal itself
      // GMs will manually edit the journal to track progress
    } catch (error) {
      this.logger.error(`Error with campaign ${campaign.id}:`, error);
      throw error;
    }
  }
}
