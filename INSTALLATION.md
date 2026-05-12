# Foundry VTT AI Model Integration - Installation Guide

## Overview

This guide covers the complete installation of the Foundry VTT AI Model Integration system, which consists of two components:

1. **Foundry Module**: Installed through Foundry VTT's module manager
2. **MCP Server**: Standalone application that bridges Foundry VTT with AI models

## Prerequisites

- **Foundry VTT**: v13
- **AI Model Access**: Claude Desktop
- **Operating System**: Windows 10+
- **Node.js**: Version 18+ (for MCP Server)

### Option 1: Windows Installer (Recommended)

1. Download the latest `FoundryMCPServer-Setup.exe` from [Releases](https://github.com/adambdooley/foundry-vtt-mcp/releases)
2. Run the installer - it will:
   - Install the MCP server with bundled Node.js runtime
   - Configure Claude Desktop automatically
   - Optionally install the Foundry module to your VTT installation
3. Restart Claude Desktop
4. Enable "Foundry MCP Bridge" in your Foundry Module Management

### Option 2: Manual Installation

#### Install the Foundry Module

1. Open Foundry VTT (v13 or v14)
2. Select install module in the Foundry Add-ons menu
3. At the bottom of the window, add the Manifest URL as: https://github.com/adambdooley/foundry-vtt-mcp/blob/master/packages/foundry-module/module.json and click install
4. Enable "Foundry MCP Bridge" in Module Management

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

## Part 3: Configuration

### 1. Configure MCP Server

1. **Launch Claude Desktop**
2. **Verify foundry-mcp status** Should be listed in "Search and Tools" menu
3. **Check firewall settings** - ensure port 31415 is accessible
4. **Keep the application running** - it needs to stay active for AI integration

### 2. Configure Foundry Module

1. **In Foundry VTT**, go to **Settings** → **Module Settings** → **Foundry MCP Bridge**
2. **Enable MCP Bridge**: Toggle to "Enabled"
3. **Configure connection settings**:
   - **MCP Host**: `localhost` (default) or set to a remote MCP server
   - **MCP Port**: `31415` (default)
4. **Permission Settings**:
   - **Allow Write Operations**: Enable for actor creation and journal management
   - **Enable Enhanced Creature Index**: Enabled by default for better compendium searches
5. **Save settings** and verify connection

## Part 4: Verification & Testing

### 1. Test MCP Server Connection

1. **Check MCP Server status** in the Foundry MCP Bridge Module settings paged
2. **Verify port 31415** is listening:
   - **Windows**: `netstat -an | findstr 31415`
   - **macOS/Linux**: `netstat -an | grep 31415`

### 2. Test Foundry Module

1. **In Foundry VTT**, check the **Console** (F12) for connection messages
2. **Look for**: `[foundry-mcp-bridge] GM connection established`
3. **Verify settings menu** shows "Connected" status

### 3. Test Claude Connection

1. **In Claude Desktop**, verify "foundry-mcp" appears in the MCP connection list
2. **Test basic queries**:
   - "List all characters in my Foundry world"
   - "Search for dragons in the compendium"
   - "What's the current scene in Foundry?"
3. **Verify responses** contain actual data from your Foundry world

### Support Channels

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/adambdooley/foundry-vtt-mcp/issues)

## Uninstallation

### Windows

1. **Disable module** in Foundry world settings
2. **Run Foundry MCP Bridge Unistaller in Add or Remove Programs** (Windows Only)
3. **Restart Claude Desktop**

### Manual

- **Foundry Module**: Uninstall in Foundry Add-ons
- **Foundry MCP Server**: Delete the folder with the server and Remove MCP server configuration from claude_desktop_config.json
