#!/usr/bin/env node

/**
 * Foundry MCP Server - Headless ComfyUI Setup for macOS
 *
 * This script installs a portable/headless ComfyUI installation:
 * 1. Downloads and installs Python 3.11
 * 2. Downloads ComfyUI source from GitHub
 * 3. Creates virtual environment
 * 4. Installs PyTorch and dependencies
 * 5. Downloads AI models
 * 6. Creates configuration and launch scripts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Setup logging to both console and file
const HOME = process.env.HOME || process.env.USER_HOME || '/Users/' + process.env.USER;
const LOG_FILE = path.join(HOME, 'foundry-mcp-install.log');
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

log('🍎 Foundry MCP Server - Headless ComfyUI Setup for Mac');
log('========================================================\n');
log(`📝 Install log: ${LOG_FILE}\n`);

// Verify we're on macOS
const platform = os.platform();
if (platform !== 'darwin') {
  logError('❌ This script is only for macOS');
  process.exit(1);
}

// Verify Apple Silicon (use sysctl to detect actual hardware)
let cpuBrand = '';
try {
  cpuBrand = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
} catch (err) {
  logError('❌ Could not detect CPU type');
  process.exit(1);
}

if (cpuBrand.includes('Intel')) {
  logError('❌ Headless ComfyUI requires Apple Silicon (M1/M2/M3/M4)');
  logError('   Your Mac has an Intel processor');
  process.exit(1);
}

log(`✅ Apple Silicon detected: ${cpuBrand}`);
log('');

// Configuration
const INSTALL_BASE = '/Applications/FoundryMCPServer.app/Contents/Resources';
const PYTHON_VERSION = '3.11.8';
const PYTHON_PKG_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg`;
const COMFYUI_ZIP_URL = 'https://github.com/Comfy-Org/ComfyUI/archive/refs/heads/master.zip';
// Use system Python installation location - this way no path fixes are needed
const PYTHON_INSTALL_PATH = '/Library/Frameworks/Python.framework/Versions/3.11';
const COMFYUI_PATH = path.join(INSTALL_BASE, 'ComfyUI');
const MODELS_BASE = path.join(HOME, 'Library', 'Application Support', 'ComfyUI', 'models');
const CONFIG_DIR = path.join(HOME, 'Library', 'Application Support', 'ComfyUI');

// AI Models to download
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

// Helper: Download file with progress using curl
function downloadFile(url, dest, displayName) {
  return new Promise((resolve, reject) => {
    log(`📥 Downloading ${displayName}...`);
    log(`   URL: ${url}`);

    const curlCommand = `curl -L -o "${dest}" "${url}" --fail --connect-timeout 30 --speed-time 60 --speed-limit 10240`;

    try {
      log(`   Starting download...`);
      execSync(curlCommand, { stdio: 'inherit' });

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
      if (fs.existsSync(dest)) {
        try {
          fs.unlinkSync(dest);
        } catch (unlinkErr) {
          // Ignore
        }
      }
      reject(new Error(`Download failed: ${err.message}`));
    }
  });
}

// Step 1: Install Python 3.11
async function installPython() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 1: Python 3.11 Installation');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if already installed
  const pythonBin = path.join(PYTHON_INSTALL_PATH, 'bin', 'python3');
  if (fs.existsSync(pythonBin)) {
    log('✅ Python already installed');
    log('');
    return true;
  }

  log('Python not found. Downloading Python 3.11 installer (~30MB)...');
  log('');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comfyui-python-'));
  const pkgPath = path.join(tmpDir, 'python.pkg');

  try {
    await downloadFile(PYTHON_PKG_URL, pkgPath, 'Python 3.11 Installer');

    log('\n📦 Installing Python to system location...');
    log('   This will install Python 3.11 to /Library/Frameworks/Python.framework');

    // Install the PKG normally using the system installer
    // This installs to the standard location where Python expects to be
    execSync(`installer -pkg "${pkgPath}" -target /`, { stdio: 'inherit' });

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Verify installation
    const pythonExe = path.join(PYTHON_INSTALL_PATH, 'bin', 'python3');
    if (!fs.existsSync(pythonExe)) {
      throw new Error('Python installation verification failed - python3 binary not found');
    }

    log('✅ Python installed successfully\n');
    return true;
  } catch (error) {
    logError(`❌ Failed to install Python: ${error.message}`);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return false;
  }
}

// Step 2: Download and extract ComfyUI
async function installComfyUI() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 2: ComfyUI Installation');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (fs.existsSync(COMFYUI_PATH) && fs.existsSync(path.join(COMFYUI_PATH, 'main.py'))) {
    log('✅ ComfyUI already installed');
    log('');
    return true;
  }

  log('ComfyUI not found. Downloading ComfyUI source (~500MB)...');
  log('This may take a few minutes...');
  log('');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comfyui-src-'));
  const zipPath = path.join(tmpDir, 'comfyui.zip');

  try {
    await downloadFile(COMFYUI_ZIP_URL, zipPath, 'ComfyUI Source');

    log('\n📦 Extracting ComfyUI...');
    execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);

    // Find extracted directory (will be ComfyUI-master)
    const extractedDir = path.join(tmpDir, 'ComfyUI-master');
    if (!fs.existsSync(extractedDir)) {
      throw new Error('Extracted ComfyUI directory not found');
    }

    // Move to install location
    log('   Moving to install location...');
    if (fs.existsSync(COMFYUI_PATH)) {
      fs.rmSync(COMFYUI_PATH, { recursive: true, force: true });
    }
    fs.renameSync(extractedDir, COMFYUI_PATH);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });

    log('✅ ComfyUI installed successfully\n');
    return true;
  } catch (error) {
    logError(`❌ Failed to install ComfyUI: ${error.message}`);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return false;
  }
}

// Step 3: Setup Python virtual environment and install dependencies
async function setupPythonEnvironment() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 3: Python Environment Setup');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const venvPath = path.join(COMFYUI_PATH, 'venv');
  const pythonBin = path.join(PYTHON_INSTALL_PATH, 'bin', 'python3');

  // Check if venv already exists
  if (fs.existsSync(venvPath) && fs.existsSync(path.join(venvPath, 'bin', 'python'))) {
    log('✅ Virtual environment already exists');
    log('');
    return true;
  }

  try {
    log('Creating Python virtual environment...');
    execSync(`"${pythonBin}" -m venv "${venvPath}"`, { stdio: 'inherit' });
    log('✅ Virtual environment created\n');

    const venvPython = path.join(venvPath, 'bin', 'python');
    const venvPip = path.join(venvPath, 'bin', 'pip');

    log('Installing PyTorch for Apple Silicon...');
    log('This will take several minutes (~2-3GB download)...');
    log('⏳ Please be patient!\n');

    // Force ARM64 architecture for pip installations on Apple Silicon
    const pipEnv = {
      ...process.env,
      ARCHFLAGS: '-arch arm64',
      _PYTHON_HOST_PLATFORM: 'macosx-11.0-arm64',
    };

    execSync(`"${venvPip}" install --upgrade pip`, { stdio: 'inherit', env: pipEnv });
    execSync(`"${venvPip}" install torch torchvision torchaudio`, {
      stdio: 'inherit',
      cwd: COMFYUI_PATH,
      env: pipEnv,
    });
    log('\n✅ PyTorch installed\n');

    log('Installing ComfyUI dependencies...');
    log('This may take a few minutes...\n');

    const requirementsPath = path.join(COMFYUI_PATH, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      execSync(`"${venvPip}" install -r "${requirementsPath}"`, {
        stdio: 'inherit',
        cwd: COMFYUI_PATH,
        env: pipEnv,
      });
    }

    log('\n✅ Dependencies installed successfully\n');
    return true;
  } catch (error) {
    logError(`❌ Failed to setup Python environment: ${error.message}`);
    return false;
  }
}

// Step 4: Download AI models
async function downloadModels() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 4: AI Model Downloads (~13.3GB)');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!fs.existsSync(MODELS_BASE)) {
    log(`Creating models directory: ${MODELS_BASE}`);
    fs.mkdirSync(MODELS_BASE, { recursive: true });
  }

  // Fix ownership of models directory so downloads work when running as root during install
  try {
    const currentUser = process.env.CURRENT_USER || process.env.USER || process.env.LOGNAME;
    if (currentUser && currentUser !== 'root') {
      execSync(`chown -R ${currentUser}:staff "${MODELS_BASE}"`, { encoding: 'utf8' });
      log(`✅ Set ownership of models directory to ${currentUser}\n`);
    }
  } catch (err) {
    log(`⚠️  Could not change ownership: ${err.message}\n`);
  }

  log('This will download 5 files (~13.3GB total)');
  log('Estimated time: 20-30 minutes on a fast connection');
  log('⏳ Please be patient - this is a large download!\n');

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    const destPath = path.join(MODELS_BASE, model.path);
    const destDir = path.dirname(destPath);

    log(`[${i + 1}/${MODELS.length}] ${model.name} (${model.size})`);

    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      log(`   ✅ Already exists (${sizeMB}MB), skipping\n`);
      continue;
    }

    if (!fs.existsSync(destDir)) {
      log(`   Creating directory: ${destDir}`);
      fs.mkdirSync(destDir, { recursive: true });
    }

    try {
      await downloadFile(model.url, destPath, model.name);
      log('');
    } catch (error) {
      logError(`   ❌ Failed: ${error.message}\n`);
      return false;
    }
  }

  log('✅ All models downloaded successfully\n');

  // Create extra_model_paths.yaml in ComfyUI directory
  log('Creating ComfyUI model paths configuration...');
  const configPath = path.join(COMFYUI_PATH, 'extra_model_paths.yaml');
  const configContent = `# Foundry MCP Server - ComfyUI Model Paths Configuration
# Points to models installed in Application Support directory

foundry_mcp:
    base_path: ${MODELS_BASE}/
    is_default: true
    checkpoints: checkpoints/
    configs: configs/
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

// Step 5: Create launch script
function createLaunchScript() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Step 5: Creating Launch Script');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const scriptPath = path.join(INSTALL_BASE, 'start-comfyui.sh');
  const scriptContent = `#!/bin/bash
# Foundry MCP Server - ComfyUI Launcher

COMFYUI_PATH="${COMFYUI_PATH}"
PYTHON_BIN="${COMFYUI_PATH}/venv/bin/python"
MAIN_PY="${COMFYUI_PATH}/main.py"

cd "\${COMFYUI_PATH}"
exec "\${PYTHON_BIN}" "\${MAIN_PY}" --port 31411 --listen 127.0.0.1 --disable-auto-launch --dont-print-server "$@"
`;

  try {
    fs.writeFileSync(scriptPath, scriptContent, { encoding: 'utf8', mode: 0o755 });
    log(`✅ Launch script created: ${scriptPath}\n`);
    return true;
  } catch (err) {
    logError(`❌ Failed to create launch script: ${err.message}\n`);
    return false;
  }
}

// Main installation flow
async function main() {
  try {
    const step1 = await installPython();
    if (!step1) {
      logError('\n❌ Python installation failed');
      process.exit(1);
    }

    const step2 = await installComfyUI();
    if (!step2) {
      logError('\n❌ ComfyUI installation failed');
      process.exit(1);
    }

    const step3 = await setupPythonEnvironment();
    if (!step3) {
      logError('\n❌ Python environment setup failed');
      process.exit(1);
    }

    const step4 = await downloadModels();
    if (!step4) {
      logError('\n❌ Model download failed');
      process.exit(1);
    }

    const step5 = createLaunchScript();
    if (!step5) {
      logError('\n❌ Launch script creation failed');
      process.exit(1);
    }

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('✅ Setup Complete!');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    log('Headless ComfyUI is now installed and ready to use.');
    log('The MCP server will automatically start ComfyUI when needed.');
    log('');
    log(`📝 Full install log saved to: ${LOG_FILE}`);
    log('');

    logStream.end();
  } catch (error) {
    logError(`\n❌ Unexpected error: ${error.message}`);
    logStream.end();
    process.exit(1);
  }
}

main();
