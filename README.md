# Foundry VTT MCP Bridge

Connect Foundry VTT to Claude Desktop for AI-powered campaign management through the Model Context Protocol (MCP). It currently supports Dungeons and Dragons Fifth Edition, Pathfinder Second Edition, Das Schwarze Augen Fifth Edition, Cosmere RPG System, Warhammer Fantasy Roleplay 4th Edition, & Mongoose Traveller 2nd Edition. The majority of MCP tools are system agnostic or have features that are aware of the system it is working with, excluding some DSA 5 specific tools.

## Overview

The Foundry MCP Bridge enables natural AI conversations with your Foundry VTT game data:

- **Quest Creation**: [Create quests from prompts that incorporate what exists in your world and journals](https://www.youtube.com/watch?v=NqyB_z2AKME)
- **Character Management**: Query character stats, abilities, and information
- **Compendium Search**: Find items, spells, and creatures using natural language
- **Content Creation**: Generate actors, NPCs, and quest journals from simple prompts
- **Scene Information**: Access current scene data and world details
- **Dice Coordination**: Interactive roll requests with player targeting
- **Campaign Management**: Multi-part quest and campaign tracking
- **Map Generation**: Create maps from prompts and automatically upload them into scenes in Foundry VTT using the optional ComfyUI component
- **Raw Document Access**: Import and export complete actors (items with activities included), manage world compendiums, apply verbatim item and actor updates, and run scripts in the GM client - see [docs/raw-actor-tools.md](docs/raw-actor-tools.md)

## Installation

### Prerequisites

- **Foundry VTT v13 or v14**
- **Claude Desktop** with MCP support
- **Windows** (for automated installer) or **Node.js 18+** for manual installation

### Option 1: Windows Installer

[Video guide for Windows Installer](https://youtu.be/Se04A21wrbE)

1. Download the latest `FoundryMCPServer-Setup-vx.x.x.exe` from [Releases](https://github.com/adambdooley/foundry-vtt-mcp/releases)
2. Run the installer - it will:
   - Install the MCP server with bundled Node.js runtime
   - Configure the Claude Desktop MCP server settings
   - Optionally install the Foundry module and ComfyUI Map Generation to your VTT installation
   - Choose Cuda version for your GPU type during install
3. Restart Claude Desktop
4. Enable "Foundry MCP Bridge" in your Foundry Module Management

### Option 2: Mac Installer

1.  Download the latest `FoundryMCPServer-vx.x.x.dmg` from [Releases](https://github.com/adambdooley/foundry-vtt-mcp/releases)
2.  Run the package installer inside the dmg - it will:
    - Open DMG and double-click the PKG installer
    - Configure the Claude Desktop MCP server settings
    - Optionally install the Foundry module and ComfyUI Map Generation to your Foundry VTT installation
3.  Restart Claude Desktop
4.  Enable "Foundry MCP Bridge" in your Foundry Module Management

### Option 3: Manual Installation

#### Install the Foundry Module

1. Open Foundry VTT (v13 or v14)
2. Select install module in the Foundry Add-ons menu
3. At the bottom of the window, add the Manifest URL as: https://github.com/adambdooley/foundry-vtt-mcp/blob/master/packages/foundry-module/module.json and click install
4. Enable "Foundry MCP Bridge" in Module Management
   - **Do not change the module ID or folder name.** The MCP backend and the Claude integration both expect the module to live in a directory called `foundry-mcp-bridge`. Renaming the ID in `module.json` breaks socket routing and stops Claude from seeing the backend.

#### Install the MCP Server

```bash
# Clone repository
git clone https://github.com/adambdooley/foundry-vtt-mcp.git
cd foundry-vtt-mcp

# Install dependencies and build
npm install
npm run build

```

#### Configure Claude Desktop

Add this to your Claude Desktop configuration (claude_desktop_config.json) file:

```json
{
  "mcpServers": {
    "foundry-mcp": {
      "command": "node",
      "args": ["path/to/foundry-vtt-mcp/packages/mcp-server/dist/index.js"],
      "env": {
        "FOUNDRY_HOST": "localhost",
        "FOUNDRY_PORT": "31415"
      }
    }
  }
}
```

Starting Claude Desktop will start the MCP Server.

> **Windows Store / MSIX installs:** If you installed Claude Desktop from the Microsoft Store, it reads its config from a virtualised path, not `%APPDATA%\Claude\`. Edit `claude_desktop_config.json` here instead:
> `%LOCALAPPDATA%\Packages\<...Claude...>\LocalCache\Roaming\Claude\claude_desktop_config.json`
> The automated Windows installer (v0.8.1+) writes to both locations for you. Note that a major Claude Desktop update can reset this container — if your tools disappear after an update, re-run the installer or re-add the `mcpServers` block at that path.

### Getting Started

1. Start Foundry VTT and load your world
2. Open Claude Desktop
3. Chat with Claude about your currently loaded Foundry World

## Example Usage

Once connected, ask Claude Desktop:

- _"Show me my character Clark's stats"_
- _"Find all CR 12 humanoid creatures for an encounter"_
- _"Create a quest about investigating missing villagers"_
- _"Roll a stealth check for Tulkas"_
- _"What's in the current Foundry scene?"_
- _"Create me a small map of a Riverside Cottage in Foundry"_

## Features

- **43 MCP Tools** that allow Claude to interact with Foundry
- **D&D 5e NPC Creation Suite**: Build complete NPCs from prompts — stat block, attacks, saves, auras, and spellcasting
- **Mongoose Traveller 2e (mgt2e) Support**: Full actor lifecycle — create/update/delete travellers, NPCs, creatures, and spacecraft with skill shorthand normalisation; creature compendium index with characteristic DMs; weapon-trait enum reference
- **WFRP4e Support**: Character reading plus editing — update characteristics, wounds, skills and careers, and add or remove items on existing actors
- **Generic Actor CRUD**: `manage-actors` creates, updates, and deletes actors of any type on any system; also updates and deletes embedded items
- **Character Management**: Access stats, abilities, inventory, and detailed entity information
- **Token Manipulation**: Move, update, delete tokens and manage status conditions
- **Enhanced Compendium Search**: Instant filtering by CR, type, abilities, and more
- **Content Creation**: Generate actors, NPCs, and quest journals (with optional folder organisation)
- **World Item Management**: Create, list, and update world-level Items; attach items directly to actors
- **Campaign Management**: Multi-part quest tracking with progress dashboards
- **Interactive Dice System**: Send different dice roll requests to players from Claude
- **Actor Ownership**: Manage player permissions for characters and tokens
- **GM-Only**: MCP Bridge only connects to Game Master users
- **Map Generation**: A portable ComfyUI backend that generates battlemaps from prompts
- **Remote Connections**: WebRTC connections initiated through browser (Tested with Google Chrome) to MCP server and ComfyUI
- **Windows and Mac Installers** Automated installation of Foundry MCP Server for Claude Dekstop, Foundry MCP Bridge Foundry VTT Module, and ComfyUI backend with dependencies

## MCP Tools

- **1** get-world-info
- **2** list-scenes
- **3** get-current-scene
- **4** get-available-conditions  
- **5** list-compendium-packs
- **6** list-characters
- **7** get-character  
- **8** search-character-items  
- **9** get-character-entity
- **10** get-token-details
- **11** toggle-token-condition (add)  
- **12** toggle-token-condition (remove)
- **13** update-token
- **14** search-compendium
- **15** get-compendium-item
- **16** get-compendium-entry-full
- **17** list-creatures-by-criteria  
- **18** list-journals  
- **19** create-quest-journal
- **20** update-quest-journal
- **21** search-journals
- **22** link-quest-to-npc
- **23** list-actor-ownership
- **24** assign-actor-ownership
- **25** remove-actor-ownership
- **26** move-token
- **27** use-item
- **28** request-player-rolls
- **29** generate-map
- **30** check-map-status
- **31** cancel-map-job
- **32** switch-scene  
- **33** create-actor-from-compendium
- **34** list-dsa5-archetypes (DSA5 Only)
- **35** create-dsa5-character-from-archetype (DSA5 Only)
- **36** create-campaign-dashboard
- **37** manage-world-items (create / list / update world items, add items to actor, describe system enum schema)
- **38** dnd5e-create-npc (D&D 5e Only)
- **39** dnd5e-add-feature (D&D 5e Only)
- **40** dnd5e-add-features-from-compendium (D&D 5e Only)
- **41** manage-actors (create / update / delete actors; update / delete embedded items — any system)

## Settings

<img width="964" height="803" alt="image" src="https://github.com/user-attachments/assets/bfd435d5-2df4-40a6-a79b-87e98121db3f" />

- **Enhanced Creature Index** Configure Enhanced Index button leads to Enhanced Creature Index sub-menu (Details below)
- **Map Generation Service Configuration** Configure Map Generation button leads to Map Generation Service sub-menu (Details below)
- **Enable MCP Bridge** This should be checked by default and the status should show as connected. It can be used to turn off the MCP Bridge connection within the game without the need to disable the add-on itself.
- **Connection Type** Can be set to Auto for automatic detection of connection type. Can also be set to force either WebRTC for Internet connections or Websocket for Local connections.
- **Websocket Server Host** IP Address of Claude Desktop MCP Server location. Only used for local network websocket connections. Remote Servers use WebRT. Defaults to localhost.
- **Allow Write Operations** This will prevent Claude from making any changes to world content and restrict it to reading only
- **Max Actors Per Request** This is a failsafe to stop a massive amount of actors being created from one single request. It does not limit the amount of characters being created by multiple requests
- **Show Connection Messages** This can turn off the banner messages for connections for Foundry MCP Bridge
- **Auto-Reconnect on Disconnect** Will automatically attempt to reconnect if the connection is lost
- **Connection Check Frequency** How often it will check connection status

### Enhanced Creature Index Sub-menu

<img width="497" height="604" alt="image" src="https://github.com/user-attachments/assets/bf1a6fdb-9bd5-4256-b922-d28cf65b1e7d" />

- **Rebuild Creature Index** This button will rebuild the creature index if there is an issue or it is out of sync with changes in your compendiums
- **Enable Enhanced Creature Index** This should be left on as Claude builds additional metadata in the world files to give it better searches
- **Auto-Rebuild Index on Pack Changes** Experimental feature that hasn't been fully tested yet

### Map Generation Service Sub-menu

<img width="489" height="779" alt="image" src="https://github.com/user-attachments/assets/a43d3a3d-266f-41c9-b40a-236d14cfcba9" />

- **Service Status** There are three buttons for Check Status, Start Service, and Stop Service. These buttons help monitor and control the connection from the Foundry MCP Bridge to the ComfyUI backend which is started by the Claude Desktop application.
- **Auto-start Map Generation Service** Controls whether ComfyUI service connection is automatically connected at startup of the Foundry world.
- **Generation Quality** Controls the quality of the maps generated by the SDXL checkpoints wiht ComfyUI. Low uses 8 steps of generation, Medium uses 20 steps of generation, and High uses 35 steps. The D&D Battlemaps SDXL Upscale v1.0 Checkpoint used in this image generation recommends using 35 steps but on low end GPUs or GPUs with out CUDA, this generation will take several minutes. These options can give you a trade off to have maps generated faster at the expense of quality.

## Architecture

```
Claude Desktop ↔ MCP Protocol ↔ MCP Server ↔ WebSocket ↔ Foundry Module ↔ Foundry VTT
                                     ↓
                              ComfyUI Service
                              (AI Map Generation)
```

- **Foundry Module**: Provides secure data access within Foundry VTT
- **MCP Server**: External Node.js server handling Claude Desktop communication
- **Map Generation Service**: A headless ComfyUI backend that is spawned by Claude Desktop
- **No API Keys Required**: Uses your existing Claude Desktop subscription

## Security & Permissions

- **GM-Only Access**: All functionality restricted to Game Master users
- **Configurable Permissions**: Control what data Claude can access and modify
- **Session-Based Authentication**: Uses Foundry's built-in authentication system

## System Requirements

- **Foundry VTT**: Version 13
- **Claude Desktop**: Latest version with MCP support
- **Claude Pro/Max Plan**: Required to connect to MCP servers
- **Operating System**: Windows 10/11 (installer), or other OSes/manual Windows install with Node.js 18+ (manual)
- **GPU Requirements**: A GPU with at least 8GB of VRAM

## Schema Smoke Test

The MCP schema smoke test verifies that tool schemas load correctly and do not enforce overly strict `additionalProperties` defaults.

```bash
npm -w @foundry-mcp/server run build
npm run test:mcp:schema
```

## Support & Development

- **Issues**: Report bugs on [GitHub Issues](https://github.com/adambdooley/foundry-vtt-mcp/issues)
- **YouTube Channel**: [Subscribe for updates and tutorials](https://www.youtube.com/channel/UCVrSC-FzuAk5AgvfboJj0WA)
- **Documentation**: Built with TypeScript, comprehensive documentation included
- **License**: MIT License (Additional Third Party licenses are included for bundled components for the installers)
