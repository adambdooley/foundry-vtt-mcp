/**
 * Mac Setup Installer - Auto-installs ComfyUI Desktop + Models + Foundry Module on Apple Silicon
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { Logger } from '../logger.js';
import { isAppleSilicon, isIntelMac } from '../utils/platform.js';

// ComfyUI Desktop download URLs
// Primary: Official download URL (DMG format)
const COMFYUI_OFFICIAL_DMG_URL = 'https://download.comfy.org/mac/dmg/arm64';
// Fallback: Homebrew cask API provides versioned URLs that are more stable
const HOMEBREW_CASK_API = 'https://formulae.brew.sh/api/cask/comfyui.json';
const COMFYUI_MANUAL_DOWNLOAD_URL = 'https://www.comfy.org/download';
const COMFYUI_APP_PATH = '/Applications/ComfyUI.app';
const COMFYUI_RESOURCES_PATH = `${COMFYUI_APP_PATH}/Contents/Resources/ComfyUI`;

// Model downloads (total ~13.3GB)
interface ModelFile {
  url: string;
  path: string;
  size: number;
  name: string;
}

const MODELS: Record<string, ModelFile> = {
  yaml: {
    url: 'https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.yaml',
    path: 'models/configs/dDBattlemapsSDXL10_upscaleV10.yaml',
    size: 1 * 1024, // ~1KB
    name: 'YAML Config',
  },
  sdxlBase: {
    url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors',
    path: 'models/checkpoints/sd_xl_base_1.0.safetensors',
    size: 6.5 * 1024 * 1024 * 1024, // 6.5GB
    name: 'SDXL Base Model',
  },
  vae: {
    url: 'https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors',
    path: 'models/vae/sdxl_vae.safetensors',
    size: 335 * 1024 * 1024, // 335MB
    name: 'SDXL VAE',
  },
  dndCheckpoint: {
    url: 'https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.safetensors',
    path: 'models/checkpoints/dDBattlemapsSDXL10_upscaleV10.safetensors',
    size: 6.5 * 1024 * 1024 * 1024, // 6.5GB
    name: 'D&D Battlemaps Checkpoint',
  },
  license: {
    url: 'https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/LICENSE.txt',
    path: 'models/checkpoints/dDBattlemapsSDXL10_LICENSE.txt',
    size: 1 * 1024, // ~1KB
    name: 'License File',
  },
};

export interface SetupProgress {
  stage:
    | 'idle'
    | 'checking'
    | 'downloading_comfyui'
    | 'installing_comfyui'
    | 'downloading_models'
    | 'installing_foundry_module'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  message: string;
  currentFile?: string;
  error?: string;
}

export class MacInstaller {
  private logger: Logger;
  private progressCallback?: (progress: SetupProgress) => void;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'MacInstaller' });
  }

  setProgressCallback(callback: (progress: SetupProgress) => void) {
    this.progressCallback = callback;
  }

  private updateProgress(progress: SetupProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
    this.logger.info('Setup progress', progress);
  }

  /**
   * Check if ComfyUI is already installed
   */
  isComfyUIInstalled(): boolean {
    try {
      return fs.existsSync(COMFYUI_APP_PATH) && fs.existsSync(`${COMFYUI_RESOURCES_PATH}/main.py`);
    } catch {
      return false;
    }
  }

  /**
   * Check if all models are installed
   */
  areModelsInstalled(): boolean {
    try {
      for (const model of Object.values(MODELS)) {
        const modelPath = this.getModelFullPath(model.path);
        if (!fs.existsSync(modelPath)) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full path for a model file
   */
  private getModelFullPath(relativePath: string): string {
    if (fs.existsSync(COMFYUI_RESOURCES_PATH)) {
      return path.join(COMFYUI_RESOURCES_PATH, relativePath);
    }

    const home = process.env.HOME || '/tmp';
    return path.join(home, 'Library', 'Application Support', 'ComfyUI', relativePath);
  }

  /**
   * Detect Foundry VTT installation
   */
  detectFoundryInstallation(): string | null {
    const home = process.env.HOME;
    if (!home) return null;

    const possiblePaths = [
      path.join(home, 'Library', 'Application Support', 'FoundryVTT', 'Data', 'modules'),
      path.join(home, 'FoundryVTT', 'Data', 'modules'),
      '/Applications/FoundryVTT/Data/modules',
    ];

    for (const foundryPath of possiblePaths) {
      if (fs.existsSync(foundryPath)) {
        this.logger.info('Found Foundry VTT installation', { path: foundryPath });
        return foundryPath;
      }
    }

    return null;
  }

  /**
   * Install Foundry MCP Bridge module
   */
  async installFoundryModule(): Promise<{ success: boolean; message: string }> {
    this.updateProgress({
      stage: 'installing_foundry_module',
      progress: 0,
      message: 'Detecting Foundry VTT installation...',
    });

    const foundryModulesPath = this.detectFoundryInstallation();

    if (!foundryModulesPath) {
      return {
        success: false,
        message:
          'Foundry VTT not found. Please install Foundry VTT from https://foundryvtt.com/ and rerun setup.',
      };
    }

    const moduleDestPath = path.join(foundryModulesPath, 'foundry-mcp-bridge');

    // Check if module already exists
    if (fs.existsSync(path.join(moduleDestPath, 'module.json'))) {
      this.logger.info('Foundry module already installed', { path: moduleDestPath });
      return {
        success: true,
        message: 'Foundry module already installed',
      };
    }

    try {
      this.updateProgress({
        stage: 'installing_foundry_module',
        progress: 50,
        message: 'Installing Foundry MCP Bridge module...',
      });

      // Find the bundled module (should be in Resources)
      // resourcesPath is added by Electron but not in Node types
      const resourcesPath =
        (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ||
        path.join(__dirname, '..', '..', '..', 'Resources');
      const moduleSourcePath = path.join(resourcesPath, 'foundry-module');

      if (!fs.existsSync(moduleSourcePath)) {
        throw new Error(`Module source not found at ${moduleSourcePath}`);
      }

      // Copy module files
      this.copyRecursiveSync(moduleSourcePath, moduleDestPath);

      this.updateProgress({
        stage: 'installing_foundry_module',
        progress: 100,
        message: 'Foundry module installed successfully',
      });

      return {
        success: true,
        message: `Module installed to ${moduleDestPath}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to install Foundry module', { error: message });
      return {
        success: false,
        message: `Failed to install module: ${message}`,
      };
    }
  }

  /**
   * Recursively copy directory
   */
  private copyRecursiveSync(src: string, dest: string) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats && stats.isDirectory();

    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.readdirSync(src).forEach(childItemName => {
        this.copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  /**
   * Check if this Mac can run ComfyUI (Apple Silicon only)
   */
  canRunComfyUI(): { canRun: boolean; reason?: string } {
    if (isIntelMac()) {
      return {
        canRun: false,
        reason: 'ComfyUI requires Apple Silicon (M1/M2/M3/M4). Intel Macs are not supported.',
      };
    }

    if (!isAppleSilicon()) {
      return {
        canRun: false,
        reason: 'ComfyUI is only available for macOS with Apple Silicon.',
      };
    }

    return { canRun: true };
  }

  /**
   * Get the ComfyUI download URL
   * Tries official DMG first, falls back to Homebrew cask API if that fails
   */
  private async getComfyUIDownloadUrl(): Promise<{ url: string; isDmg: boolean }> {
    // Try official DMG URL first
    try {
      this.logger.info('Checking official ComfyUI download URL...');
      const headResponse = await axios.head(COMFYUI_OFFICIAL_DMG_URL, {
        timeout: 10000,
        maxRedirects: 5,
      });
      if (headResponse.status === 200) {
        this.logger.info('Official DMG URL is available', { url: COMFYUI_OFFICIAL_DMG_URL });
        return { url: COMFYUI_OFFICIAL_DMG_URL, isDmg: true };
      }
    } catch (error) {
      this.logger.warn('Official DMG URL not available, trying Homebrew API', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback to Homebrew cask API for versioned URL
    try {
      this.logger.info('Fetching ComfyUI download URL from Homebrew cask API...');
      const response = await axios.get(HOMEBREW_CASK_API, { timeout: 10000 });
      const url = response.data?.url;
      if (url && typeof url === 'string') {
        this.logger.info('Got ComfyUI download URL from Homebrew', { url });
        const isDmg = url.toLowerCase().endsWith('.dmg');
        return { url, isDmg };
      }
    } catch (error) {
      this.logger.error('Failed to fetch from Homebrew API', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Both methods failed
    throw new Error('Failed to get ComfyUI download URL');
  }

  /**
   * Download ComfyUI Desktop (DMG or ZIP)
   * Returns whether the downloaded file is a DMG
   */
  async downloadComfyUI(downloadPath: string): Promise<boolean> {
    this.updateProgress({
      stage: 'downloading_comfyui',
      progress: 0,
      message: 'Checking download sources...',
    });

    const { url: downloadUrl, isDmg } = await this.getComfyUIDownloadUrl();

    // Ensure correct extension on download path
    const extension = isDmg ? '.dmg' : '.zip';
    const actualPath = downloadPath.replace(/\.(dmg|zip)$/, '') + extension;

    this.updateProgress({
      stage: 'downloading_comfyui',
      progress: 0,
      message: `Downloading ComfyUI Desktop (~160MB)...`,
    });

    try {
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        maxRedirects: 5,
      });

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      const writer = fs.createWriteStream(actualPath);

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

        this.updateProgress({
          stage: 'downloading_comfyui',
          progress,
          message: `Downloading ComfyUI Desktop... ${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`,
        });
      });

      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      this.logger.info('ComfyUI Desktop downloaded successfully', { path: actualPath, isDmg });
      return isDmg;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to download ComfyUI', { error: message });

      // Provide helpful error message with manual download instructions
      throw new Error(
        `Failed to download ComfyUI Desktop: ${message}\n\n` +
          `The automatic download may be temporarily unavailable.\n` +
          `Please try one of these alternatives:\n` +
          `1. Visit ${COMFYUI_MANUAL_DOWNLOAD_URL} and download manually\n` +
          `2. Install via Homebrew: brew install comfyui\n` +
          `3. Clone from GitHub: git clone https://github.com/comfyanonymous/ComfyUI.git`
      );
    }
  }

  /**
   * Install ComfyUI from ZIP or DMG
   */
  async installComfyUI(archivePath: string): Promise<void> {
    this.updateProgress({
      stage: 'installing_comfyui',
      progress: 0,
      message: 'Installing ComfyUI Desktop...',
    });

    const isZip = archivePath.endsWith('.zip');

    try {
      if (isZip) {
        // Handle ZIP format (from Homebrew cask / ToDesktop)
        this.logger.info('Extracting ZIP', { path: archivePath });

        // Create temp directory for extraction
        const tmpDir = process.env.TMPDIR || '/tmp';
        const extractDir = path.join(tmpDir, 'comfyui-extract');

        // Clean up any previous extraction
        if (fs.existsSync(extractDir)) {
          execSync(`rm -rf "${extractDir}"`, { encoding: 'utf8' });
        }
        fs.mkdirSync(extractDir, { recursive: true });

        this.updateProgress({
          stage: 'installing_comfyui',
          progress: 30,
          message: 'Extracting ComfyUI...',
        });

        // Extract ZIP
        execSync(`unzip -q "${archivePath}" -d "${extractDir}"`, { encoding: 'utf8' });

        this.updateProgress({
          stage: 'installing_comfyui',
          progress: 50,
          message: 'Copying ComfyUI to Applications...',
        });

        // Find ComfyUI.app in extracted contents
        const appPath = path.join(extractDir, 'ComfyUI.app');
        if (!fs.existsSync(appPath)) {
          // Sometimes the app is nested in a folder
          const files = fs.readdirSync(extractDir);
          let foundApp = false;
          for (const file of files) {
            const nestedApp = path.join(extractDir, file, 'ComfyUI.app');
            if (fs.existsSync(nestedApp)) {
              execSync(`cp -R "${nestedApp}" /Applications/`, { encoding: 'utf8' });
              foundApp = true;
              break;
            }
            // Check if the file itself is the app
            if (file === 'ComfyUI.app') {
              execSync(`cp -R "${path.join(extractDir, file)}" /Applications/`, {
                encoding: 'utf8',
              });
              foundApp = true;
              break;
            }
          }
          if (!foundApp) {
            throw new Error(
              `ComfyUI.app not found in extracted archive. Contents: ${files.join(', ')}`
            );
          }
        } else {
          execSync(`cp -R "${appPath}" /Applications/`, { encoding: 'utf8' });
        }

        this.logger.info('ComfyUI copied to Applications');

        this.updateProgress({
          stage: 'installing_comfyui',
          progress: 90,
          message: 'Cleaning up...',
        });

        // Clean up extraction directory
        execSync(`rm -rf "${extractDir}"`, { encoding: 'utf8' });
      } else {
        // Handle DMG format (legacy)
        this.logger.info('Mounting DMG', { path: archivePath });
        const mountOutput = execSync(`hdiutil attach "${archivePath}" -nobrowse -noverify`, {
          encoding: 'utf8',
        });

        // Parse mount output to find volume path
        const lines = mountOutput.split('\n');
        let volumePath = '';
        for (const line of lines) {
          if (line.includes('/Volumes/')) {
            const match = line.match(/\/Volumes\/[^\s]+/);
            if (match) {
              volumePath = match[0];
              break;
            }
          }
        }

        if (!volumePath) {
          throw new Error('Failed to find mounted volume path');
        }

        this.logger.info('DMG mounted', { volume: volumePath });

        this.updateProgress({
          stage: 'installing_comfyui',
          progress: 50,
          message: 'Copying ComfyUI to Applications...',
        });

        // Find ComfyUI.app in mounted volume
        const appPath = `${volumePath}/ComfyUI.app`;
        if (!fs.existsSync(appPath)) {
          throw new Error(`ComfyUI.app not found in mounted volume: ${volumePath}`);
        }

        // Copy to /Applications
        execSync(`cp -R "${appPath}" /Applications/`, { encoding: 'utf8' });

        this.logger.info('ComfyUI copied to Applications');

        this.updateProgress({
          stage: 'installing_comfyui',
          progress: 90,
          message: 'Cleaning up...',
        });

        // Unmount DMG
        execSync(`hdiutil detach "${volumePath}"`, { encoding: 'utf8' });

        this.logger.info('DMG unmounted');
      }

      this.updateProgress({
        stage: 'installing_comfyui',
        progress: 100,
        message: 'ComfyUI installed successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to install ComfyUI', { error: message });
      throw new Error(`Failed to install ComfyUI: ${message}`);
    }
  }

  /**
   * Download a single model file
   */
  private async downloadFile(
    url: string,
    destPath: string,
    displayName: string,
    modelSize: number
  ): Promise<void> {
    // Create directory if it doesn't exist
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        maxRedirects: 5,
      });

      const totalSize = parseInt(response.headers['content-length'] || '0', 10) || modelSize;
      let downloadedSize = 0;

      const writer = fs.createWriteStream(destPath);

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

        const sizeFormatted =
          totalSize > 1024 * 1024 * 1024
            ? `${(downloadedSize / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB`
            : `${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`;

        this.updateProgress({
          stage: 'downloading_models',
          progress,
          message: `Downloading ${displayName}...`,
          currentFile: `${displayName} - ${sizeFormatted}`,
        });
      });

      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      this.logger.info('File downloaded successfully', { file: displayName, path: destPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to download file', { file: displayName, error: message });
      throw new Error(`Failed to download ${displayName}: ${message}`);
    }
  }

  /**
   * Download all required models
   */
  async downloadModels(): Promise<void> {
    const modelEntries = Object.entries(MODELS);
    const totalModels = modelEntries.length;

    for (let i = 0; i < totalModels; i++) {
      const [key, model] = modelEntries[i];
      const modelPath = this.getModelFullPath(model.path);

      // Skip if already exists
      if (fs.existsSync(modelPath)) {
        this.logger.info('Model already exists, skipping', { model: model.name });
        continue;
      }

      this.updateProgress({
        stage: 'downloading_models',
        progress: Math.round((i / totalModels) * 100),
        message: `Downloading ${model.name} (${i + 1}/${totalModels})...`,
        currentFile: model.name,
      });

      await this.downloadFile(model.url, modelPath, model.name, model.size);
    }

    this.updateProgress({
      stage: 'downloading_models',
      progress: 100,
      message: 'All models downloaded successfully',
    });
  }

  /**
   * Run complete setup process
   */
  async runSetup(
    options: { skipComfyUI?: boolean; skipModels?: boolean; skipFoundryModule?: boolean } = {}
  ): Promise<void> {
    try {
      this.updateProgress({
        stage: 'checking',
        progress: 0,
        message: 'Checking system compatibility...',
      });

      // Check if Apple Silicon
      const { canRun, reason } = this.canRunComfyUI();
      if (!canRun) {
        throw new Error(reason);
      }

      // Check current state
      const comfyUIInstalled = this.isComfyUIInstalled();
      const modelsInstalled = this.areModelsInstalled();

      this.logger.info('Setup status', { comfyUIInstalled, modelsInstalled });

      // Install ComfyUI if needed
      if (!comfyUIInstalled && !options.skipComfyUI) {
        const tmpDir = process.env.TMPDIR || '/tmp';
        // Download will determine format (DMG or ZIP) based on what's available
        const basePath = path.join(tmpDir, 'ComfyUI');

        const isDmg = await this.downloadComfyUI(basePath);
        const archivePath = isDmg ? `${basePath}.dmg` : `${basePath}.zip`;

        await this.installComfyUI(archivePath);

        // Clean up archive
        if (fs.existsSync(archivePath)) {
          fs.unlinkSync(archivePath);
        }
      } else if (comfyUIInstalled) {
        this.logger.info('ComfyUI already installed, skipping');
      }

      // Download models if needed
      if (!modelsInstalled && !options.skipModels) {
        await this.downloadModels();
      } else if (modelsInstalled) {
        this.logger.info('Models already installed, skipping');
      }

      // Install Foundry module if needed
      if (!options.skipFoundryModule) {
        const moduleResult = await this.installFoundryModule();
        this.logger.info('Foundry module installation result', moduleResult);
      }

      this.updateProgress({
        stage: 'complete',
        progress: 100,
        message: 'Setup complete! AI map generation is ready.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.updateProgress({
        stage: 'error',
        progress: 0,
        message: 'Setup failed',
        error: message,
      });
      throw error;
    }
  }

  /**
   * Get setup status
   */
  getSetupStatus(): {
    canRun: boolean;
    reason?: string | undefined;
    comfyUIInstalled: boolean;
    modelsInstalled: boolean;
    foundryDetected: boolean;
    ready: boolean;
  } {
    const { canRun, reason } = this.canRunComfyUI();
    const comfyUIInstalled = this.isComfyUIInstalled();
    const modelsInstalled = this.areModelsInstalled();
    const foundryDetected = this.detectFoundryInstallation() !== null;

    return {
      canRun,
      reason: reason || undefined,
      comfyUIInstalled,
      modelsInstalled,
      foundryDetected,
      ready: canRun && comfyUIInstalled && modelsInstalled,
    };
  }
}
