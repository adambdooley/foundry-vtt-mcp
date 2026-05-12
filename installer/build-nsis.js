#!/usr/bin/env node

/**
 * Build NSIS Installer for Foundry MCP Server
 *
 * This script prepares files for NSIS installer:
 * - Downloads portable Node.js runtime
 * - Copies built MCP Server files
 * - Prepares NSIS build directory
 * - Calls NSIS to create installer
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const packageJson = require('../package.json');
let version = `v${packageJson.version}`; // default version from package.json
let skipDownload = false;
let skipNsis = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version' && i + 1 < args.length) {
    version = args[i + 1];
    i++;
    continue;
  }
  if (args[i] === '--skip-download') {
    skipDownload = true;
    continue;
  }
  if (args[i] === '--skip-nsis') {
    skipNsis = true;
    continue;
  }
}

console.log('🚀 Building Foundry MCP Server NSIS Installer\n');
console.log(`📦 Version: ${version}\n`);

// Configuration
const rootDir = path.join(__dirname, '..');
const config = {
  nodeVersion: 'v20.12.2',
  nodeArchive: 'node-v20.12.2-win-x64.zip',
  nodeUrl: 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-win-x64.zip',
  buildDir: path.join(__dirname, 'build'),
  nsisDir: path.join(__dirname, 'nsis'),
  outputDir: path.join(__dirname, 'build', 'installer-files'),
  tempDir: path.join(__dirname, 'build', 'temp'),
};

// Helper functions
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    ensureDir(dest);
    const items = fs.readdirSync(src);
    for (const item of items) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function downloadAndExtractNode() {
  console.log('📦 Preparing Node.js runtime...');

  const nodeZipPath = path.join(config.tempDir, config.nodeArchive);
  const nodeExtractPath = path.join(config.tempDir, 'node-extracted');

  if (fs.existsSync(nodeZipPath)) {
    console.log('   ✓ Node.js archive already exists, skipping download');
  } else {
    console.log(`   🌐 Downloading: ${config.nodeUrl}`);
    try {
      execSync(
        `powershell -Command "Invoke-WebRequest -Uri '${config.nodeUrl}' -OutFile '${nodeZipPath}'"`,
        {
          stdio: 'inherit',
        }
      );
      console.log('   ✓ Node.js download completed');
    } catch (error) {
      console.error('   ❌ Failed to download Node.js:', error.message);
      process.exit(1);
    }
  }

  // Extract Node.js
  console.log('   📂 Extracting Node.js...');
  ensureDir(nodeExtractPath);

  try {
    execSync(
      `powershell -Command "Expand-Archive -Path '${nodeZipPath}' -DestinationPath '${nodeExtractPath}' -Force"`,
      {
        stdio: 'inherit',
      }
    );

    const extractedItems = fs.readdirSync(nodeExtractPath);
    const nodeDir = extractedItems.find(
      item => item.startsWith('node-') && item.includes('win-x64')
    );

    if (!nodeDir) {
      throw new Error('Node.js directory not found after extraction');
    }

    const sourceNodePath = path.join(nodeExtractPath, nodeDir);
    const destNodePath = path.join(config.outputDir, 'node');

    copyRecursive(sourceNodePath, destNodePath);

    // Copy node.exe to root for easy access
    fs.copyFileSync(path.join(destNodePath, 'node.exe'), path.join(config.outputDir, 'node.exe'));

    console.log('   ✓ Node.js runtime prepared');
  } catch (error) {
    console.error('   ❌ Failed to extract Node.js:', error.message);
    process.exit(1);
  }
}

// New implementation that supports backend + shared runtime
function copyMcpServerFilesV2() {
  console.log('dY"� Preparing MCP Server files (V2)...');

  const rootDir = path.join(__dirname, '..');
  const mcpServerSource = path.join(rootDir, 'packages', 'mcp-server');
  const sharedSource = path.join(rootDir, 'shared');
  const mcpServerDest = path.join(config.outputDir, 'foundry-mcp-server');

  // Ensure MCP server was built and bundled
  const builtBundlePath = path.join(mcpServerSource, 'dist', 'index.bundle.cjs');
  if (!fs.existsSync(builtBundlePath)) {
    console.error(
      '   �?O MCP server bundle not found. Run "npm run build:bundle --workspace=packages/mcp-server" first.'
    );
    process.exit(1);
  }

  // Create directory structure
  ensureDir(path.join(mcpServerDest, 'packages', 'mcp-server'));
  ensureDir(path.join(mcpServerDest, 'shared'));

  // Copy full dist for backend and dependencies
  console.log('   dY"� Copying MCP server dist (for backend runtime)...');
  const distSrc = path.join(mcpServerSource, 'dist');
  const distDst = path.join(mcpServerDest, 'packages', 'mcp-server', 'dist');
  ensureDir(distDst);
  copyRecursive(distSrc, distDst);

  // Overwrite wrapper entry with bundled single-file for minimal deps
  console.log('   dY"� Installing bundled wrapper entry...');
  fs.copyFileSync(builtBundlePath, path.join(distDst, 'index.cjs'));

  // Also copy bundled backend if present (wrapper prefers it)
  const backendBundlePath = path.join(mcpServerSource, 'dist', 'backend.bundle.cjs');
  if (fs.existsSync(backendBundlePath)) {
    fs.copyFileSync(backendBundlePath, path.join(distDst, 'backend.bundle.cjs'));
    console.log('   �o" Bundled backend included');
  }

  // Copy server package.json
  fs.copyFileSync(
    path.join(mcpServerSource, 'package.json'),
    path.join(mcpServerDest, 'packages', 'mcp-server', 'package.json')
  );

  // Copy shared files to both a direct folder and a node_modules package for runtime resolution
  console.log('   dY"? Copying shared files...');
  copyRecursive(path.join(sharedSource, 'dist'), path.join(mcpServerDest, 'shared', 'dist'));
  fs.copyFileSync(
    path.join(sharedSource, 'package.json'),
    path.join(mcpServerDest, 'shared', 'package.json')
  );

  const sharedPkgDst = path.join(mcpServerDest, 'node_modules', '@foundry-mcp', 'shared');
  ensureDir(sharedPkgDst);
  copyRecursive(path.join(sharedSource, 'dist'), path.join(sharedPkgDst, 'dist'));
  fs.copyFileSync(path.join(sharedSource, 'package.json'), path.join(sharedPkgDst, 'package.json'));

  console.log('   �o" MCP server files prepared');
}

function copyMcpServerFiles() {
  console.log('📦 Preparing MCP Server files...');

  const rootDir = path.join(__dirname, '..');
  const mcpServerSource = path.join(rootDir, 'packages', 'mcp-server');
  const sharedSource = path.join(rootDir, 'shared');
  const mcpServerDest = path.join(config.outputDir, 'foundry-mcp-server');

  // Ensure MCP server was built and bundled
  const builtBundlePath = path.join(mcpServerSource, 'dist', 'index.bundle.cjs');
  if (!fs.existsSync(builtBundlePath)) {
    console.error(
      '   ❌ MCP server bundle not found. Run "npm run build:bundle --workspace=packages/mcp-server" first.'
    );
    process.exit(1);
  }

  // Create directory structure
  ensureDir(path.join(mcpServerDest, 'packages', 'mcp-server'));
  ensureDir(path.join(mcpServerDest, 'shared'));

  // Copy bundled MCP server (single file with all dependencies included)
  console.log('   📦 Copying bundled MCP server...');
  ensureDir(path.join(mcpServerDest, 'packages', 'mcp-server', 'dist'));
  fs.copyFileSync(
    builtBundlePath,
    path.join(mcpServerDest, 'packages', 'mcp-server', 'dist', 'index.cjs')
  );
  fs.copyFileSync(
    path.join(mcpServerSource, 'package.json'),
    path.join(mcpServerDest, 'packages', 'mcp-server', 'package.json')
  );
  console.log('   ✅ Bundled MCP server copied (no node_modules needed!)');

  // Copy shared files (only dist needed for production)
  console.log('   📁 Copying shared files...');
  copyRecursive(path.join(sharedSource, 'dist'), path.join(mcpServerDest, 'shared', 'dist'));
  fs.copyFileSync(
    path.join(sharedSource, 'package.json'),
    path.join(mcpServerDest, 'shared', 'package.json')
  );

  console.log('   ✓ MCP server files prepared');
}

function copyFoundryModuleFiles() {
  console.log('📦 Preparing Foundry Module files...');

  const rootDir = path.join(__dirname, '..');
  const moduleSource = path.join(rootDir, 'packages', 'foundry-module');
  const moduleDistPath = path.join(moduleSource, 'dist', 'main.js');

  // Build module if not already built
  if (!fs.existsSync(moduleDistPath)) {
    console.log('   🔨 Building Foundry module...');
    try {
      execSync('npm run build --workspace=packages/foundry-module', {
        stdio: 'inherit',
        cwd: rootDir,
      });
      console.log('   ✅ Foundry module built successfully');
    } catch (error) {
      console.error('   ❌ Failed to build Foundry module:', error.message);
      process.exit(1);
    }
  }

  // Verify build completed
  if (!fs.existsSync(moduleDistPath)) {
    console.error('   ❌ Foundry module build failed - dist/main.js not found');
    process.exit(1);
  }

  // Copy module files to NSIS staging area
  const moduleDest = path.join(config.outputDir, 'foundry-module');
  ensureDir(moduleDest);

  console.log('   📁 Copying module files...');

  // Copy built JavaScript files
  if (fs.existsSync(path.join(moduleSource, 'dist'))) {
    copyRecursive(path.join(moduleSource, 'dist'), path.join(moduleDest, 'dist'));
    console.log('   ✓ Compiled JavaScript files copied');
  }

  // Copy styles
  if (fs.existsSync(path.join(moduleSource, 'styles'))) {
    copyRecursive(path.join(moduleSource, 'styles'), path.join(moduleDest, 'styles'));
    console.log('   ✓ Style files copied');
  }

  // Copy language files
  if (fs.existsSync(path.join(moduleSource, 'lang'))) {
    copyRecursive(path.join(moduleSource, 'lang'), path.join(moduleDest, 'lang'));
    console.log('   ✓ Language files copied');
  }

  // Copy templates
  if (fs.existsSync(path.join(moduleSource, 'templates'))) {
    copyRecursive(path.join(moduleSource, 'templates'), path.join(moduleDest, 'templates'));
    console.log('   ✓ Template files copied');
  }

  // Copy generated-maps directory (for map storage)
  if (fs.existsSync(path.join(moduleSource, 'generated-maps'))) {
    copyRecursive(
      path.join(moduleSource, 'generated-maps'),
      path.join(moduleDest, 'generated-maps')
    );
    console.log('   ✓ Generated maps directory copied');
  } else {
    // Create empty generated-maps directory if it doesn't exist
    ensureDir(path.join(moduleDest, 'generated-maps'));
    console.log('   ✓ Generated maps directory created');
  }

  // Copy module.json (required)
  const moduleJsonPath = path.join(moduleSource, 'module.json');
  if (fs.existsSync(moduleJsonPath)) {
    fs.copyFileSync(moduleJsonPath, path.join(moduleDest, 'module.json'));
    console.log('   ✓ Module manifest copied');
  } else {
    console.error('   ❌ module.json not found - required for Foundry module');
    process.exit(1);
  }

  console.log('   ✅ Foundry module files prepared for installer');
}

function copyInstallerFiles() {
  console.log('📦 Copying installer files...');

  // Copy license, readme, and third party notices
  fs.copyFileSync(
    path.join(config.nsisDir, 'LICENSE.txt'),
    path.join(config.outputDir, 'LICENSE.txt')
  );
  fs.copyFileSync(
    path.join(config.nsisDir, 'README.txt'),
    path.join(config.outputDir, 'README.txt')
  );
  fs.copyFileSync(
    path.join(config.nsisDir, 'THIRD_PARTY_NOTICES.txt'),
    path.join(config.outputDir, 'THIRD_PARTY_NOTICES.txt')
  );

  // Copy icon file
  const iconSource = path.join(config.nsisDir, 'icon.ico');
  const iconDest = path.join(config.outputDir, 'icon.ico');
  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, iconDest);
    console.log('   ✓ Icon file copied');
  } else {
    console.error('   ❌ Icon file not found:', iconSource);
    throw new Error('Required icon.ico file missing from nsis directory');
  }

  // Copy PowerShell configuration script
  const psSource = path.join(config.nsisDir, 'configure-claude.ps1');
  const psDest = path.join(config.outputDir, 'configure-claude.ps1');
  if (fs.existsSync(psSource)) {
    fs.copyFileSync(psSource, psDest);
    console.log('   ✓ PowerShell script copied');
  } else {
    console.error('   ❌ PowerShell script not found:', psSource);
    throw new Error('Required configure-claude.ps1 file missing from nsis directory');
  }

  // Copy batch wrapper script
  const batSource = path.join(config.nsisDir, 'configure-claude-wrapper.bat');
  const batDest = path.join(config.outputDir, 'configure-claude-wrapper.bat');
  if (fs.existsSync(batSource)) {
    fs.copyFileSync(batSource, batDest);
    console.log('   ✓ Batch wrapper script copied');
  } else {
    console.error('   ❌ Batch wrapper script not found:', batSource);
    throw new Error('Required configure-claude-wrapper.bat file missing from nsis directory');
  }

  // Copy NSIS plugin DLL files for ComfyUI functionality
  const inetcSource = path.join(config.nsisDir, 'INetC.dll');
  const inetcDest = path.join(config.outputDir, 'INetC.dll');
  if (fs.existsSync(inetcSource)) {
    fs.copyFileSync(inetcSource, inetcDest);
    console.log('   ✓ INetC plugin copied');
  } else {
    console.error('   ❌ INetC plugin not found:', inetcSource);
    throw new Error('Required INetC.dll plugin missing from nsis directory');
  }

  const nsis7zSource = path.join(config.nsisDir, 'nsis7z.dll');
  const nsis7zDest = path.join(config.outputDir, 'nsis7z.dll');
  if (fs.existsSync(nsis7zSource)) {
    fs.copyFileSync(nsis7zSource, nsis7zDest);
    console.log('   ✓ NSIS 7z plugin copied');
  } else {
    console.error('   ❌ NSIS 7z plugin not found:', nsis7zSource);
    throw new Error('Required nsis7z.dll plugin missing from nsis directory');
  }

  // Copy 7zr.exe (command-line 7-Zip extractor)
  const zipExtractorSource = path.join(config.nsisDir, '7zr.exe');
  const zipExtractorDest = path.join(config.outputDir, '7zr.exe');
  if (fs.existsSync(zipExtractorSource)) {
    fs.copyFileSync(zipExtractorSource, zipExtractorDest);
    console.log('   ✓ 7zr.exe extractor copied');
  } else {
    console.error('   ❌ 7zr.exe extractor not found:', zipExtractorSource);
    throw new Error('Required 7zr.exe extractor missing from nsis directory');
  }

  console.log('   ✓ Installer files prepared');
}

function updateNSISVersion(sourcePath, destPath, version) {
  // Read the NSIS script
  let content = fs.readFileSync(sourcePath, 'utf8');

  // Convert version format (remove 'v' prefix if present)
  const cleanVersion = version.startsWith('v') ? version.slice(1) : version;
  const versionParts = cleanVersion.split('.');

  // Ensure we have 4 parts for Windows version (e.g., "0.4.9.0")
  while (versionParts.length < 4) {
    versionParts.push('0');
  }
  const windowsVersion = versionParts.join('.');

  // Update VIProductVersion (needs 4-part version)
  content = content.replace(/VIProductVersion\s+"[\d.]+"/, `VIProductVersion "${windowsVersion}"`);

  // Update VIAddVersionKey "FileVersion" (needs 4-part version)
  content = content.replace(
    /VIAddVersionKey\s+"FileVersion"\s+"[\d.]+"/,
    `VIAddVersionKey "FileVersion" "${windowsVersion}"`
  );

  // Update DisplayVersion in registry (can use 3-part version)
  content = content.replace(
    /WriteRegStr\s+HKCU\s+"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FoundryMCPServer"\s+"DisplayVersion"\s+"[\d.]+"/,
    `WriteRegStr HKCU "Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\FoundryMCPServer" "DisplayVersion" "${cleanVersion}"`
  );

  // Write the updated content to destination
  fs.writeFileSync(destPath, content);
}

function buildInstaller() {
  console.log('🔨 Building NSIS installer...');

  try {
    // Check if NSIS is available
    execSync('makensis /VERSION', { stdio: 'pipe' });
    console.log('   ✓ NSIS found and ready');
  } catch (error) {
    console.error('   ❌ NSIS not found. Please install NSIS from https://nsis.sourceforge.io/');
    console.error(
      '   After installation, add NSIS to your PATH or run this script from NSIS directory.'
    );
    return false;
  }

  try {
    // Define paths
    const nsisScript = path.join(config.nsisDir, 'foundry-mcp-server.nsi');
    const outputPath = path.join(config.buildDir, `FoundryMCPServer-Setup-${version}.exe`);

    console.log(`   📁 NSIS script: ${nsisScript}`);
    console.log(`   📁 Output path: ${outputPath}`);
    console.log(`   📁 Working directory: ${config.outputDir}`);

    // List files in output directory before NSIS
    console.log('   📋 Files before NSIS compilation:');
    const beforeFiles = fs.readdirSync(config.outputDir);
    beforeFiles.forEach(file => console.log(`      - ${file}`));

    // Copy NSIS script to output directory and update version numbers
    const nsisScriptLocal = path.join(config.outputDir, 'foundry-mcp-server.nsi');
    updateNSISVersion(nsisScript, nsisScriptLocal, version);
    console.log(`   📋 Copied NSIS script with updated version ${version} to working directory`);

    // Change to output directory so NSIS can find files
    const originalCwd = process.cwd();
    process.chdir(config.outputDir);
    console.log(`   📂 Changed working directory to: ${process.cwd()}`);

    // Run NSIS compiler with verbose output from local script
    console.log(`   🔨 Running NSIS compiler...`);
    execSync(
      `makensis /V4 /DVERSION=${version} /DOUTFILE="${outputPath}" "foundry-mcp-server.nsi"`,
      {
        stdio: 'inherit',
      }
    );

    // Restore original working directory
    process.chdir(originalCwd);

    // List files in output directory after NSIS
    console.log('   📋 Files after NSIS compilation:');
    const afterFiles = fs.readdirSync(config.outputDir);
    afterFiles.forEach(file => console.log(`      - ${file}`));

    // Also check build directory
    console.log('   📋 Files in build directory:');
    if (fs.existsSync(config.buildDir)) {
      const buildFiles = fs.readdirSync(config.buildDir);
      buildFiles.forEach(file => console.log(`      - ${file}`));
    }

    // Check if installer was created in expected location
    if (fs.existsSync(outputPath)) {
      console.log(`   ✓ Installer created: ${outputPath}`);

      // Get file size
      const stats = fs.statSync(outputPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
      console.log(`   📊 Installer size: ${fileSizeMB} MB`);

      return true;
    } else {
      // Look for the installer in other possible locations
      console.log('   🔍 Installer not found at expected location, searching...');

      const possibleLocations = [
        path.join(config.outputDir, 'FoundryMCPServer-Setup.exe'),
        path.join(config.buildDir, 'FoundryMCPServer-Setup.exe'),
        path.join(config.nsisDir, 'FoundryMCPServer-Setup.exe'),
        path.join(__dirname, 'FoundryMCPServer-Setup.exe'),
      ];

      for (const location of possibleLocations) {
        if (fs.existsSync(location)) {
          console.log(`   ✓ Found installer at: ${location}`);
          fs.renameSync(location, outputPath);
          console.log(`   ✓ Moved to expected location: ${outputPath}`);

          const stats = fs.statSync(outputPath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
          console.log(`   📊 Installer size: ${fileSizeMB} MB`);

          return true;
        }
      }

      console.error('   ❌ Installer not found in any expected location');
      console.error('   📋 Searched locations:');
      possibleLocations.forEach(loc => console.error(`      - ${loc}`));
      return false;
    }
  } catch (error) {
    console.error('   ❌ Failed to build installer:', error.message);
    console.error('   📋 Error details:', error);
    return false;
  }
}

// Main build process
async function build() {
  try {
    console.log('🔧 Preparing build environment...');

    // Clean and create build directories
    if (fs.existsSync(config.buildDir)) {
      console.log('   🧹 Cleaning existing build directory...');
      fs.rmSync(config.buildDir, { recursive: true, force: true });
    }

    ensureDir(config.buildDir);
    ensureDir(config.outputDir);
    ensureDir(config.tempDir);

    console.log('   ✓ Build environment ready\n');

    // Download and extract Node.js (unless skipped)
    if (!skipDownload) {
      downloadAndExtractNode();
      console.log();
    } else {
      console.log('   ⏩ Skipping Node.js runtime download (staging-only)');
    }

    // Copy MCP server files
    copyMcpServerFilesV2();
    console.log();

    // Copy Foundry module files
    copyFoundryModuleFiles();
    console.log();

    // Copy installer files
    copyInstallerFiles();
    console.log();

    // Build NSIS installer (unless skipped)
    const success = skipNsis
      ? (console.log('   dY"< Skipping NSIS compilation (staging-only)'), true)
      : buildInstaller();
    console.log();

    if (success) {
      console.log('🎉 Build completed successfully!');
      console.log(`📦 Installer: FoundryMCPServer-Setup-${version}.exe`);
      console.log('📋 Ready for distribution!');
    } else {
      console.log('⚠️  Build completed but installer creation failed.');
      console.log('   Files are prepared in: ' + config.outputDir);
      console.log('   Run NSIS manually to create installer.');
    }
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
build();
