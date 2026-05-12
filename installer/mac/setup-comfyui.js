#!/usr/bin/env node

/**
 * Foundry MCP Server - ComfyUI Setup Script for Mac
 *
 * This script downloads and installs:
 * - ComfyUI Desktop (200MB)
 * - SDXL Base Model (6.5GB)
 * - SDXL VAE (335MB)
 * - D&D Battlemaps Model (6.5GB)
 * - Config files and license
 *
 * Total download: ~13.5GB
 * Run this ONCE after installing the MCP server.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { execSync } = require('child_process');

// Setup logging to both console and file
const LOG_FILE = path.join(process.env.HOME || '/tmp', 'foundry-mcp-install.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(message);
  logStream.write(logMessage + '\n');
}

function logError(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ERROR: ${message}`;
  console.error(message);
  logStream.write(logMessage + '\n');
}

log('🍎 Foundry MCP Server - ComfyUI Setup for Mac');
log('==============================================\n');
log(`📝 Install log: ${LOG_FILE}\n`);

// Check if Apple Silicon (works even under Rosetta)
const platform = process.platform;

if (platform !== 'darwin') {
  logError('❌ This script is only for macOS');
  process.exit(1);
}

// Use sysctl to detect actual hardware (process.arch returns x86_64 under Rosetta)
let cpuBrand = '';
try {
  cpuBrand = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
} catch (err) {
  logError('❌ Could not detect CPU type');
  process.exit(1);
}

if (cpuBrand.includes('Intel')) {
  logError('❌ ComfyUI requires Apple Silicon (M1/M2/M3/M4)');
  logError('   Your Mac has an Intel processor and cannot run ComfyUI efficiently.');
  logError('   You can still use all other MCP tools!');
  process.exit(1);
}

log(`✅ Apple Silicon detected: ${cpuBrand}`);
log('');

// Configuration
const COMFYUI_DMG_URL = 'https://download.comfy.org/mac/dmg/arm64';
const COMFYUI_APP_PATH = '/Applications/ComfyUI.app';
const HOME = process.env.HOME || process.env.USER_HOME || '/Users/' + process.env.USER;
// Use Application Support for models to avoid breaking code signature
const COMFYUI_MODELS_BASE = `${HOME}/Library/Application Support/ComfyUI/models`;
const COMFYUI_CONFIG_DIR = `${HOME}/Library/Application Support/ComfyUI`;

const MODELS = [
  {
    name: 'YAML Config',
    url: 'https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.yaml',
    path: 'configs/dDBattlemapsSDXL10_upscaleV10.yaml',
    size: '1KB',
  },
  {
    name: 'SDXL Base Model',
    url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors',
    path: 'checkpoints/sd_xl_base_1.0.safetensors',
    size: '6.5GB',
  },
  {
    name: 'SDXL VAE',
    url: 'https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors',
    path: 'vae/sdxl_vae.safetensors',
    size: '335MB',
  },
  {
    name: 'D&D Battlemaps Checkpoint',
    url: 'https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.safetensors',
    path: 'checkpoints/dDBattlemapsSDXL10_upscaleV10.safetensors',
    size: '6.5GB',
  },
  {
    name: 'License File',
    url: 'https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/raw/main/license.txt',
    path: 'checkpoints/dDBattlemapsSDXL10_LICENSE.txt',
    size: '1KB',
  },
];

// Helper: Download file with progress using curl (much more reliable than Node.js https)
function downloadFile(url, dest, displayName) {
  return new Promise((resolve, reject) => {
    log(`📥 Downloading ${displayName}...`);
    log(`   URL: ${url}`);

    // Use curl with: -L (follow redirects), -o (output file), -# (progress bar), --fail (fail on HTTP errors)
    const curlCommand = `curl -L -o "${dest}" "${url}" --fail --max-time 600`;

    try {
      // Show progress and run curl
      log(`   Starting download...`);
      execSync(curlCommand, { stdio: 'inherit' });

      // Verify the file was downloaded
      if (!fs.existsSync(dest)) {
        return reject(new Error(`File does not exist after download: ${dest}`));
      }

      const stats = fs.statSync(dest);
      const actualSize = stats.size;

      if (actualSize === 0) {
        fs.unlinkSync(dest);
        return reject(new Error(`Downloaded file is empty (0 bytes)`));
      }

      const sizeMB = (actualSize / 1024 / 1024).toFixed(1);
      log(`✅ Downloaded ${displayName} (${sizeMB}MB)`);
      log(`   Saved to: ${dest}`);
      resolve();
    } catch (err) {
      // Clean up failed download
      if (fs.existsSync(dest)) {
        try {
          fs.unlinkSync(dest);
        } catch (unlinkErr) {
          // Ignore unlink errors
        }
      }
      reject(new Error(`Download failed: ${err.message}`));
    }
  });
}

// Step 1: Check/Install ComfyUI
async function installComfyUI() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 1: ComfyUI Desktop Installation');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (fs.existsSync(COMFYUI_APP_PATH)) {
    log('✅ ComfyUI already installed at /Applications/ComfyUI.app');
    log('');
    return true;
  }

  log('ComfyUI not found. Downloading (~200MB)...');
  log('This will take a few minutes depending on your connection speed.');
  log('');

  const tmpDir = process.env.TMPDIR || '/tmp';
  const dmgPath = path.join(tmpDir, 'ComfyUI.dmg');

  try {
    await downloadFile(COMFYUI_DMG_URL, dmgPath, 'ComfyUI Desktop');

    log('\n📦 Installing ComfyUI...');

    // Mount DMG
    log('   Mounting DMG image...');
    const mountOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse -noverify`, {
      encoding: 'utf8',
    });
    const volumeMatch = mountOutput.match(/\/Volumes\/([^\n]+)/);

    if (!volumeMatch) {
      throw new Error('Failed to mount DMG');
    }

    const volumePath = volumeMatch[0].trim();
    log(`   Mounted at ${volumePath}`);

    // Find ComfyUI.app in the mounted volume (it should be in the root)
    const appPath = path.join(volumePath, 'ComfyUI.app');

    // Verify the app exists
    if (!fs.existsSync(appPath)) {
      throw new Error(`ComfyUI.app not found at ${appPath}`);
    }

    log('   Copying ComfyUI.app to /Applications...');
    execSync(`cp -R "${appPath}" /Applications/`);
    log('   Copied to /Applications');

    // Remove quarantine and all extended attributes so macOS doesn't block it
    log('   Removing security attributes...');
    try {
      // Remove all extended attributes recursively
      execSync(`xattr -cr /Applications/ComfyUI.app`);
      log('   Extended attributes cleared');
    } catch (err) {
      log('   ⚠️  Could not clear attributes (may require user approval on first launch)');
    }

    // Unmount
    log('   Unmounting DMG...');
    execSync(`hdiutil detach "${volumePath}"`);

    // Clean up
    fs.unlinkSync(dmgPath);

    log('✅ ComfyUI installed successfully\n');
    return true;
  } catch (error) {
    logError(`❌ Failed to install ComfyUI: ${error.message}`);
    logError('\nYou can install manually from: https://www.comfy.org/download\n');
    return false;
  }
}

// Step 2: Download Models
async function downloadModels() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 2: AI Model Downloads (~13.3GB)');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Create models directory in Application Support (avoids breaking app signature)
  if (!fs.existsSync(COMFYUI_MODELS_BASE)) {
    log(`Creating models directory: ${COMFYUI_MODELS_BASE}`);
    fs.mkdirSync(COMFYUI_MODELS_BASE, { recursive: true });
  }

  log('This will download 5 files (~13.3GB total)');
  log('Estimated time: 20-30 minutes on a fast connection');
  log('⏳ Please be patient - this is a large download!\n');

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    const destPath = path.join(COMFYUI_MODELS_BASE, model.path);
    const destDir = path.dirname(destPath);

    log(`[${i + 1}/${MODELS.length}] ${model.name} (${model.size})`);

    // Check if already exists
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      log(`   ✅ Already exists (${sizeMB}MB), skipping\n`);
      continue;
    }

    // Create directory
    if (!fs.existsSync(destDir)) {
      log(`   Creating directory: ${destDir}`);
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Download
    try {
      await downloadFile(model.url, destPath, model.name);
      log('');
    } catch (error) {
      logError(`   ❌ Failed: ${error.message}\n`);
      return false;
    }
  }

  log('✅ All models downloaded successfully\n');

  // Create extra_models_config.yaml to point ComfyUI to our models
  log('Creating ComfyUI configuration...');
  const configPath = path.join(COMFYUI_CONFIG_DIR, 'extra_models_config.yaml');
  const configContent = `# Foundry MCP Server - Custom Models Configuration
comfyui:
  base_path: ${COMFYUI_MODELS_BASE}
  checkpoints: checkpoints/
  clip: clip/
  clip_vision: clip_vision/
  configs: configs/
  controlnet: controlnet/
  embeddings: embeddings/
  loras: loras/
  upscale_models: upscale_models/
  vae: vae/
`;

  try {
    fs.writeFileSync(configPath, configContent, 'utf8');
    log(`✅ Configuration created: ${configPath}\n`);
  } catch (err) {
    logError(`⚠️  Could not create config: ${err.message}\n`);
  }

  return true;
}

// Step 3: Install Foundry Module (optional)
function installFoundryModule() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 3: Foundry VTT Module Installation');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const home = process.env.HOME;
  const possiblePaths = [
    `${home}/Library/Application Support/FoundryVTT/Data/modules`,
    `${home}/FoundryVTT/Data/modules`,
    '/Applications/FoundryVTT/Data/modules',
  ];

  let foundryPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      foundryPath = p;
      break;
    }
  }

  if (!foundryPath) {
    log('⚠️  Foundry VTT not detected');
    log('   Install Foundry VTT from: https://foundryvtt.com/');
    log('   The module will be auto-installed when you connect to Foundry\n');
    return false;
  }

  log(`✅ Foundry VTT detected at ${foundryPath}`);

  const modulePath = path.join(foundryPath, 'foundry-mcp-bridge');
  if (fs.existsSync(path.join(modulePath, 'module.json'))) {
    log('✅ Module already installed\n');
    return true;
  }

  // Try to find module in app bundle
  const resourcesPath = path.join(__dirname, '..', 'Resources', 'foundry-module');
  if (!fs.existsSync(resourcesPath)) {
    log('⚠️  Module files not found in app bundle');
    log('   Module will be auto-installed when you connect to Foundry\n');
    return false;
  }

  try {
    // Copy module
    execSync(`cp -R "${resourcesPath}" "${modulePath}"`);
    log('✅ Module installed successfully\n');
    return true;
  } catch (error) {
    log(`⚠️  Could not install module: ${error.message}`);
    log('   Module will be auto-installed when you connect to Foundry\n');
    return false;
  }
}

// Main setup process
async function main() {
  log('This script will:');
  log('1. Install ComfyUI Desktop (~200MB)');
  log('2. Download AI models (~13.3GB)');
  log('3. Install Foundry VTT module (if Foundry detected)');
  log('');
  log('⚠️  Total download: ~13.5GB');
  log('⚠️  Estimated time: 30-40 minutes');
  log('');
  log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  const comfyUISuccess = await installComfyUI();
  if (!comfyUISuccess) {
    log('\n❌ Setup failed at ComfyUI installation');
    log('Please install ComfyUI manually and run this script again\n');
    process.exit(1);
  }

  const modelsSuccess = await downloadModels();
  if (!modelsSuccess) {
    log('\n❌ Setup failed at model downloads');
    log('You can try running this script again to resume\n');
    process.exit(1);
  }

  installFoundryModule();

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('✅ Setup Complete!');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  log('Next steps:');
  log('1. Restart Claude Desktop');
  log('2. Open Foundry VTT and enable "Foundry MCP Bridge" module');
  log('3. In Claude, you can now generate AI battlemaps!');
  log('');
  log('To test: Ask Claude to "generate a forest clearing battlemap"');
  log('');
  log(`📝 Full install log saved to: ${LOG_FILE}`);
  log('');

  // Close log stream
  logStream.end();
}

main().catch(error => {
  logError('\n❌ Unexpected error:', error.message);
  logStream.end();
  process.exit(1);
});
