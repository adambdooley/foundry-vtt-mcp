# Building the Mac DMG Installer

## Overview

The Mac installer uses a two-step build process:

1. **On Windows:** Build the .app bundle (cross-platform)
2. **On Mac:** Create the DMG installer (Mac-only)

---

## Step 1: Build .app Bundle on Windows (ALREADY DONE!)

This step is complete. The app bundle is ready at:

```
installer/build/FoundryMCPServer.app
```

Files included:

- ✅ MCP server bundles (index.cjs, backend.bundle.cjs)
- ✅ Foundry module (dist/)
- ✅ ComfyUI setup script (setup-comfyui.js)
- ✅ Launch script
- ✅ Info.plist
- ✅ README.md

---

## Step 2: Create DMG on Mac (DO THIS ON MAC)

### Prerequisites:

- Mac computer (any Mac will work)
- The FoundryMCPServer.app bundle from Step 1

### Transfer Files to Mac:

**Option A: USB Drive**

```bash
# Copy entire build directory to USB
# Then on Mac:
cp -R /Volumes/USB/build ~/Desktop/foundry-mcp-build
```

**Option B: Git**

```bash
# If you have the repo on Mac:
git pull origin feature/mac-support-and-installer
cd installer
```

**Option C: Direct Copy** (if building on same network)

```bash
# From Windows, copy to Mac via network share
```

### Build the DMG:

```bash
cd ~/Desktop/foundry-mcp-build  # or wherever you put it
chmod +x ../build-dmg-on-mac.sh
../build-dmg-on-mac.sh
```

Or if you have the full repo:

```bash
cd installer
chmod +x build-dmg-on-mac.sh
./build-dmg-on-mac.sh
```

### What the Script Does:

1. Verifies FoundryMCPServer.app exists
2. Creates temporary DMG structure
3. Copies app bundle to temp
4. Creates symlink to /Applications (for drag-and-drop)
5. Creates compressed DMG with `hdiutil`
6. Cleans up temp files

### Output:

```
installer/build/FoundryMCPServer-v0.5.4-macOS.dmg
```

Size: ~800KB (compressed)

---

## Step 3: Test the DMG

```bash
# Mount the DMG
open installer/build/FoundryMCPServer-v0.5.4-macOS.dmg

# A Finder window opens showing:
# - FoundryMCPServer.app
# - Applications (symlink)
# - README.md

# Drag the app to Applications
# Unmount DMG
# Run from /Applications
```

---

## DMG Features:

✅ **Drag-and-drop installer** - Visual interface
✅ **Applications symlink** - Easy install target
✅ **Compressed** - Small download size (~800KB)
✅ **Professional** - Standard Mac installer format
✅ **README included** - Installation instructions

---

## Troubleshooting:

**"App bundle not found"**

- Ensure you ran `node installer/build-mac-simple.js` on Windows first
- Check that `installer/build/FoundryMCPServer.app` exists

**"hdiutil: command not found"**

- hdiutil is built into macOS, should always be available
- Make sure you're running on a real Mac, not a VM or cross-compiler

**"Permission denied"**

- Run: `chmod +x build-dmg-on-mac.sh`

---

## Alternative: Quick DMG Creation

If the script doesn't work, you can create a DMG manually:

```bash
cd installer/build

# Create DMG directly
hdiutil create -volname "Foundry MCP Server" \
  -srcfolder FoundryMCPServer.app \
  -ov -format UDZO \
  FoundryMCPServer-v0.5.4-macOS.dmg
```

This creates a simpler DMG without the Applications symlink or README, but still works fine.

---

## Current Status:

- ✅ Windows build complete (.app bundle ready)
- ⏳ Mac DMG build (run on Mac when you have it)
- ⏳ Testing (after DMG is built)

The .app bundle is ready to go! Just needs the final DMG wrapper on Mac.
