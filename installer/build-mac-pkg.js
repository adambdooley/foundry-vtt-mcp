#!/usr/bin/env node

/**
 * Mac PKG Installer Builder with Component Selection
 *
 * Creates a multi-component installer matching Windows NSIS structure:
 * 1. MCP Server (Required) - Core server + Claude config
 * 2. Foundry Module (Optional, default ON) - Foundry VTT module
 * 3. ComfyUI (Optional, default OFF) - AI map generation with models
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = process.env.VERSION || require('../package.json').version;

// Paths
const ROOT_DIR = path.join(__dirname, '..');
const BUILD_DIR = path.join(__dirname, 'build');
const MAC_DIR = path.join(__dirname, 'mac');

// Component build directories
const CORE_ROOT = path.join(BUILD_DIR, 'core-pkg-root');
const FOUNDRY_ROOT = path.join(BUILD_DIR, 'foundry-pkg-root');
const COMFYUI_ROOT = path.join(BUILD_DIR, 'comfyui-pkg-root');

// Output packages
const CORE_PKG = path.join(BUILD_DIR, 'FoundryMCP-Core.pkg');
const FOUNDRY_PKG = path.join(BUILD_DIR, 'FoundryMCP-FoundryModule.pkg');
const COMFYUI_PKG = path.join(BUILD_DIR, 'FoundryMCP-ComfyUI.pkg');
const FINAL_PKG = path.join(BUILD_DIR, `FoundryMCPServer-${VERSION}-macOS.pkg`);

console.log('🍎 Building Multi-Component Mac PKG Installer');
console.log(`Version: ${VERSION}`);
console.log('');
console.log('Components:');
console.log('  1. MCP Server (Required) - ~5MB');
console.log('  2. Foundry Module (Optional, Default ON) - ~5MB');
console.log('  3. ComfyUI AI Maps (Optional, Default ON) - ~13GB download');
console.log('');

// Helper to copy recursively
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(item => {
      copyRecursive(path.join(src, item), path.join(dest, item));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Clean build directory
console.log('📁 Cleaning build directory...');
[CORE_ROOT, FOUNDRY_ROOT, COMFYUI_ROOT].forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// COMPONENT 1: Core MCP Server (Required)
// ============================================================================
console.log('\n📦 Building Component 1: MCP Server (Required)...');

const coreAppBundle = path.join(
  CORE_ROOT,
  'Applications',
  'FoundryMCPServer.app',
  'Contents',
  'Resources'
);
fs.mkdirSync(coreAppBundle, { recursive: true });

// Copy MCP server bundles
const mcpServerDist = path.join(ROOT_DIR, 'packages', 'mcp-server', 'dist');
const mcpServerDest = path.join(coreAppBundle, 'foundry-mcp-server');
fs.mkdirSync(mcpServerDest, { recursive: true });

if (!fs.existsSync(path.join(mcpServerDist, 'backend.bundle.cjs'))) {
  console.error('❌ backend.bundle.cjs not found. Run: npm run build:bundle');
  process.exit(1);
}

fs.copyFileSync(
  path.join(mcpServerDist, 'backend.bundle.cjs'),
  path.join(mcpServerDest, 'backend.bundle.cjs')
);
fs.copyFileSync(
  path.join(mcpServerDist, 'index.bundle.cjs'),
  path.join(mcpServerDest, 'index.cjs')
);
fs.copyFileSync(
  path.join(ROOT_DIR, 'packages', 'mcp-server', 'package.json'),
  path.join(mcpServerDest, 'package.json')
);

console.log('✅ MCP Server files copied');

// Create Core postinstall script (configures Claude Desktop)
const coreScripts = path.join(BUILD_DIR, 'core-scripts');
fs.mkdirSync(coreScripts, { recursive: true });

const corePostinstall = `#!/bin/bash
# Core MCP Server postinstall - Configures Claude Desktop

set -e

CURRENT_USER=$(stat -f '%Su' /dev/console)
USER_HOME=$(eval echo ~$CURRENT_USER)

echo "Configuring Claude Desktop for user: $CURRENT_USER"

CLAUDE_CONFIG_DIR="$USER_HOME/Library/Application Support/Claude"
CLAUDE_CONFIG="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
MCP_SERVER_DIR="$USER_HOME/Library/Application Support/FoundryMCPServer"
SERVER_PATH="/Applications/FoundryMCPServer.app/Contents/Resources/foundry-mcp-server/index.cjs"

# Create Claude config directory
mkdir -p "$CLAUDE_CONFIG_DIR"
chown "$CURRENT_USER:staff" "$CLAUDE_CONFIG_DIR"

# Create MCP Server directory for logs
mkdir -p "$MCP_SERVER_DIR"
chown "$CURRENT_USER:staff" "$MCP_SERVER_DIR"

# Backup existing config
if [ -f "$CLAUDE_CONFIG" ]; then
  cp "$CLAUDE_CONFIG" "$CLAUDE_CONFIG.backup.$(date +%s)"
fi

# Write Claude config
cat > "$CLAUDE_CONFIG" <<EOF
{
  "mcpServers": {
    "foundry-mcp": {
      "command": "node",
      "args": [
        "$SERVER_PATH"
      ],
      "env": {
        "FOUNDRY_HOST": "localhost",
        "FOUNDRY_PORT": "31415"
      }
    }
  }
}
EOF

chown "$CURRENT_USER:staff" "$CLAUDE_CONFIG"
chmod 644 "$CLAUDE_CONFIG"

echo "✅ Claude Desktop configured"
exit 0
`;

fs.writeFileSync(path.join(coreScripts, 'postinstall'), corePostinstall);
fs.chmodSync(path.join(coreScripts, 'postinstall'), 0o755);

// Build core component package
execSync(
  `pkgbuild \\
  --root "${CORE_ROOT}" \\
  --scripts "${coreScripts}" \\
  --identifier com.foundry-mcp.core \\
  --version "${VERSION}" \\
  --install-location / \\
  "${CORE_PKG}"`,
  {
    stdio: 'inherit',
  }
);

console.log('✅ Core component package built');

// ============================================================================
// COMPONENT 2: Foundry Module (Optional)
// ============================================================================
console.log('\n📦 Building Component 2: Foundry Module (Optional)...');

const foundryAppBundle = path.join(
  FOUNDRY_ROOT,
  'Applications',
  'FoundryMCPServer.app',
  'Contents',
  'Resources'
);
fs.mkdirSync(foundryAppBundle, { recursive: true });

// Copy Foundry module
const moduleSourceRoot = path.join(ROOT_DIR, 'packages', 'foundry-module');
const moduleDest = path.join(foundryAppBundle, 'foundry-module');

if (!fs.existsSync(path.join(moduleSourceRoot, 'dist'))) {
  console.error('❌ Foundry module dist not found. Run: npm run build');
  process.exit(1);
}

copyRecursive(path.join(moduleSourceRoot, 'dist'), path.join(moduleDest, 'dist'));
['lang', 'styles', 'templates'].forEach(folder => {
  const srcPath = path.join(moduleSourceRoot, folder);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, path.join(moduleDest, folder));
  }
});
fs.copyFileSync(path.join(moduleSourceRoot, 'module.json'), path.join(moduleDest, 'module.json'));

console.log('✅ Foundry module files copied');

// Create Foundry postinstall script (installs module to Foundry)
const foundryScripts = path.join(BUILD_DIR, 'foundry-scripts');
fs.mkdirSync(foundryScripts, { recursive: true });

const foundryPostinstall = `#!/bin/bash
# Foundry Module postinstall - Installs module to Foundry VTT

set -e

CURRENT_USER=$(stat -f '%Su' /dev/console)
USER_HOME=$(eval echo ~$CURRENT_USER)

echo "Installing Foundry MCP Bridge module..."

MODULE_SOURCE="/Applications/FoundryMCPServer.app/Contents/Resources/foundry-module"

# Try to find Foundry VTT installation
FOUNDRY_PATHS=(
  "$USER_HOME/Library/Application Support/FoundryVTT/Data/modules"
  "$USER_HOME/FoundryVTT/Data/modules"
  "/Applications/FoundryVTT/Data/modules"
)

for FOUNDRY_PATH in "\${FOUNDRY_PATHS[@]}"; do
  if [ -d "$FOUNDRY_PATH" ]; then
    MODULE_DEST="$FOUNDRY_PATH/foundry-mcp-bridge"

    # Remove old version
    if [ -d "$MODULE_DEST" ]; then
      rm -rf "$MODULE_DEST"
    fi

    # Copy module
    cp -R "$MODULE_SOURCE" "$MODULE_DEST"
    chown -R "$CURRENT_USER:staff" "$MODULE_DEST"

    echo "✅ Foundry module installed to: $MODULE_DEST"
    exit 0
  fi
done

echo "ℹ️  Foundry VTT not detected - module will be installed on first connection"
exit 0
`;

fs.writeFileSync(path.join(foundryScripts, 'postinstall'), foundryPostinstall);
fs.chmodSync(path.join(foundryScripts, 'postinstall'), 0o755);

// Build Foundry component package
execSync(
  `pkgbuild \\
  --root "${FOUNDRY_ROOT}" \\
  --scripts "${foundryScripts}" \\
  --identifier com.foundry-mcp.foundry-module \\
  --version "${VERSION}" \\
  --install-location / \\
  "${FOUNDRY_PKG}"`,
  {
    stdio: 'inherit',
  }
);

console.log('✅ Foundry module component package built');

// ============================================================================
// COMPONENT 3: ComfyUI (Optional)
// ============================================================================
console.log('\n📦 Building Component 3: ComfyUI AI Maps (Optional)...');

const comfyuiAppBundle = path.join(
  COMFYUI_ROOT,
  'Applications',
  'FoundryMCPServer.app',
  'Contents',
  'Resources'
);
fs.mkdirSync(comfyuiAppBundle, { recursive: true });

// Copy ComfyUI setup script
const setupScript = path.join(MAC_DIR, 'setup-comfyui-headless.js');
if (!fs.existsSync(setupScript)) {
  console.error('❌ setup-comfyui-headless.js not found');
  process.exit(1);
}

fs.copyFileSync(setupScript, path.join(comfyuiAppBundle, 'setup-comfyui-headless.js'));
fs.chmodSync(path.join(comfyuiAppBundle, 'setup-comfyui-headless.js'), 0o755);

console.log('✅ ComfyUI setup script copied');

// Create ComfyUI postinstall script (runs headless setup)
const comfyuiScripts = path.join(BUILD_DIR, 'comfyui-scripts');
fs.mkdirSync(comfyuiScripts, { recursive: true });

const comfyuiPostinstall = `#!/bin/bash
# ComfyUI postinstall - Downloads and installs ComfyUI + AI models

set -e

CURRENT_USER=$(stat -f '%Su' /dev/console)
USER_HOME=$(eval echo ~$CURRENT_USER)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Installing ComfyUI AI Map Generation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This will download and install:"
echo "  - Python 3.11 (~40MB)"
echo "  - ComfyUI (~100MB)"
echo "  - PyTorch with MPS support (~2GB)"
echo "  - AI Models (~13GB)"
echo ""
echo "Total download: ~15GB"
echo "Installation time: 20-30 minutes"
echo ""

# Find node
NODE_PATH=""
if [ -f "/usr/local/bin/node" ]; then
  NODE_PATH="/usr/local/bin/node"
elif [ -f "/opt/homebrew/bin/node" ]; then
  NODE_PATH="/opt/homebrew/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_PATH=$(command -v node)
fi

if [ -z "$NODE_PATH" ]; then
  echo "❌ Node.js not found. Please install from https://nodejs.org/"
  exit 1
fi

SETUP_SCRIPT="/Applications/FoundryMCPServer.app/Contents/Resources/setup-comfyui-headless.js"

echo "Running ComfyUI setup..."
USER_HOME="$USER_HOME" CURRENT_USER="$CURRENT_USER" "$NODE_PATH" "$SETUP_SCRIPT" || {
  echo ""
  echo "⚠️  ComfyUI setup encountered an error"
  echo "You can run the setup manually later:"
  echo "  cd /Applications/FoundryMCPServer.app/Contents/Resources"
  echo "  node setup-comfyui-headless.js"
  echo ""
  echo "Installation log: $USER_HOME/foundry-mcp-install.log"
  exit 1
}

# Fix permissions on ComfyUI directory so user can run it
echo "Setting ComfyUI permissions for user: $CURRENT_USER"
chown -R "$CURRENT_USER:staff" /Applications/FoundryMCPServer.app/Contents/Resources/ComfyUI/

echo ""
echo "✅ ComfyUI installation complete"
exit 0
`;

fs.writeFileSync(path.join(comfyuiScripts, 'postinstall'), comfyuiPostinstall);
fs.chmodSync(path.join(comfyuiScripts, 'postinstall'), 0o755);

// Build ComfyUI component package
execSync(
  `pkgbuild \\
  --root "${COMFYUI_ROOT}" \\
  --scripts "${comfyuiScripts}" \\
  --identifier com.foundry-mcp.comfyui \\
  --version "${VERSION}" \\
  --install-location / \\
  "${COMFYUI_PKG}"`,
  {
    stdio: 'inherit',
  }
);

console.log('✅ ComfyUI component package built');

// ============================================================================
// Create Installer Resource Files (welcome, conclusion, license)
// ============================================================================
console.log('\n📝 Creating installer resource files...');

const welcomeHTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<h1>Welcome to Foundry MCP Server ${VERSION}</h1>
<p>This installer will set up the Foundry MCP Bridge to connect Claude Desktop with your Foundry VTT game.</p>
<h2>Components:</h2>
<ul>
<li><strong>MCP Server</strong> (Required) - Core server and Claude Desktop integration</li>
<li><strong>Foundry Module</strong> (Recommended) - Auto-install to your Foundry VTT</li>
<li><strong>ComfyUI Map Generation</strong> (Optional) - Headless AI-powered battlemap generation (~15GB)</li>
</ul>
<p><strong>Requirements:</strong> Node.js 18+, macOS 11+ (Apple Silicon recommended)</p>
</body>
</html>
`;

const conclusionHTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<h1>Installation Complete!</h1>
<h2>Next Steps:</h2>
<ol>
<li>Restart Claude Desktop</li>
<li>Launch Foundry VTT and enable "Foundry MCP Bridge" in Module Management</li>
<li>Start chatting with Claude about your Foundry world!</li>
</ol>
<p>Documentation: <a href="https://github.com/adambdooley/foundry-vtt-mcp">github.com/adambdooley/foundry-vtt-mcp</a></p>
</body>
</html>
`;

const licenseTxt = `MIT License

Copyright (c) 2024-2026 Adam Dooley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

fs.writeFileSync(path.join(BUILD_DIR, 'welcome.html'), welcomeHTML);
fs.writeFileSync(path.join(BUILD_DIR, 'conclusion.html'), conclusionHTML);
fs.writeFileSync(path.join(BUILD_DIR, 'license.txt'), licenseTxt);

console.log('✅ Resource files created');

// ============================================================================
// Create Distribution XML for Component Selection
// ============================================================================
console.log('\n📝 Creating distribution XML...');

const distributionXML = `<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>Foundry MCP Server</title>
    <organization>com.foundry-mcp</organization>
    <domains enable_localSystem="true"/>
    <options customize="always" require-scripts="true" hostArchitectures="arm64,x86_64"/>

    <welcome file="welcome.html"/>
    <license file="license.txt"/>
    <conclusion file="conclusion.html"/>

    <choices-outline>
        <line choice="core"/>
        <line choice="foundryModule"/>
        <line choice="comfyui"/>
    </choices-outline>

    <choice id="core" visible="true" enabled="false" selected="true" title="MCP Server" description="Core Foundry MCP Server and Claude Desktop integration (Required, ~5MB)">
        <pkg-ref id="com.foundry-mcp.core"/>
    </choice>
    <choice id="foundryModule" visible="true" enabled="true" start_selected="true" title="Foundry MCP Bridge" description="Foundry VTT module for Claude integration (~5MB)">
        <pkg-ref id="com.foundry-mcp.foundry-module"/>
    </choice>
    <choice id="comfyui" visible="true" enabled="true" start_selected="true" title="ComfyUI AI Map Generation" description="AI-powered battlemap generation. Downloads Python, ComfyUI, PyTorch, and AI models (~15GB total, 20-30 min install time)">
        <pkg-ref id="com.foundry-mcp.comfyui"/>
    </choice>

    <pkg-ref id="com.foundry-mcp.core" version="${VERSION}" onConclusion="none">FoundryMCP-Core.pkg</pkg-ref>
    <pkg-ref id="com.foundry-mcp.foundry-module" version="${VERSION}" onConclusion="none">FoundryMCP-FoundryModule.pkg</pkg-ref>
    <pkg-ref id="com.foundry-mcp.comfyui" version="${VERSION}" onConclusion="none">FoundryMCP-ComfyUI.pkg</pkg-ref>
</installer-gui-script>
`;

const distXMLPath = path.join(BUILD_DIR, 'distribution.xml');
fs.writeFileSync(distXMLPath, distributionXML);

console.log('✅ Distribution XML created');

// ============================================================================
// Build Final Product Package
// ============================================================================
console.log('\n🔨 Building final installer package...');

execSync(
  `productbuild \\
  --distribution "${distXMLPath}" \\
  --resources "${BUILD_DIR}" \\
  --package-path "${BUILD_DIR}" \\
  "${FINAL_PKG}"`,
  {
    stdio: 'inherit',
  }
);

console.log('✅ Final package built');

// Clean up
console.log('\n🧹 Cleaning up build artifacts...');
const cleanupItems = [
  CORE_ROOT,
  FOUNDRY_ROOT,
  COMFYUI_ROOT,
  coreScripts,
  foundryScripts,
  comfyuiScripts,
  CORE_PKG,
  FOUNDRY_PKG,
  COMFYUI_PKG,
  distXMLPath,
  path.join(BUILD_DIR, 'welcome.html'),
  path.join(BUILD_DIR, 'conclusion.html'),
  path.join(BUILD_DIR, 'license.txt'),
];
cleanupItems.forEach(item => {
  if (fs.existsSync(item)) {
    fs.rmSync(item, { recursive: true, force: true });
  }
});
console.log('✅ Build artifacts cleaned');

const stats = fs.statSync(FINAL_PKG);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Mac Installer Build Complete!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(`📦 File: ${FINAL_PKG}`);
console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
console.log('');
console.log('Components:');
console.log('  ✅ MCP Server (Required)');
console.log('  ✅ Foundry Module (Optional, Default ON)');
console.log('  ✅ ComfyUI AI Maps (Optional, Default ON)');
console.log('');
