import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';

export interface DSA5CharacterCreatorOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

/**
 * DSA5 Character Creator
 *
 * Handles creation of DSA5 characters from archetypes with customization options.
 * Supports archetype-based creation with name, age, biography, and other customizations.
 */
export class DSA5CharacterCreator {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: DSA5CharacterCreatorOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DSA5CharacterCreator' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  /**
   * Tool definitions for DSA5 character creation
   */
  getToolDefinitions() {
    return [
      {
        name: 'create-dsa5-character-from-archetype',
        description:
          'Create a DSA5 character from an archetype (e.g., Allacaya, Wulfgrimm). Allows customization of name, age, biography, and other details. Use search-compendium first to find available archetypes in DSA5 character packs.',
        inputSchema: {
          type: 'object',
          properties: {
            archetypePackId: {
              type: 'string',
              description:
                'ID of the compendium pack containing the archetype (e.g., "dsa5-core.corecharacters")',
            },
            archetypeId: {
              type: 'string',
              description:
                'ID of the archetype within the pack (get from search-compendium results)',
            },
            characterName: {
              type: 'string',
              description: 'Custom name for the character (e.g., "Ericsson", "Thorald")',
            },
            customization: {
              type: 'object',
              description: 'Optional customizations for the character',
              properties: {
                age: {
                  type: 'number',
                  description: 'Character age in years (e.g., 20, 35)',
                  minimum: 12,
                  maximum: 100,
                },
                biography: {
                  type: 'string',
                  description: 'Custom biography or background story',
                },
                gender: {
                  type: 'string',
                  description: 'Character gender (male, female, diverse)',
                  enum: ['male', 'female', 'diverse'],
                },
                eyeColor: {
                  type: 'string',
                  description: 'Eye color',
                },
                hairColor: {
                  type: 'string',
                  description: 'Hair color',
                },
                height: {
                  type: 'number',
                  description: 'Height in cm',
                },
                weight: {
                  type: 'number',
                  description: 'Weight in kg',
                },
                species: {
                  type: 'string',
                  description: 'Species/race (e.g., "Mensch", "Elf", "Zwerg")',
                },
                culture: {
                  type: 'string',
                  description: 'Culture (e.g., "Mittelreich", "Thorwal")',
                },
                profession: {
                  type: 'string',
                  description: 'Profession/career',
                },
              },
            },
            addToWorld: {
              type: 'boolean',
              description: 'Whether to add the character to the current world (default: true)',
              default: true,
            },
          },
          required: ['archetypePackId', 'archetypeId', 'characterName'],
        },
      },
      {
        name: 'list-dsa5-archetypes',
        description:
          'List available DSA5 character archetypes from compendium packs. Helps users discover available templates for character creation.',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description:
                'Optional: specific pack to search (e.g., "dsa5-core.corecharacters"). If not provided, searches all DSA5 character packs.',
            },
            filterBySpecies: {
              type: 'string',
              description: 'Optional: filter by species (e.g., "Mensch", "Elf")',
            },
            filterByProfession: {
              type: 'string',
              description: 'Optional: filter by profession type',
            },
          },
        },
      },
    ];
  }

  /**
   * Handle DSA5 character creation from archetype
   */
  async handleCreateCharacterFromArchetype(args: any): Promise<any> {
    const schema = z.object({
      archetypePackId: z.string().min(1, 'Archetype pack ID cannot be empty'),
      archetypeId: z.string().min(1, 'Archetype ID cannot be empty'),
      characterName: z.string().min(1, 'Character name cannot be empty'),
      customization: z
        .object({
          age: z.number().min(12).max(100).optional(),
          biography: z.string().optional(),
          gender: z.enum(['male', 'female', 'diverse']).optional(),
          eyeColor: z.string().optional(),
          hairColor: z.string().optional(),
          height: z.number().optional(),
          weight: z.number().optional(),
          species: z.string().optional(),
          culture: z.string().optional(),
          profession: z.string().optional(),
        })
        .optional(),
      addToWorld: z.boolean().default(true),
    });

    const { archetypePackId, archetypeId, characterName, customization, addToWorld } =
      schema.parse(args);

    this.logger.info('Creating DSA5 character from archetype', {
      archetypePackId,
      archetypeId,
      characterName,
      customization,
    });

    try {
      // First, get the full archetype data
      const archetypeData = await this.foundryClient.query(
        'foundry-mcp-bridge.getCompendiumDocumentFull',
        {
          packId: archetypePackId,
          documentId: archetypeId,
        }
      );

      if (!archetypeData) {
        throw new Error(`Archetype ${archetypeId} not found in pack ${archetypePackId}`);
      }

      // Prepare character data with customizations
      const characterData = this.prepareCharacterData(archetypeData, characterName, customization);

      // Create the character actor in Foundry
      const result = await this.foundryClient.query(
        'foundry-mcp-bridge.createActorFromCompendium',
        {
          packId: archetypePackId,
          itemId: archetypeId,
          customNames: [characterName],
          quantity: 1,
          addToScene: false, // Characters aren't added to scenes by default
          customData: characterData, // Pass customizations
        }
      );

      this.logger.info('DSA5 character created successfully', {
        characterName,
        archetypeName: archetypeData.name,
        success: result.success,
      });

      return this.formatCharacterCreationResponse(
        result,
        archetypeData,
        characterName,
        customization
      );
    } catch (error) {
      this.errorHandler.handleToolError(
        error,
        'create-dsa5-character-from-archetype',
        'DSA5 character creation'
      );
    }
  }

  /**
   * Handle listing DSA5 archetypes
   */
  async handleListArchetypes(args: any): Promise<any> {
    const schema = z.object({
      packId: z.string().optional(),
      filterBySpecies: z.string().optional(),
      filterByProfession: z.string().optional(),
    });

    const { packId, filterBySpecies, filterByProfession } = schema.parse(args);

    this.logger.info('Listing DSA5 archetypes', { packId, filterBySpecies, filterByProfession });

    try {
      // Get all available packs or specific pack
      const packs = await this.foundryClient.query('foundry-mcp-bridge.getAvailablePacks');

      // Filter for DSA5 character packs
      const characterPacks = packs.filter(
        (pack: any) =>
          pack.type === 'Actor' && pack.system === 'dsa5' && (!packId || pack.id === packId)
      );

      const archetypes: any[] = [];

      // Get archetypes from each pack
      for (const pack of characterPacks) {
        try {
          const packIndex = await this.foundryClient.query('foundry-mcp-bridge.getPackIndex', {
            packId: pack.id,
          });

          // Filter archetypes
          const packArchetypes = packIndex
            .filter((entry: any) => entry.type === 'character')
            .filter((entry: any) => {
              if (filterBySpecies && entry.system?.details?.species?.value !== filterBySpecies) {
                return false;
              }
              if (
                filterByProfession &&
                !entry.system?.details?.career?.value?.includes(filterByProfession)
              ) {
                return false;
              }
              return true;
            })
            .map((entry: any) => ({
              id: entry.id,
              name: entry.name,
              packId: pack.id,
              packLabel: pack.label,
              species: entry.system?.details?.species?.value || 'Unknown',
              profession: entry.system?.details?.career?.value || 'Unknown',
              img: entry.img,
            }));

          archetypes.push(...packArchetypes);
        } catch (packError) {
          this.logger.warn(`Failed to load archetypes from pack ${pack.id}`, { error: packError });
        }
      }

      this.logger.info('Retrieved DSA5 archetypes', { count: archetypes.length });

      return this.formatArchetypeListResponse(archetypes, filterBySpecies, filterByProfession);
    } catch (error) {
      this.errorHandler.handleToolError(error, 'list-dsa5-archetypes', 'archetype listing');
    }
  }

  /**
   * Prepare character data with customizations
   */
  private prepareCharacterData(
    archetypeData: any,
    characterName: string,
    customization?: any
  ): any {
    const data: any = {
      name: characterName,
    };

    if (!customization) {
      return data;
    }

    // Build system data updates
    const systemUpdates: any = {};

    if (customization.age !== undefined) {
      systemUpdates['details.age.value'] = customization.age;
    }

    if (customization.biography) {
      systemUpdates['details.biography.value'] = customization.biography;
    }

    if (customization.gender) {
      systemUpdates['details.gender.value'] = customization.gender;
    }

    if (customization.eyeColor) {
      systemUpdates['details.eyecolor.value'] = customization.eyeColor;
    }

    if (customization.hairColor) {
      systemUpdates['details.haircolor.value'] = customization.hairColor;
    }

    if (customization.height) {
      systemUpdates['details.height.value'] = customization.height;
    }

    if (customization.weight) {
      systemUpdates['details.weight.value'] = customization.weight;
    }

    if (customization.species) {
      systemUpdates['details.species.value'] = customization.species;
    }

    if (customization.culture) {
      systemUpdates['details.culture.value'] = customization.culture;
    }

    if (customization.profession) {
      systemUpdates['details.career.value'] = customization.profession;
    }

    if (Object.keys(systemUpdates).length > 0) {
      data.system = systemUpdates;
    }

    return data;
  }

  /**
   * Format character creation response
   */
  private formatCharacterCreationResponse(
    result: any,
    archetypeData: any,
    characterName: string,
    customization?: any
  ): any {
    const customizationInfo = customization
      ? Object.entries(customization)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
      : 'None';

    const summary = `✅ DSA5 Character "${characterName}" created from archetype "${archetypeData.name}"`;

    const details = [
      `**Name:** ${characterName}`,
      `**Archetype:** ${archetypeData.name}`,
      `**Pack:** ${archetypeData.packLabel}`,
    ];

    if (customization) {
      if (customization.age) details.push(`**Age:** ${customization.age} years`);
      if (customization.species) details.push(`**Species:** ${customization.species}`);
      if (customization.culture) details.push(`**Culture:** ${customization.culture}`);
      if (customization.profession) details.push(`**Profession:** ${customization.profession}`);
      if (customization.biography)
        details.push(`**Biography:** ${customization.biography.substring(0, 100)}...`);
    }

    const errorInfo = result.errors?.length > 0 ? `\n⚠️ Issues: ${result.errors.join(', ')}` : '';

    return {
      summary,
      success: result.success,
      character: {
        name: characterName,
        id: result.actors?.[0]?.id,
        archetype: {
          name: archetypeData.name,
          packId: archetypeData.pack,
        },
        customizations: customization || {},
      },
      message: summary + '\n\n' + details.join('\n') + errorInfo,
    };
  }

  /**
   * Format archetype list response
   */
  private formatArchetypeListResponse(
    archetypes: any[],
    filterBySpecies?: string,
    filterByProfession?: string
  ): any {
    const filterInfo = [
      filterBySpecies ? `Species: ${filterBySpecies}` : null,
      filterByProfession ? `Profession: ${filterByProfession}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const summary =
      `Found ${archetypes.length} DSA5 archetypes` + (filterInfo ? ` (${filterInfo})` : '');

    const archetypeList = archetypes
      .map(
        archetype =>
          `• **${archetype.name}** (${archetype.species}, ${archetype.profession})\n  Pack: ${archetype.packLabel} | ID: ${archetype.id}`
      )
      .join('\n\n');

    return {
      summary,
      count: archetypes.length,
      filters: {
        species: filterBySpecies,
        profession: filterByProfession,
      },
      archetypes,
      message: summary + '\n\n' + archetypeList,
    };
  }
}
