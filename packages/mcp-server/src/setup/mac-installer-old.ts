/**
 * Mac Setup Installer - Auto-installs ComfyUI Desktop on Apple Silicon
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import { Logger } from '../logger.js';
import { isAppleSilicon, isIntelMac } from '../utils/platform.js';

const COMFYUI_DOWNLOAD_URL = 'https://download.comfy.org/mac/dmg/arm64';
const COMFYUI_APP_PATH = '/Applications/ComfyUI.app';
const COMFYUI_RESOURCES_PATH = `${COMFYUI_APP_PATH}/Contents/Resources/ComfyUI`;

// D&D Battlemaps SDXL model
const MODEL_NAME = 'dnd_battlemaps_sdxl.safetensors';
const MODEL_URL =
  'https://huggingface.co/Darchi/dnd_battlemaps_sdxl/resolve/main/dnd_battlemaps_sdxl.safetensors';
const MODEL_SIZE = 2.5 * 1024 * 1024 * 1024; // 2.5GB

export interface SetupProgress {
  stage:
    | 'idle'
    | 'checking'
    | 'downloading_comfyui'
    | 'installing_comfyui'
    | 'downloading_model'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  message: string;
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
   * Check if SDXL model is installed
   */
  isModelInstalled(): boolean {
    try {
      const modelPath = this.getModelPath();
      return fs.existsSync(modelPath);
    } catch {
      return false;
    }
  }

  /**
   * Get the path where the SDXL model should be installed
   */
  getModelPath(): string {
    // Check if ComfyUI Desktop is installed
    if (fs.existsSync(COMFYUI_RESOURCES_PATH)) {
      return path.join(COMFYUI_RESOURCES_PATH, 'models', 'checkpoints', MODEL_NAME);
    }

    // Fallback to user's home directory ComfyUI
    const home = process.env.HOME || '/tmp';
    return path.join(
      home,
      'Library',
      'Application Support',
      'ComfyUI',
      'models',
      'checkpoints',
      MODEL_NAME
    );
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
   * Download ComfyUI Desktop DMG
   */
  async downloadComfyUI(downloadPath: string): Promise<void> {
    this.updateProgress({
      stage: 'downloading_comfyui',
      progress: 0,
      message: 'Downloading ComfyUI Desktop (200MB)...',
    });

    try {
      const response = await axios({
        method: 'GET',
        url: COMFYUI_DOWNLOAD_URL,
        responseType: 'stream',
        maxRedirects: 5,
      });

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      const writer = fs.createWriteStream(downloadPath);

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

      this.logger.info('ComfyUI Desktop downloaded successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to download ComfyUI', { error: message });
      throw new Error(`Failed to download ComfyUI: ${message}`);
    }
  }

  /**
   * Install ComfyUI from DMG
   */
  async installComfyUI(dmgPath: string): Promise<void> {
    this.updateProgress({
      stage: 'installing_comfyui',
      progress: 0,
      message: 'Installing ComfyUI Desktop...',
    });

    try {
      // Mount the DMG
      this.logger.info('Mounting DMG', { path: dmgPath });
      const mountOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse -noverify`, {
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
   * Download SDXL model
   */
  async downloadModel(): Promise<void> {
    const modelPath = this.getModelPath();
    const modelDir = path.dirname(modelPath);

    // Create model directory if it doesn't exist
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    this.updateProgress({
      stage: 'downloading_model',
      progress: 0,
      message: 'Downloading D&D Battlemaps SDXL model (2.5GB)...',
    });

    try {
      const response = await axios({
        method: 'GET',
        url: MODEL_URL,
        responseType: 'stream',
        maxRedirects: 5,
      });

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      const writer = fs.createWriteStream(modelPath);

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

        this.updateProgress({
          stage: 'downloading_model',
          progress,
          message: `Downloading SDXL model... ${(downloadedSize / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB`,
        });
      });

      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      this.logger.info('SDXL model downloaded successfully', { path: modelPath });

      this.updateProgress({
        stage: 'downloading_model',
        progress: 100,
        message: 'Model installed successfully',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to download model', { error: message });
      throw new Error(`Failed to download model: ${message}`);
    }
  }

  /**
   * Run complete setup process
   */
  async runSetup(options: { skipComfyUI?: boolean; skipModel?: boolean } = {}): Promise<void> {
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

      // Check ComfyUI
      const comfyUIInstalled = this.isComfyUIInstalled();
      const modelInstalled = this.isModelInstalled();

      this.logger.info('Setup status', { comfyUIInstalled, modelInstalled });

      // Install ComfyUI if needed
      if (!comfyUIInstalled && !options.skipComfyUI) {
        const tmpDir = process.env.TMPDIR || '/tmp';
        const dmgPath = path.join(tmpDir, 'ComfyUI.dmg');

        await this.downloadComfyUI(dmgPath);
        await this.installComfyUI(dmgPath);

        // Clean up DMG
        if (fs.existsSync(dmgPath)) {
          fs.unlinkSync(dmgPath);
        }
      } else if (comfyUIInstalled) {
        this.logger.info('ComfyUI already installed, skipping');
      }

      // Download model if needed
      if (!modelInstalled && !options.skipModel) {
        await this.downloadModel();
      } else if (modelInstalled) {
        this.logger.info('Model already installed, skipping');
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
    modelInstalled: boolean;
    ready: boolean;
  } {
    const { canRun, reason } = this.canRunComfyUI();
    const comfyUIInstalled = this.isComfyUIInstalled();
    const modelInstalled = this.isModelInstalled();

    return {
      canRun,
      reason: reason || undefined,
      comfyUIInstalled,
      modelInstalled,
      ready: canRun && comfyUIInstalled && modelInstalled,
    };
  }
}
