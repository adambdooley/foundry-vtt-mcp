/**
 * Cross-platform utilities for detecting OS and providing platform-specific paths
 */

export type Platform = 'win32' | 'darwin' | 'linux';

export function getPlatform(): Platform {
  return process.platform as Platform;
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function isMac(): boolean {
  return process.platform === 'darwin';
}

export function isLinux(): boolean {
  return process.platform === 'linux';
}

/**
 * Get the default Claude Desktop config directory for the current platform
 */
export function getClaudeConfigDir(): string {
  const platform = getPlatform();

  switch (platform) {
    case 'win32':
      return process.env.APPDATA
        ? `${process.env.APPDATA}\\Claude`
        : 'C:\\Users\\Default\\AppData\\Roaming\\Claude';

    case 'darwin':
      return `${process.env.HOME}/Library/Application Support/Claude`;

    case 'linux':
      return `${process.env.HOME}/.config/Claude`;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the default Foundry VTT data directory for the current platform
 */
export function getFoundryDataDir(): string {
  const platform = getPlatform();

  switch (platform) {
    case 'win32':
      return process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\FoundryVTT\\Data`
        : 'C:\\Users\\Default\\AppData\\Local\\FoundryVTT\\Data';

    case 'darwin':
      return `${process.env.HOME}/Library/Application Support/FoundryVTT/Data`;

    case 'linux':
      return `${process.env.HOME}/.local/share/FoundryVTT/Data`;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the default application data directory for this MCP server
 */
export function getAppDataDir(): string {
  const platform = getPlatform();

  switch (platform) {
    case 'win32':
      return process.env.LOCALAPPDATA
        ? `${process.env.LOCALAPPDATA}\\FoundryMCPServer`
        : 'C:\\Users\\Default\\AppData\\Local\\FoundryMCPServer';

    case 'darwin':
      return `${process.env.HOME}/Library/Application Support/FoundryMCPServer`;

    case 'linux':
      return `${process.env.HOME}/.local/share/FoundryMCPServer`;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Get the default ComfyUI installation directory for the current platform
 */
export function getDefaultComfyUIDir(): string {
  const appDataDir = getAppDataDir();

  // Both Windows and Mac use the same relative path structure
  return `${appDataDir}/ComfyUI-headless`;
}

/**
 * Get platform-specific spawn options for running a hidden background process
 */
export function getHiddenProcessSpawnOptions(): {
  detached: boolean;
  stdio: 'ignore' | Array<'ignore' | 'pipe'>;
  windowsHide?: boolean;
} {
  const platform = getPlatform();

  if (platform === 'win32') {
    return {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    };
  } else {
    // Mac and Linux: detached + ignore stdio to prevent terminal window
    return {
      detached: true,
      stdio: 'ignore',
    };
  }
}

/**
 * Check if running on Apple Silicon (ARM64 Mac)
 */
export function isAppleSilicon(): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64';
}

/**
 * Check if running on Intel Mac
 */
export function isIntelMac(): boolean {
  return process.platform === 'darwin' && process.arch === 'x64';
}
