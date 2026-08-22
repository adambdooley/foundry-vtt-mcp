import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'packages', 'mcp-server', 'dist');

const fail = message => {
  console.error(`\n[MCP Schema Smoke Test] ${message}`);
  process.exit(1);
};

if (!fs.existsSync(distDir)) {
  fail(
    `Build output not found at ${distDir}. Run "npm -w @foundry-mcp/server run build" and re-run this test.`
  );
}

const importDist = async relativePath =>
  import(pathToFileURL(path.join(distDir, relativePath)).href);

const [
  { config },
  { Logger },
  { FoundryClient },
  { CharacterTools },
  { CompendiumTools },
  { SceneTools },
  { ActorCreationTools },
  { QuestCreationTools },
  { DiceRollTools },
  { CombatTools },
  { CampaignManagementTools },
  { OwnershipTools },
  { TokenManipulationTools },
  { MapGenerationTools },
  { getSystemRegistry },
  { DnD5eAdapter },
  { PF2eAdapter },
  { DSA5Adapter },
  { CosmereRpgAdapter },
] = await Promise.all([
  importDist('config.js'),
  importDist('logger.js'),
  importDist('foundry-client.js'),
  importDist('tools/character.js'),
  importDist('tools/compendium.js'),
  importDist('tools/scene.js'),
  importDist('tools/actor-creation.js'),
  importDist('tools/quest-creation.js'),
  importDist('tools/dice-roll.js'),
  importDist('tools/combat.js'),
  importDist('tools/campaign-management.js'),
  importDist('tools/ownership.js'),
  importDist('tools/token-manipulation.js'),
  importDist('tools/map-generation.js'),
  importDist('systems/index.js'),
  importDist('systems/dnd5e/adapter.js'),
  importDist('systems/pf2e/adapter.js'),
  importDist('systems/dsa5/adapter.js'),
  importDist('systems/cosmere-rpg/adapter.js'),
]);

const logger = new Logger({ level: 'error', enableConsole: false, enableFile: false });
const foundryClient = new FoundryClient(config.foundry, logger);

const systemRegistry = getSystemRegistry(logger);
systemRegistry.register(new DnD5eAdapter());
systemRegistry.register(new PF2eAdapter());
systemRegistry.register(new DSA5Adapter());
systemRegistry.register(new CosmereRpgAdapter());

const tools = [
  ...new CharacterTools({ foundryClient, logger, systemRegistry }).getToolDefinitions(),
  ...new CompendiumTools({ foundryClient, logger, systemRegistry }).getToolDefinitions(),
  ...new SceneTools({ foundryClient, logger }).getToolDefinitions(),
  ...new ActorCreationTools({ foundryClient, logger }).getToolDefinitions(),
  ...new QuestCreationTools({ foundryClient, logger }).getToolDefinitions(),
  ...new DiceRollTools({ foundryClient, logger }).getToolDefinitions(),
  ...new CombatTools({ foundryClient, logger }).getToolDefinitions(),
  ...new CampaignManagementTools(foundryClient, logger).getToolDefinitions(),
  ...new OwnershipTools({ foundryClient, logger }).getToolDefinitions(),
  ...new TokenManipulationTools({ foundryClient, logger }).getToolDefinitions(),
  ...new MapGenerationTools({
    foundryClient,
    logger,
    backendComfyUIHandlers: {},
  }).getToolDefinitions(),
];

if (!tools.length) {
  fail('No tools were loaded from the runtime tool registry.');
}

const objectSchemas = [];
for (const tool of tools) {
  if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
    fail(`Tool "${tool.name}" does not define an inputSchema of type "object".`);
  }
  objectSchemas.push({ tool, schema: tool.inputSchema });
}

const additionalPropertiesFalseCount = objectSchemas.filter(
  ({ schema }) => schema.additionalProperties === false
).length;

if (additionalPropertiesFalseCount === objectSchemas.length) {
  fail(
    'Every tool schema has additionalProperties=false. This indicates schema normalization is forcing strictness globally.'
  );
}

const switchSceneSchema = tools.find(tool => tool.name === 'switch-scene')?.inputSchema;
if (!switchSceneSchema) {
  fail('Expected tool "switch-scene" to be present but it was not found.');
}

if (switchSceneSchema.additionalProperties === false) {
  fail(
    'Tool "switch-scene" schema sets additionalProperties=false. This can reject alias parameters like "sceneId" and breaks client compatibility.'
  );
}

console.log(
  '[MCP Schema Smoke Test] PASS: tool schemas load, use object input, and do not enforce global additionalProperties=false.'
);
