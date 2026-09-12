; Foundry MCP Server Windows Installer
; Built with NSIS (Nullsoft Scriptable Install System)

;--------------------------------
; Include Modern UI and PowerShell support
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "Sections.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Include inetc plugin for downloading ComfyUI
!addplugindir "."

; PowerShell execution macro - fixed for NSIS/PowerShell compatibility
!macro PowerShellExecWithOutput command
  nsExec::ExecToStack 'powershell.exe -inputformat none -NoProfile -ExecutionPolicy Bypass -Command "${command}"'
!macroend

!define PowerShellExecWithOutput "!insertmacro PowerShellExecWithOutput"

; PowerShell file execution macro
!macro PowerShellExecFile filepath parameters
  nsExec::ExecToStack 'powershell.exe -inputformat none -NoProfile -ExecutionPolicy Bypass -File "${filepath}" ${parameters}'
!macroend

!define PowerShellExecFile "!insertmacro PowerShellExecFile"

;--------------------------------
; General Configuration
Name "Foundry MCP Server"

; Allow output file to be overridden from command line
!ifndef OUTFILE
  !define OUTFILE "FoundryMCPServer-Setup.exe"
!endif
OutFile "${OUTFILE}"

Unicode True

; Default installation directory
InstallDir "$LOCALAPPDATA\FoundryMCPServer"

; Request application privileges (user level, no admin required)
RequestExecutionLevel user

; Version information
; Strip 'v' prefix and any suffix (like '-pre', '-alpha', etc.) from VERSION
!ifndef VERSION
  !define VERSION "v0.5.5"
!endif

; Process VERSION: remove 'v' prefix and everything after '-'
!searchparse /noerrors "${VERSION}" "v" STRIPPED_VERSION
!ifndef STRIPPED_VERSION
  !define STRIPPED_VERSION "${VERSION}"
!endif

!searchparse /noerrors "${STRIPPED_VERSION}" "" VERSION_BASE "-"
!ifndef VERSION_BASE
  !define VERSION_BASE "${STRIPPED_VERSION}"
!endif

VIProductVersion "${VERSION_BASE}.0"
VIAddVersionKey "ProductName" "Foundry MCP Server"
VIAddVersionKey "CompanyName" "Foundry MCP Bridge"
VIAddVersionKey "FileDescription" "AI-powered campaign management with map generation for Foundry VTT"
VIAddVersionKey "FileVersion" "${VERSION_BASE}.0"
VIAddVersionKey "LegalCopyright" "© 2024 Foundry MCP Bridge"

;--------------------------------
; Interface Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

; Welcome page
!define MUI_WELCOMEPAGE_TITLE "Foundry MCP Server Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will install Foundry MCP Server, which enables AI-powered campaign management and battlemap generation for Foundry VTT using Claude Desktop.$\r$\n$\r$\nOptionally install the Foundry MCP Bridge module and ComfyUI for AI-powered map generation directly to your system for seamless setup.$\r$\n$\r$\nClick Next to continue."

; Directory page
!define MUI_DIRECTORYPAGE_TEXT_TOP "Choose the folder where you want to install Foundry MCP Server."

; Components page
!define MUI_COMPONENTSPAGE_TEXT_TOP "Select the components you want to install:"
!define MUI_COMPONENTSPAGE_TEXT_COMPLIST "Check the components you want to install and uncheck the components you don't want to install. Click Next to continue."

; Finish page (will be customized based on what was installed)
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT_NOREBOOTSUPPORT
!define MUI_FINISHPAGE_TEXT "Thank you for installing Foundry MCP Server!$\r$\n$\r$\nNext steps:$\r$\n$\r$\n1. Restart Claude Desktop$\r$\n2. Launch Foundry VTT$\r$\n$\r$\nIf the Foundry module was installed, it will be available in your modules list. Otherwise, install the MCP Bridge module manually.$\r$\n$\r$\nFor support and documentation, visit our GitHub repository."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open Foundry VTT MCP GitHub"
!define MUI_FINISHPAGE_RUN_FUNCTION "OpenGitHub"

;--------------------------------
; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!define MUI_PAGE_CUSTOMFUNCTION_PRE DirectoryPagePre
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_PAGE_CUSTOMFUNCTION_PRE ComponentsPagePre
!insertmacro MUI_PAGE_COMPONENTS

; Custom GPU Selection Page
Page custom GPUSelectionCreate GPUSelectionLeave

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

;--------------------------------
; Languages
!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Global Variables
Var FoundryPath
Var ClaudeConfigPath
Var FoundryDetectionResult
Var ComfyUIDownloadURL
Var ComfyUIDownloadName
Var GPUType
Var AutoDetectionResult
Var InstallationSuccess
Var ExistingInstallDir
Var IsUpgrade
Var UpgradeComponentsInitialized

; Custom GPU selection page variables
Var Dialog
Var Label1
Var Label2
Var Label3
Var RadioButton1
Var RadioButton2
Var RadioButton3
Var RadioButton4
Var DescriptionBox

; Uninstaller Variables
Var un.FoundryPath
Var un.ClaudeConfigPath

;--------------------------------
; Initialization Function
Function .onInit
  ; Initialize installation success flag
  StrCpy $InstallationSuccess "false"

  ; Reuse an existing installation directory for in-place upgrades.
  StrCpy $IsUpgrade "false"
  StrCpy $UpgradeComponentsInitialized "false"
  Call DetectExistingInstallation

  ; Set Foundry module section as checked by default
  !insertmacro SelectSection SecFoundryModule
FunctionEnd

Function DirectoryPagePre
  ; An upgrade must continue in the detected installation directory.
  StrCmp $IsUpgrade "true" 0 show_directory_page
  Abort

  show_directory_page:
  Return
FunctionEnd

Function DetectExistingInstallation
  StrCpy $ExistingInstallDir ""

  ; New installers record the installation directory explicitly.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "InstallLocation"
  StrCmp $0 "" check_legacy_uninstall_string
  IfFileExists "$0\Uninstall.exe" existing_install_found check_legacy_uninstall_string

  check_legacy_uninstall_string:
  ; Older releases only recorded UninstallString. Their value is the path to
  ; Uninstall.exe, optionally quoted, so derive and validate its parent folder.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "UninstallString"
  StrCmp $0 "" check_default_install

  StrCpy $1 $0 1
  StrCmp $1 '$\"' 0 legacy_uninstall_parent
  StrCpy $0 $0 "" 1
  StrLen $1 $0
  IntOp $1 $1 - 1
  StrCpy $2 $0 1 $1
  StrCmp $2 '$\"' 0 legacy_uninstall_parent
  StrCpy $0 $0 $1

  legacy_uninstall_parent:
  ${GetParent} "$0" $1
  IfFileExists "$1\Uninstall.exe" 0 check_default_install
  StrCpy $0 $1
  Goto existing_install_found

  check_default_install:
  ; Final compatibility fallback for releases installed at the historical default.
  StrCpy $0 "$LOCALAPPDATA\FoundryMCPServer"
  IfFileExists "$0\Uninstall.exe" existing_install_found no_existing_install

  existing_install_found:
  StrCpy $ExistingInstallDir $0
  StrCpy $INSTDIR $ExistingInstallDir
  StrCpy $IsUpgrade "true"

  no_existing_install:
  Return
FunctionEnd

Function DetectFoundryInstallation
  ; Initialize variables
  StrCpy $FoundryPath ""
  StrCpy $FoundryDetectionResult ""
  
  ; Check if user has Claude Desktop (good sign they'll want this integration)
  StrCpy $ClaudeConfigPath "$APPDATA\Claude\claude_desktop_config.json"
  IfFileExists "$ClaudeConfigPath" claude_detected no_claude
  
  claude_detected:
  DetailPrint "Claude Desktop detected - looking for Foundry VTT installation..."
  StrCpy $FoundryDetectionResult "Claude Desktop found"
  Goto check_foundry_paths
  
  no_claude:
  DetailPrint "Claude Desktop not detected - checking for Foundry VTT anyway..."
  StrCpy $FoundryDetectionResult "No Claude Desktop"
  
  check_foundry_paths:
  ; Try primary location first
  StrCpy $FoundryPath "$LOCALAPPDATA\FoundryVTT\Data\modules"
  IfFileExists "$FoundryPath" foundry_found
  DetailPrint "Primary Foundry path not found: $FoundryPath"
  
  ; Try secondary location  
  StrCpy $FoundryPath "$APPDATA\FoundryVTT\Data\modules"
  IfFileExists "$FoundryPath" foundry_found
  DetailPrint "Secondary Foundry path not found: $FoundryPath"
  
  ; Check environment variable
  ReadEnvStr $0 "FOUNDRY_VTT_DATA_PATH"
  StrCmp $0 "" check_manual
  StrCpy $FoundryPath "$0\Data\modules"
  IfFileExists "$FoundryPath" foundry_found
  DetailPrint "Environment variable path not found: $FoundryPath"
  
  check_manual:
  ; If all else fails, show folder browser
  MessageBox MB_YESNO "Foundry VTT not detected automatically.$\r$\n$\r$\nWould you like to browse for your Foundry User Data folder?$\r$\n$\r$\n(Usually located at: $LOCALAPPDATA\FoundryVTT)" IDYES browse_for_foundry IDNO skip_module
  
  browse_for_foundry:
  nsDialogs::SelectFolderDialog "Select Foundry VTT User Data Folder (containing Data subfolder)" "$LOCALAPPDATA"
  Pop $0
  StrCmp $0 CANCEL skip_module
  
  ; Validate selection has Data\modules subfolder
  StrCpy $FoundryPath "$0\Data\modules"
  IfFileExists "$FoundryPath" foundry_found
  
  ; Try alternative - maybe they selected the Data folder directly
  StrCpy $FoundryPath "$0\modules"  
  IfFileExists "$FoundryPath" foundry_found
  
  ; Final error if invalid selection
  MessageBox MB_ICONSTOP "Selected folder does not contain a valid Foundry VTT Data structure.$\r$\n$\r$\nExpected: [Selected Folder]\Data\modules\$\r$\n$\r$\nModule installation cancelled."
  Goto skip_module
  
  skip_module:
  DetailPrint "Foundry module installation will be skipped"
  StrCpy $FoundryPath ""
  Return
  
  foundry_found:
  DetailPrint "Foundry VTT installation detected at: $FoundryPath"
  StrCpy $FoundryDetectionResult "$FoundryDetectionResult; Foundry found at $FoundryPath"
FunctionEnd

;--------------------------------
; Helper Functions
Function OpenGitHub
  ExecShell "open" "https://github.com/adambdooley/foundry-vtt-mcp"
FunctionEnd

Function DownloadComfyUIModels
  ; Download essential models for battlemap generation
  DetailPrint "Downloading essential AI models for map generation..."
  DetailPrint "This may take several minutes for large model files..."

  ; Create models directory structure
  CreateDirectory "$INSTDIR\ComfyUI\ComfyUI\models\checkpoints"
  CreateDirectory "$INSTDIR\ComfyUI\ComfyUI\models\vae"
  CreateDirectory "$INSTDIR\ComfyUI\ComfyUI\models\configs"
  CreateDirectory "$INSTDIR\ComfyUI\ComfyUI\models\loras"

  ; Create output directory for generated images
  CreateDirectory "$INSTDIR\ComfyUI\ComfyUI\output"

  ; Download YAML config file first (essential for proper checkpoint loading)
  DetailPrint "Downloading D&D Battlemaps YAML config file..."
  inetc::get /SILENT \
    "https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.yaml" \
    "$INSTDIR\ComfyUI\ComfyUI\models\configs\dDBattlemapsSDXL10_upscaleV10.yaml" /end
  Pop $0
  StrCmp $0 "OK" config_success config_failed

  config_failed:
    DetailPrint "YAML config download failed: $0"
    MessageBox MB_ICONEXCLAMATION|MB_OK "YAML config download failed: $0$\r$\n$\r$\nYou can manually download it later from HuggingFace."
    Goto download_sdxl

  config_success:
    DetailPrint "YAML config downloaded successfully"

  download_sdxl:
  ; Download SDXL Base model (essential for image generation)
  DetailPrint "Downloading SDXL Base model (~6.5GB)... (running silently)"

  ; Download SDXL Base model using inetc plugin
  inetc::get /SILENT \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" \
    "$INSTDIR\ComfyUI\ComfyUI\models\checkpoints\sd_xl_base_1.0.safetensors" /end
  Pop $0
  StrCmp $0 "OK" sdxl_success sdxl_failed

  sdxl_failed:
    DetailPrint "SDXL Base model download failed: $0"
    MessageBox MB_ICONEXCLAMATION|MB_OK "SDXL Base model download failed: $0$\r$\n$\r$\nYou can manually download it later from HuggingFace."
    Goto download_vae

  sdxl_success:
    DetailPrint "SDXL Base model downloaded successfully"

  download_vae:
  ; Download SDXL VAE (required for proper image decoding)
  DetailPrint "Downloading SDXL VAE (~335MB)... (running silently)"

  ; Download SDXL VAE using inetc plugin
  inetc::get /SILENT \
    "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors" \
    "$INSTDIR\ComfyUI\ComfyUI\models\vae\sdxl_vae.safetensors" /end
  Pop $1
  StrCmp $1 "OK" vae_success vae_failed

  vae_failed:
    DetailPrint "SDXL VAE download failed: $1"
    MessageBox MB_ICONEXCLAMATION|MB_OK "SDXL VAE download failed: $1$\r$\n$\r$\nYou can manually download it later from HuggingFace."
    Goto download_dnd_checkpoint

  vae_success:
    DetailPrint "SDXL VAE downloaded successfully"
    Goto download_dnd_checkpoint

  download_dnd_checkpoint:
    DetailPrint "Preparing D&D Battlemaps SDXL Upscale checkpoint (~6.5GB)..."
    IfFileExists "$INSTDIR\ComfyUI\ComfyUI\models\checkpoints\dDBattlemapsSDXL10_upscaleV10.safetensors" dnd_checkpoint_already_present dnd_checkpoint_fetch

  dnd_checkpoint_already_present:
    DetailPrint "D&D Battlemaps checkpoint already present; skipping download"
    Goto models_complete

  dnd_checkpoint_fetch:
    DetailPrint "Downloading D&D Battlemaps SDXL Upscale checkpoint (~6.5GB)... (running silently)"
    inetc::get /SILENT \
      "https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.safetensors" \
      "$INSTDIR\ComfyUI\ComfyUI\models\checkpoints\dDBattlemapsSDXL10_upscaleV10.safetensors" /end
    Pop $2
    StrCmp $2 "OK" dnd_checkpoint_success dnd_checkpoint_failed

  dnd_checkpoint_failed:
    DetailPrint "D&D Battlemaps checkpoint download failed: $2"
    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "Failed to download the D&D Battlemaps checkpoint: $2$\r$\n$\r$\nDo you want to retry now?" IDRETRY dnd_checkpoint_retry IDCANCEL dnd_checkpoint_skipped

  dnd_checkpoint_retry:
    DetailPrint "Retrying D&D Battlemaps checkpoint download... (running silently)"
    inetc::get /SILENT \
      "https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.safetensors" \
      "$INSTDIR\ComfyUI\ComfyUI\models\checkpoints\dDBattlemapsSDXL10_upscaleV10.safetensors" /end
    Pop $2
    StrCmp $2 "OK" dnd_checkpoint_success dnd_checkpoint_final_failed

  dnd_checkpoint_final_failed:
    DetailPrint "D&D Battlemaps checkpoint download failed again: $2"
    MessageBox MB_ICONEXCLAMATION|MB_OK "D&D Battlemaps checkpoint download failed: $2$\r$\n$\r$\nYou can manually download it later from HuggingFace:$\r$\nhttps://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/dDBattlemapsSDXL10_upscaleV10.safetensors"
    Goto dnd_checkpoint_skipped

  dnd_checkpoint_skipped:
    DetailPrint "Skipping D&D Battlemaps checkpoint download. You can install it manually later."
    Goto models_complete

  dnd_checkpoint_success:
    DetailPrint "D&D Battlemaps checkpoint downloaded successfully"

    ; Download D&D Battlemaps license file for compliance
    DetailPrint "Downloading D&D Battlemaps license file..."
    inetc::get /SILENT \
      "https://huggingface.co/AdamDooley/dnd-battlemaps-sdxl-1.0-mirror/resolve/main/LICENSE.txt" \
      "$INSTDIR\ComfyUI\ComfyUI\models\checkpoints\dDBattlemapsSDXL10_LICENSE.txt" /end
    Pop $3
    StrCmp $3 "OK" dnd_license_success dnd_license_failed

  dnd_license_failed:
    DetailPrint "D&D Battlemaps license download failed: $3 (non-critical)"
    Goto models_complete

  dnd_license_success:
    DetailPrint "D&D Battlemaps license downloaded successfully"
    Goto models_complete

  models_complete:
    DetailPrint "Model downloads completed"
    DetailPrint "Note: Additional checkpoints or LoRA models for specific map styles can be downloaded manually"

FunctionEnd

Function TrimTrailingCRLF
  Exch $0
  Push $1

trim_loop:
  StrCpy $1 $0 1 -1
  StrCmp $1 "$\r" trim_remove
  StrCmp $1 "$\n" trim_remove
  StrCmp $1 "" trim_done
  Goto trim_done

trim_remove:
  StrCpy $0 $0 -1
  Goto trim_loop

trim_done:
  Pop $1
  Exch $0
FunctionEnd

Function DetectGPUHardware
  ; Detect NVIDIA GPU for CUDA PyTorch installation
  DetailPrint "Detecting GPU hardware for PyTorch optimization..."

  StrCpy $0 "$TEMP\detect-gpu.ps1"
  StrCpy $1 "$TEMP\gpu-result.txt"

  ; Create PowerShell script for GPU detection (simplified)
  FileOpen $2 $0 w
  FileWrite $2 "param([string]`$$outPath)`r`n"
  FileWrite $2 "$$ProgressPreference = 'SilentlyContinue'`r`n"
  FileWrite $2 "$$result = 'cpu'`r`n"
  FileWrite $2 "`r`n"
  FileWrite $2 "# Try nvidia-smi first`r`n"
  FileWrite $2 "$$nvidiaSmiPaths = @('C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe', 'C:\Windows\System32\nvidia-smi.exe')`r`n"
  FileWrite $2 "foreach ($$smiPath in $$nvidiaSmiPaths) {`r`n"
  FileWrite $2 "  if (Test-Path $$smiPath) {`r`n"
  FileWrite $2 "    try {`r`n"
  FileWrite $2 "      $$smiOutput = & $$smiPath --query-gpu=name --format=csv,noheader,nounits 2>$$null`r`n"
  FileWrite $2 "      if ($$LASTEXITCODE -eq 0 -and $$smiOutput) {`r`n"
  FileWrite $2 "        $$result = 'cuda'`r`n"
  FileWrite $2 "        break`r`n"
  FileWrite $2 "      }`r`n"
  FileWrite $2 "    } catch { }`r`n"
  FileWrite $2 "  }`r`n"
  FileWrite $2 "}`r`n"
  FileWrite $2 "`r`n"
  FileWrite $2 "# Try DriverStore if not found`r`n"
  FileWrite $2 "if ($$result -eq 'cpu') {`r`n"
  FileWrite $2 "  $$driverStorePath = 'C:\Windows\System32\DriverStore\FileRepository'`r`n"
  FileWrite $2 "  if (Test-Path $$driverStorePath) {`r`n"
  FileWrite $2 "    $$foundSmi = Get-ChildItem -Path $$driverStorePath -Recurse -Name 'nvidia-smi.exe' -ErrorAction SilentlyContinue | Select-Object -First 1`r`n"
  FileWrite $2 "    if ($$foundSmi) {`r`n"
  FileWrite $2 "      $$fullPath = Join-Path $$driverStorePath $$foundSmi`r`n"
  FileWrite $2 "      try {`r`n"
  FileWrite $2 "        $$smiOutput = & $$fullPath --query-gpu=name --format=csv,noheader,nounits 2>$$null`r`n"
  FileWrite $2 "        if ($$LASTEXITCODE -eq 0 -and $$smiOutput) {`r`n"
  FileWrite $2 "          $$result = 'cuda'`r`n"
  FileWrite $2 "        }`r`n"
  FileWrite $2 "      } catch { }`r`n"
  FileWrite $2 "    }`r`n"
  FileWrite $2 "  }`r`n"
  FileWrite $2 "}`r`n"
  FileWrite $2 "`r`n"
  FileWrite $2 "# Fallback to WMI`r`n"
  FileWrite $2 "if ($$result -eq 'cpu') {`r`n"
  FileWrite $2 "  $$gpuCards = Get-WmiObject -Class Win32_VideoController -ErrorAction SilentlyContinue`r`n"
  FileWrite $2 "  if ($$gpuCards) {`r`n"
  FileWrite $2 "    foreach ($$gpu in $$gpuCards) {`r`n"
  FileWrite $2 "      if ($$gpu.Name -and $$gpu.Name.ToLower() -match 'nvidia|geforce|rtx|gtx|quadro|tesla|titan') {`r`n"
  FileWrite $2 "        $$result = 'cuda'`r`n"
  FileWrite $2 "        break`r`n"
  FileWrite $2 "      }`r`n"
  FileWrite $2 "    }`r`n"
  FileWrite $2 "  }`r`n"
  FileWrite $2 "}`r`n"
  FileWrite $2 "`r`n"
  FileWrite $2 "[IO.File]::WriteAllText($$outPath, $$result)`r`n"
  FileClose $2

  ; Execute GPU detection script
  ${PowerShellExecFile} "$TEMP\detect-gpu.ps1" "$1"
  Pop $3
  Pop $4

  ; Clean up script
  Delete "$TEMP\detect-gpu.ps1"

  ; Read result
  StrCpy $5 "cuda12"  ; default to CUDA 12.1 (no CPU fallback)
  IfFileExists "$1" 0 gpu_detection_done

  FileOpen $2 "$1" r
  FileRead $2 $5
  FileClose $2
  Delete "$1"

  ; Trim result
  Push $5
  Call TrimTrailingCRLF
  Pop $5

  StrCmp $5 "cuda" gpu_cuda_detected gpu_detection_done

  gpu_cuda_detected:
    DetailPrint "GPU detected via auto-detection"
    StrCpy $6 "cuda12"  ; Default to CUDA 12.1 for detected GPUs
    Goto gpu_detection_done

  gpu_detection_done:
    ; Store result in global variable for use in ComfyUI installation
    StrCpy $GPUType "cuda12"  ; Always default to CUDA 12.1
    StrCpy $AutoDetectionResult "cuda12"  ; Store for GPU selection page

FunctionEnd

Function GPUSelectionCreate
  ; Only show GPU selection page if ComfyUI component is selected
  SectionGetFlags 2 $0  ; SecComfyUI is section index 2
  IntOp $0 $0 & ${SF_SELECTED}
  IntCmp $0 ${SF_SELECTED} show_page skip_page skip_page

  skip_page:
    ; Skip this page, use auto-detection result
    StrCpy $GPUType $AutoDetectionResult
    Abort

  show_page:
    ; Try auto-detection first (but don't fail installation if it fails)
    Call DetectGPUHardware

    ; Create custom dialog
    nsDialogs::Create 1018
    Pop $Dialog

    ${If} $Dialog == error
        Abort
    ${EndIf}

    ; Title
    ${NSD_CreateLabel} 0 10u 100% 12u "GPU Configuration for AI Map Generation"
    Pop $Label1

    ; Description
    ${NSD_CreateLabel} 0 25u 100% 24u "ComfyUI requires GPU acceleration for map generation (minimum 8GB VRAM required). Choose your GPU type for optimal PyTorch installation:"
    Pop $Label2

    ; VRAM requirement warning
    ${NSD_CreateLabel} 0 45u 100% 12u "Requirements: NVIDIA/AMD/Intel GPU with at least 8GB VRAM"
    Pop $Label3

    ; Radio buttons for different GPU types
    ${NSD_CreateRadioButton} 10u 65u 100% 12u "&NVIDIA CUDA 12.1 (RTX 30/40 series, RTX 4090, etc.)"
    Pop $RadioButton1

    ${NSD_CreateRadioButton} 10u 80u 100% 12u "N&VIDIA CUDA 11.8 (GTX 10/20 series, older NVIDIA GPUs)"
    Pop $RadioButton2

    ${NSD_CreateRadioButton} 10u 95u 100% 12u "&AMD ROCm (Radeon RX 6000/7000 series)"
    Pop $RadioButton3

    ${NSD_CreateRadioButton} 10u 110u 100% 12u "&Intel Arc (Arc A-series GPUs)"
    Pop $RadioButton4

    ; Default to CUDA 12.1 (most common)
    ${NSD_Check} $RadioButton1

    ; Info box
    ${NSD_CreateText} 0 130u 100% 20u "Note: ComfyUI requires ~14GB space and 8GB+ VRAM."
    Pop $DescriptionBox
    SendMessage $DescriptionBox ${EM_SETREADONLY} 1 0

    nsDialogs::Show

FunctionEnd

Function GPUSelectionLeave
  ; Only process if this page was shown
  SectionGetFlags 2 $0  ; SecComfyUI is section index 2
  IntOp $0 $0 & ${SF_SELECTED}
  IntCmp $0 ${SF_SELECTED} process_selection skip_processing skip_processing

  skip_processing:
    Return

  process_selection:
    ; Get radio button states
    ${NSD_GetState} $RadioButton1 $0
    ${NSD_GetState} $RadioButton2 $1
    ${NSD_GetState} $RadioButton3 $2
    ${NSD_GetState} $RadioButton4 $3

    ; Set GPU type based on selection
    ${If} $0 == ${BST_CHECKED}
        StrCpy $GPUType "cuda12"  ; NVIDIA CUDA 12.1
        DetailPrint "User selected: NVIDIA CUDA 12.1 for PyTorch installation"
    ${ElseIf} $1 == ${BST_CHECKED}
        StrCpy $GPUType "cuda11"  ; NVIDIA CUDA 11.8
        DetailPrint "User selected: NVIDIA CUDA 11.8 for PyTorch installation"
    ${ElseIf} $2 == ${BST_CHECKED}
        StrCpy $GPUType "rocm"  ; AMD ROCm
        DetailPrint "User selected: AMD ROCm for PyTorch installation"
    ${ElseIf} $3 == ${BST_CHECKED}
        StrCpy $GPUType "intel"  ; Intel Arc
        DetailPrint "User selected: Intel Arc GPU for PyTorch installation"
    ${Else}
        ; Default to CUDA 12.1 if no selection
        StrCpy $GPUType "cuda12"
        DetailPrint "No selection made, defaulting to NVIDIA CUDA 12.1"
    ${EndIf}

FunctionEnd

Function ResolveComfyUIDownload
  DetailPrint "Resolving latest ComfyUI portable build..."
  StrCpy $ComfyUIDownloadURL ""
  StrCpy $ComfyUIDownloadName ""

  StrCpy $0 "$TEMP\resolve-comfyui.ps1"
  StrCpy $1 "$TEMP\comfyui-download.txt"

  FileOpen $2 $0 w
  FileWrite $2 "param([string]`$$outPath)`r`n"
  FileWrite $2 "$$ProgressPreference = 'SilentlyContinue'`r`n"
  FileWrite $2 "$$headers = @{ 'User-Agent' = 'FoundryMCPInstaller' }`r`n"
  FileWrite $2 "try {`r`n"
  FileWrite $2 "  $$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/Comfy-Org/ComfyUI/releases/latest' -Headers $$headers`r`n"
  FileWrite $2 "  $$asset = $$release.assets | Where-Object { $$_.name -like 'ComfyUI_windows_portable*.7z' } | Sort-Object -Property name | Select-Object -First 1`r`n"
  FileWrite $2 "  if (-not $$asset) { throw 'No suitable asset found'; }`r`n"
  FileWrite $2 "  [IO.File]::WriteAllLines($$outPath, @($$asset.browser_download_url, $$asset.name))`r`n"
  FileWrite $2 "  exit 0`r`n"
  FileWrite $2 "} catch {`r`n"
  FileWrite $2 "  [IO.File]::WriteAllText($$outPath, $$_.Exception.Message)`r`n"
  FileWrite $2 "  exit 1`r`n"
  FileWrite $2 "}`r`n"
  FileClose $2

  DetailPrint "Executing PowerShell script to resolve ComfyUI download URL..."
  DetailPrint "Script path: $TEMP\resolve-comfyui.ps1"
  DetailPrint "Output file: $1"

  nsExec::ExecToStack 'powershell.exe -inputformat none -NoProfile -ExecutionPolicy Bypass -File "$TEMP\resolve-comfyui.ps1" "$1"'
  Pop $3
  Pop $4

  DetailPrint "PowerShell exit code: $3"
  DetailPrint "PowerShell output: $4"

  Delete "$TEMP\resolve-comfyui.ps1"

  IntCmp $3 0 resolve_ok resolve_fail resolve_fail

  resolve_ok:
    DetailPrint "PowerShell succeeded, checking output file..."
    IfFileExists "$1" file_exists file_missing

  file_missing:
    DetailPrint "Output file not found: $1"
    Goto resolve_fail

  file_exists:
    DetailPrint "Output file found, reading content..."
    FileOpen $2 "$1" r
    IntCmp $2 0 file_open_failed file_opened file_opened

  file_open_failed:
    DetailPrint "Failed to open output file: $1"
    Goto resolve_fail

  file_opened:
    FileRead $2 $ComfyUIDownloadURL
    FileRead $2 $ComfyUIDownloadName
    FileClose $2
    Delete "$1"

    Push $ComfyUIDownloadURL
    Call TrimTrailingCRLF
    Pop $ComfyUIDownloadURL

    Push $ComfyUIDownloadName
    Call TrimTrailingCRLF
    Pop $ComfyUIDownloadName

    DetailPrint "Raw URL: $ComfyUIDownloadURL"
    DetailPrint "Raw Name: $ComfyUIDownloadName"

    StrCmp $ComfyUIDownloadURL "" resolve_fail
    DetailPrint "ComfyUI asset resolved: $ComfyUIDownloadName"
    Return

  resolve_fail:
    Delete "$1"
    DetailPrint "Failed to resolve ComfyUI release automatically"
    DetailPrint "PowerShell output: $4"
    DetailPrint "Using fallback to known working ComfyUI v0.3.60 release..."
    StrCpy $ComfyUIDownloadURL "https://github.com/Comfy-Org/ComfyUI/releases/download/v0.11.1/ComfyUI_windows_portable_nvidia.7z"
    StrCpy $ComfyUIDownloadName "ComfyUI_windows_portable_nvidia.7z"
    DetailPrint "Fallback ComfyUI asset: $ComfyUIDownloadName"
    Return
FunctionEnd

Function .onGUIEnd
  ; Simply mark installation as successful if registry entry exists
  ; No popup dialogs - information is shown on the finish page instead
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "DisplayName"
  StrCmp $0 "" installation_failed installation_success

  installation_success:
  StrCpy $InstallationSuccess "true"
  Return

  installation_failed:
  ; Installation was cancelled or failed - don't set success flag
  Return
FunctionEnd

Function UpdateClaudeConfig
  ; Configure Claude Desktop using PowerShell script
  DetailPrint "Configuring Claude Desktop..."
  
  ; First test if PowerShell is available
  DetailPrint "Testing PowerShell availability..."
  ${PowerShellExecWithOutput} 'Write-Host "PowerShell OK"'
  Pop $0 ; Exit code
  Pop $1 ; Output
  
  IntCmp $0 0 powershell_ok powershell_failed powershell_failed
  
  powershell_failed:
    DetailPrint "PowerShell test failed (exit code: $0)"
    MessageBox MB_ICONEXCLAMATION|MB_OK "PowerShell Not Available$\r$\n$\r$\nFoundry MCP Server installed successfully, but PowerShell is required for automatic Claude Desktop configuration.$\r$\n$\r$\n- See manual setup guide in Start Menu$\r$\n- Configure Claude Desktop manually$\r$\n- Contact support if PowerShell should be available"
    Goto config_done
    
  powershell_ok:
    DetailPrint "PowerShell available, executing configuration script..."
    
    ; Execute PowerShell script with installation directory as parameter
    ${PowerShellExecFile} "$INSTDIR\configure-claude.ps1" '"-InstallDir \"$INSTDIR\""'
    Pop $0 ; Exit code
    Pop $1 ; Output/Error messages
    
    ; Check if PowerShell script succeeded
    IntCmp $0 0 config_success config_failed config_failed
    
    config_failed:
      DetailPrint "Direct PowerShell execution failed (exit code: $0)"
      DetailPrint "PowerShell output: $1"
      
      ; Try batch file fallback method
      DetailPrint "Attempting batch file fallback method..."
      nsExec::ExecToStack '"$INSTDIR\configure-claude-wrapper.bat" "$INSTDIR"'
      Pop $5 ; Exit code from batch
      Pop $6 ; Output from batch
      
      IntCmp $5 0 batch_success batch_failed batch_failed
      
      batch_success:
        DetailPrint "Batch fallback method succeeded"
        DetailPrint "Batch output: $6"
        Goto config_success
        
      batch_failed:
        DetailPrint "Batch fallback method also failed (exit code: $5)"
        DetailPrint "Batch output: $6"
        
        ; Extract useful error message from PowerShell output
        StrLen $2 "$1"
        IntCmp $2 0 no_output has_output has_output
        
        no_output:
          StrCpy $3 "No error details available"
          Goto show_error
          
        has_output:
          ; Truncate long output for message box (first 200 chars)
          StrLen $4 "$1"
          IntCmp $4 200 show_full truncate_output show_full
          
          truncate_output:
            StrCpy $3 "$1" 200
            StrCpy $3 "$3..."
            Goto show_error
            
          show_full:
            StrCpy $3 "$1"
            
        show_error:
          ; Extract the first line of the error for a cleaner display
          StrCpy $7 $3 80 ; First 80 characters
          StrCmp $3 $7 short_error 0
          StrCpy $7 "$7..."
          
          short_error:
          ${If} $InstallationSuccess == "true"
            MessageBox MB_ICONEXCLAMATION|MB_OK "Claude Desktop Configuration Failed$\r$\n$\r$\nError: $7$\r$\n$\r$\nFoundry MCP Server installed successfully, but Claude Desktop configuration could not be completed automatically.$\r$\n$\r$\n- Check detailed error log: %TEMP%\foundry-mcp-claude-config.log$\r$\n- See manual setup guide in Start Menu$\r$\n- Restart Claude Desktop after manual configuration"
          ${Else}
            MessageBox MB_ICONEXCLAMATION|MB_OK "Claude Desktop Configuration Failed$\r$\n$\r$\nError: $7$\r$\n$\r$\nInstallation was not completed successfully.$\r$\n$\r$\n- Check detailed error log: %TEMP%\foundry-mcp-claude-config.log$\r$\n- Try running the installer again"
          ${EndIf}
          Goto config_done
        
    config_success:
      DetailPrint "Claude Desktop configured successfully"
      
  config_done:
FunctionEnd

;--------------------------------
; Installer Sections
Section "Foundry MCP Server" SecMain
  SectionIn RO ; Read-only section (required)
  ; Set estimated size: Node.js runtime + MCP server + shared components (~32MB)
  SectionSetSize ${SecMain} 32768

  ; Set output path
  SetOutPath $INSTDIR
  
  ; Install Node.js runtime
  DetailPrint "Installing Node.js runtime..."
  File /r "node\"
  File "node.exe"
  
  ; Install MCP Server files  
  DetailPrint "Installing MCP Server..."
  SetOutPath "$INSTDIR\foundry-mcp-server"
  File /r "foundry-mcp-server\*"
  SetOutPath "$INSTDIR"
  
  ; Install documentation
  File "README.txt"
  File "LICENSE.txt"
  
  ; Install icon for uninstaller
  File "icon.ico"
  
  ; Install PowerShell configuration script and batch wrapper
  File "configure-claude.ps1"
  File "configure-claude-wrapper.bat"
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Create Start Menu shortcuts (minimal set to avoid confusion)
  CreateDirectory "$SMPROGRAMS\Foundry MCP Server"
  CreateShortcut "$SMPROGRAMS\Foundry MCP Server\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  
  ; Add to Windows Programs list
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "DisplayName" "Foundry MCP Server"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "Publisher" "Foundry MCP Bridge"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "DisplayVersion" "${VERSION_BASE}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer" "NoRepair" 1
  
  ; Create utility scripts
  DetailPrint "Creating utility scripts..."
  
  ; Start server script
  FileOpen $0 "$INSTDIR\start-server.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'echo Starting Foundry MCP Server...$\r$\n'
  FileWrite $0 'cd /d "$INSTDIR"$\r$\n'
  FileWrite $0 '"$INSTDIR\node.exe" "$INSTDIR\foundry-mcp-server\packages\mcp-server\dist\index.cjs"$\r$\n'
  FileWrite $0 'pause$\r$\n'
  FileClose $0
  
  ; Test connection script
  FileOpen $0 "$INSTDIR\test-connection.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'echo Testing Foundry MCP Server installation...$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo Checking Node.js...$\r$\n'
  FileWrite $0 '"$INSTDIR\node.exe" --version$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo Checking MCP Server files...$\r$\n'
  FileWrite $0 'if exist "$INSTDIR\foundry-mcp-server\packages\mcp-server\dist\index.cjs" ($\r$\n'
  FileWrite $0 '  echo ✓ MCP Server files found$\r$\n'
  FileWrite $0 ') else ($\r$\n'
  FileWrite $0 '  echo ✗ MCP Server files missing$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo Installation test complete!$\r$\n'
  FileWrite $0 'pause$\r$\n'
  FileClose $0
  
  ; Update Claude Desktop configuration
  DetailPrint "Configuring Claude Desktop..."
  Call UpdateClaudeConfig
  
  ; Success message
  DetailPrint "Foundry MCP Server installation complete!"
  
SectionEnd

; Python Runtime is now included within ComfyUI section

;--------------------------------
; Foundry Module Installation Section
Section "Foundry MCP Bridge" SecFoundryModule
  ; This section is checked by default
  ; Set estimated size: Compiled JS + assets + templates (~5MB)
  SectionSetSize ${SecFoundryModule} 5120

  ; Detect Foundry installation
  DetailPrint "Detecting Foundry VTT installation..."
  Call DetectFoundryInstallation
  
  ; Check if we found a valid Foundry path
  StrCmp $FoundryPath "" module_skipped module_install
  
  module_install:
  DetailPrint "Installing Foundry MCP Bridge Module to: $FoundryPath\foundry-mcp-bridge"
  
  ; Check if module already exists
  IfFileExists "$FoundryPath\foundry-mcp-bridge\module.json" existing_module new_install
  
  existing_module:
  DetailPrint "Existing module installation found - updating files..."
  Goto do_install
  
  new_install:
  DetailPrint "Installing fresh Foundry MCP Bridge module..."
  
  do_install:
  ; Create module directory
  CreateDirectory "$FoundryPath\foundry-mcp-bridge"
  SetOutPath "$FoundryPath\foundry-mcp-bridge"
  SetOverwrite on
  
  ; Copy all module files
  File /r "foundry-module\*"
  
  DetailPrint "Foundry MCP Bridge Module installed successfully"
  Goto module_done
  
  module_skipped:
  DetailPrint "Foundry module installation was skipped"
  
  module_done:
SectionEnd

;--------------------------------
; ComfyUI Map Generation Section
Section "ComfyUI Map Generation" SecComfyUI
  ; Optional section for AI-powered map generation
  ; Will download additional 15.7GB for ComfyUI + AI models
  SectionSetSize ${SecComfyUI} 16515072

  ; Never overwrite an existing ComfyUI tree. This preserves models, custom
  ; nodes, configuration, and generated data even if the component is selected.
  IfFileExists "$INSTDIR\ComfyUI\*.*" preserve_existing_comfyui install_comfyui

  preserve_existing_comfyui:
    DetailPrint "Existing ComfyUI installation found - preserving it unchanged"
    Goto comfyui_done

  install_comfyui:
  DetailPrint "Installing ComfyUI for AI-powered map generation..."

  ; Note: ComfyUI portable build includes its own Python runtime, so no separate Python installation needed
  DetailPrint "Preparing to download ComfyUI portable build with embedded Python..."

  ; ComfyUI directory will be created by 7z extraction

  ; Download ComfyUI portable Windows build
  DetailPrint "Downloading ComfyUI portable Windows build... (running silently)"

  ; Resolve download URL dynamically
  Call ResolveComfyUIDownload
  StrCmp $ComfyUIDownloadURL "" comfy_use_fallback comfy_use_resolved

  comfy_use_resolved:
    DetailPrint "Downloading ComfyUI portable Windows build..."
    Goto comfy_portable_download

  comfy_use_fallback:
    DetailPrint "Downloading ComfyUI portable Windows build..."
    Goto comfy_portable_download

  comfy_portable_download:
    DetailPrint "This may take several minutes depending on your internet connection..."

    ; Download ComfyUI portable Windows build (no git required)
    DetailPrint "Downloading ComfyUI Windows portable build from GitHub (~2GB)..."
    DetailPrint "This will take several minutes depending on your internet speed..."

    ; Create download directory in installation folder to avoid temp space issues
    DetailPrint "Creating download directory..."
    CreateDirectory "$INSTDIR\temp"


    ; Download with extended timeout (20 minutes) for large file
    ; Check if URL resolution succeeded
    StrCmp $ComfyUIDownloadURL "" url_resolution_failed download_comfyui

  url_resolution_failed:
    DetailPrint "Failed to resolve ComfyUI download URL"
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "Failed to resolve ComfyUI download URL from GitHub API.$\r$\n$\r$\nThis may be due to:$\r$\n• Network connectivity issues$\r$\n• GitHub API rate limiting$\r$\n• Firewall blocking API access$\r$\n$\r$\nWould you like to continue without ComfyUI?$\r$\n(You can install it manually later)" IDYES skip_comfyui IDNO comfy_portable_download

  download_comfyui:
    DetailPrint "Using resolved download URL: $ComfyUIDownloadName"
    inetc::get /SILENT /RECEIVETIMEOUT 1200 "$ComfyUIDownloadURL" "$INSTDIR\temp\ComfyUI_windows_portable.7z"
    Pop $0
    StrCmp $0 "OK" download_success download_failed

  download_failed:
    DetailPrint "ComfyUI download failed: $0"
    ; Check if it's a file access issue specifically
    StrCmp $0 "File Open Error" file_access_error generic_download_error

  file_access_error:
    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "File Access Error$\r$\n$\r$\nUnable to create or write to download file.$\r$\n$\r$\nTry running installer as Administrator." IDRETRY comfy_portable_download IDCANCEL skip_comfyui

  generic_download_error:
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "Download Failed: $0$\r$\n$\r$\nWould you like to try an alternative download method?$\r$\n$\r$\nYES - Try PowerShell download$\r$\nNO - Skip ComfyUI installation" IDYES try_alternative_download IDNO skip_comfyui

  try_alternative_download:
    DetailPrint "Attempting alternative download using PowerShell..."

    ; Create PowerShell download script
    FileOpen $6 "$INSTDIR\temp\download-comfyui.ps1" w
    FileWrite $6 'param([string]$$outputPath)$\r$\n'
    FileWrite $6 '$$ProgressPreference = "SilentlyContinue"$\r$\n'
    FileWrite $6 'try {$\r$\n'
    ; Use resolved URL (required)
    FileWrite $6 '  $$uri = "$ComfyUIDownloadURL"$\r$\n'
    FileWrite $6 '  Write-Host "Starting PowerShell download of ComfyUI..."$\r$\n'
    FileWrite $6 '  Invoke-WebRequest -Uri $$uri -OutFile $$outputPath -TimeoutSec 1200$\r$\n'
    FileWrite $6 '  if (Test-Path $$outputPath) {$\r$\n'
    FileWrite $6 '    $$size = [math]::Round((Get-Item $$outputPath).Length / 1MB, 2)$\r$\n'
    FileWrite $6 '    Write-Host "Download completed successfully. Size: $$size MB"$\r$\n'
    FileWrite $6 '    exit 0$\r$\n'
    FileWrite $6 '  } else {$\r$\n'
    FileWrite $6 '    throw "File not created"$\r$\n'
    FileWrite $6 '  }$\r$\n'
    FileWrite $6 '} catch {$\r$\n'
    FileWrite $6 '  Write-Host "PowerShell download failed: $$($$_.Exception.Message)"$\r$\n'
    FileWrite $6 '  exit 1$\r$\n'
    FileWrite $6 '}$\r$\n'
    FileClose $6

    ; Execute PowerShell download
    DetailPrint "Executing PowerShell download (this may take 10-20 minutes)..."
    ${PowerShellExecFile} "$INSTDIR\temp\download-comfyui.ps1" '"$INSTDIR\temp\ComfyUI_windows_portable.7z"'
    Pop $7 ; Exit code
    Pop $8 ; Output

    ; Clean up PowerShell script
    Delete "$INSTDIR\temp\download-comfyui.ps1"

    DetailPrint "PowerShell download exit code: $7"
    DetailPrint "PowerShell output: $8"

    IntCmp $7 0 powershell_download_success powershell_download_failed powershell_download_failed

  powershell_download_failed:
    DetailPrint "PowerShell download also failed"
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "Both download methods failed.$\r$\n$\r$\nWould you like to continue without ComfyUI?$\r$\n(You can install it manually later)" IDYES skip_comfyui IDNO comfy_portable_download

  powershell_download_success:
    DetailPrint "PowerShell download succeeded!"
    Goto download_success

  download_success:
    DetailPrint "ComfyUI downloaded successfully"

    ; Extract the portable build to ComfyUI directory
    ; Using embedded 7zr.exe because ComfyUI archives require full 7z support
    DetailPrint "Extracting ComfyUI portable build (this may take a few minutes)..."
    InitPluginsDir
    File /oname=$PLUGINSDIR\7zr.exe "7zr.exe"
    DetailPrint "Running 7-Zip extraction..."
    nsExec::ExecToStack '"$PLUGINSDIR\7zr.exe" x "-y" "-bsp0" "-bso0" "-o$INSTDIR" "$INSTDIR\temp\ComfyUI_windows_portable.7z"'
    Pop $0 ; Exit code
    Pop $9 ; stdout/stderr output
    IntCmp $0 0 extract_success extract_failed extract_failed

  extract_failed:
    DetailPrint "ComfyUI extraction failed (exit code $0)"
    DetailPrint "7-Zip command: x -y -bsp0 -bso0 -o$INSTDIR"
    DetailPrint "Archive path: $INSTDIR\temp\ComfyUI_windows_portable.7z"
    ${If} $9 != ""
      DetailPrint "7-Zip output: $9"
    ${Else}
      DetailPrint "No 7-Zip output captured"
    ${EndIf}
    ; Cleanup temp files on failure
    Delete "$INSTDIR\temp\ComfyUI_windows_portable.7z"
    RMDir "$INSTDIR\temp"
    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL "ComfyUI extraction failed (exit code $0).$\r$\n$\r$\n7-Zip error details:$\r$\n$9$\r$\n$\r$\nWould you like to retry the download and extraction?" IDRETRY comfy_portable_download IDCANCEL skip_comfyui

  extract_success:
    DetailPrint "ComfyUI extracted successfully"

    ; Clean up downloaded archive
    Delete "$INSTDIR\temp\ComfyUI_windows_portable.7z"
    RMDir "$INSTDIR\temp"

    ; The portable build extracts to ComfyUI_windows_portable, so we need to rename it
    Rename "$INSTDIR\ComfyUI_windows_portable" "$INSTDIR\ComfyUI"


    ; Download essential models for battlemap generation
    DetailPrint "Downloading essential models for map generation..."
    Call DownloadComfyUIModels

    Goto comfyui_scripts

  skip_comfyui:
    DetailPrint "ComfyUI installation skipped"
    Goto comfyui_scripts

  comfyui_scripts:
  ; Create ComfyUI batch scripts
  DetailPrint "Creating ComfyUI utility scripts..."

  ; Start ComfyUI script using portable build's embedded Python
  FileOpen $0 "$INSTDIR\start-comfyui.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'echo Starting ComfyUI for map generation...$\r$\n'
  FileWrite $0 'REM Set defaults if environment variables not set$\r$\n'
  FileWrite $0 'if not defined COMFYUI_HOST set COMFYUI_HOST=127.0.0.1$\r$\n'
  FileWrite $0 'if not defined COMFYUI_PORT set COMFYUI_PORT=31411$\r$\n'
  FileWrite $0 'echo Using ComfyUI Host: %COMFYUI_HOST%$\r$\n'
  FileWrite $0 'echo Using ComfyUI Port: %COMFYUI_PORT%$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'REM Check for ComfyUI portable installation$\r$\n'
  FileWrite $0 'if exist "$INSTDIR\ComfyUI\main.py" ($\r$\n'
  FileWrite $0 '  echo Using ComfyUI portable installation with embedded Python$\r$\n'
  FileWrite $0 '  cd /d "$INSTDIR\ComfyUI"$\r$\n'
  FileWrite $0 '  echo Starting ComfyUI with GPU optimization... > "$INSTDIR\comfyui.log"$\r$\n'
  FileWrite $0 '  "python_embeded\python.exe" main.py --port %COMFYUI_PORT% --listen %COMFYUI_HOST% --disable-auto-launch --dont-print-server >> "$INSTDIR\comfyui.log" 2>&1$\r$\n'
  FileWrite $0 ') else ($\r$\n'
  FileWrite $0 '  echo ERROR: ComfyUI portable installation not found$\r$\n'
  FileWrite $0 '  echo Expected: $INSTDIR\ComfyUI\main.py$\r$\n'
  FileWrite $0 '  echo Please reinstall ComfyUI Map Generation component$\r$\n'
  FileWrite $0 '  pause$\r$\n'
  FileWrite $0 '  exit /b 1$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'pause$\r$\n'
  FileClose $0

  ; Test ComfyUI script with comprehensive checks
  FileOpen $0 "$INSTDIR\test-comfyui.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'echo Testing ComfyUI portable installation...$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo === Checking ComfyUI Portable Installation ===$\r$\n'
  FileWrite $0 'if exist "$INSTDIR\ComfyUI\main.py" ($\r$\n'
  FileWrite $0 '  echo ✓ ComfyUI portable installation found$\r$\n'
  FileWrite $0 '  echo   Location: $INSTDIR\ComfyUI\main.py$\r$\n'
  FileWrite $0 ') else ($\r$\n'
  FileWrite $0 '  echo ✗ ComfyUI portable installation not found$\r$\n'
  FileWrite $0 '  echo   Expected: $INSTDIR\ComfyUI\main.py$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo === Checking Embedded Python ===$\r$\n'
  FileWrite $0 'if exist "$INSTDIR\ComfyUI\python_embeded\python.exe" ($\r$\n'
  FileWrite $0 '  echo ✓ Embedded Python runtime found$\r$\n'
  FileWrite $0 '  echo   Location: $INSTDIR\ComfyUI\python_embeded\python.exe$\r$\n'
  FileWrite $0 '  echo   Version: $\r$\n'
  FileWrite $0 '  "$INSTDIR\ComfyUI\python_embeded\python.exe" --version$\r$\n'
  FileWrite $0 ') else ($\r$\n'
  FileWrite $0 '  echo ✗ Embedded Python runtime not found$\r$\n'
  FileWrite $0 '  echo   Expected: $INSTDIR\ComfyUI\python_embeded\python.exe$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo === Checking PyTorch Installation ===$\r$\n'
  FileWrite $0 'if exist "$INSTDIR\ComfyUI\python_embeded\python.exe" ($\r$\n'
  FileWrite $0 '  echo Testing PyTorch CUDA availability...$\r$\n'
  FileWrite $0 '  cd /d "$INSTDIR\ComfyUI"$\r$\n'
  FileWrite $0 '  "python_embeded\python.exe" -c "import torch; print(f\\\"PyTorch: {torch.__version__}\\\"); print(f\\\"CUDA available: {torch.cuda.is_available()}\\\"); print(f\\\"CUDA devices: {torch.cuda.device_count()}\\\")"$\r$\n'
  FileWrite $0 ') else ($\r$\n'
  FileWrite $0 '  echo Cannot test PyTorch - embedded Python not found$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'echo.$\r$\n'
  FileWrite $0 'echo === Test Complete ===$\r$\n'
  FileWrite $0 'echo If all components show ✓, ComfyUI should work correctly.$\r$\n'
  FileWrite $0 'echo Logs are saved to: $INSTDIR\comfyui.log$\r$\n'
  FileWrite $0 'pause$\r$\n'
  FileClose $0

  ; Add ComfyUI test shortcut to Start Menu (for troubleshooting only)
  CreateShortcut "$SMPROGRAMS\Foundry MCP Server\Test ComfyUI.lnk" "$INSTDIR\test-comfyui.bat" "" "$INSTDIR\icon.ico"

  DetailPrint "ComfyUI installation complete!"

  comfyui_done:
SectionEnd

Function ComponentsPagePre
  ; Section defaults are finalized after .onInit. Clear SF_SELECTED immediately
  ; before the Components page is first rendered so upgrades do not opt in to
  ; ComfyUI, while preserving any later manual selection when navigating back.
  StrCmp $IsUpgrade "true" 0 components_page_done
  StrCmp $UpgradeComponentsInitialized "true" components_page_done

  SectionGetFlags ${SecComfyUI} $0
  IntOp $0 $0 & ${SECTION_OFF}
  SectionSetFlags ${SecComfyUI} $0
  StrCpy $UpgradeComponentsInitialized "true"

  components_page_done:
  Return
FunctionEnd

;--------------------------------
; Section Descriptions
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecMain} "The core Foundry MCP Server that connects Claude Desktop to Foundry VTT. Includes Node.js runtime and MCP server. Required component (~32MB)."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecFoundryModule} "Install the Foundry MCP Bridge module directly to your Foundry VTT for seamless AI-powered campaign management. Includes compiled JavaScript, templates, and assets (~5MB)."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecComfyUI} "Optional AI battlemap generation (~15.7GB total). Includes ComfyUI, Python runtime, SDXL models, and PyTorch."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

;--------------------------------
; Uninstaller Section
Section "Uninstall"
  
  DetailPrint "Starting Foundry MCP Server uninstallation..."
  
  ; Remove MCP Server files and directories
  DetailPrint "Removing MCP Server files..."
  Delete "$INSTDIR\node.exe"
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\node_modules"
  RMDir /r "$INSTDIR\foundry-mcp-server"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\configure-claude.ps1"
  Delete "$INSTDIR\configure-claude-wrapper.bat"
  Delete "$INSTDIR\start-server.bat"
  Delete "$INSTDIR\test-connection.bat"
  Delete "$INSTDIR\start-comfyui.bat"
  Delete "$INSTDIR\test-comfyui.bat"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.txt"
  Delete "$INSTDIR\icon.ico"

  ; Remove ComfyUI portable installation
  DetailPrint "Removing ComfyUI portable installation..."
  RMDir /r "$INSTDIR\ComfyUI"
  RMDir /r "$INSTDIR\ComfyUI"

  ; Remove any remaining files in installation directory
  Delete "$INSTDIR\*.*"
  
  ; Remove Start Menu shortcuts
  DetailPrint "Removing Start Menu shortcuts..."
  RMDir /r "$SMPROGRAMS\Foundry MCP Server"
  
  ; Remove registry entries
  DetailPrint "Removing registry entries..."
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\FoundryMCPServer"
  
  ; Ask about Foundry module removal
  MessageBox MB_YESNO "Do you want to remove the Foundry MCP Bridge module from your Foundry VTT installation?$\r$\n$\r$\n(This will not affect your worlds, actors, or other Foundry data)" IDYES remove_foundry_module IDNO skip_foundry_removal
  
  remove_foundry_module:
  DetailPrint "Checking for Foundry module installation..."
  Call un.DetectFoundryModule
  StrCmp $un.FoundryPath "" foundry_not_found remove_foundry_files
  
  remove_foundry_files:
  DetailPrint "Removing Foundry MCP Bridge module from: $un.FoundryPath"
  RMDir /r "$un.FoundryPath\foundry-mcp-bridge"
  IfFileExists "$un.FoundryPath\foundry-mcp-bridge" foundry_removal_failed foundry_removal_success
  
  foundry_removal_failed:
  DetailPrint "Warning: Could not completely remove Foundry module files"
  Goto skip_foundry_removal
  
  foundry_removal_success:
  DetailPrint "Foundry MCP Bridge module removed successfully"
  Goto skip_foundry_removal
  
  foundry_not_found:
  DetailPrint "Foundry module installation not detected"
  
  skip_foundry_removal:
  
  ; Ask about Claude Desktop configuration removal
  MessageBox MB_YESNO "Do you want to remove the Foundry MCP Server entry from your Claude Desktop configuration?$\r$\n$\r$\n(Recommended - this will not affect other MCP servers)" IDYES remove_claude_config IDNO skip_claude_config
  
  remove_claude_config:
  DetailPrint "Removing Claude Desktop configuration entry..."
  Call un.RemoveClaudeConfig
  Goto skip_claude_config
  
  skip_claude_config:
  
  ; Remove installation directory
  RMDir "$INSTDIR"
  Delete "$INSTDIR\Uninstall.exe"
  
  DetailPrint "Uninstallation completed successfully"
  MessageBox MB_ICONINFORMATION "Foundry MCP Server has been successfully uninstalled.$\r$\n$\r$\nIf you removed the Claude Desktop configuration, please restart Claude Desktop."
  
SectionEnd

Function un.DetectFoundryModule
  ; Try to detect Foundry module installation for removal
  StrCpy $un.FoundryPath ""
  
  ; Check primary location
  StrCpy $un.FoundryPath "$LOCALAPPDATA\FoundryVTT\Data\modules"
  IfFileExists "$un.FoundryPath\foundry-mcp-bridge\module.json" foundry_module_found
  
  ; Check secondary location
  StrCpy $un.FoundryPath "$APPDATA\FoundryVTT\Data\modules"
  IfFileExists "$un.FoundryPath\foundry-mcp-bridge\module.json" foundry_module_found
  
  ; Check environment variable
  ReadEnvStr $0 "FOUNDRY_VTT_DATA_PATH"
  StrCmp $0 "" manual_search
  StrCpy $un.FoundryPath "$0\Data\modules"
  IfFileExists "$un.FoundryPath\foundry-mcp-bridge\module.json" foundry_module_found
  
  manual_search:
  ; Ask user to locate Foundry installation
  MessageBox MB_YESNO "Foundry MCP Bridge module not found automatically.$\r$\n$\r$\nWould you like to browse for your Foundry User Data folder to remove the module?" IDYES browse_for_foundry IDNO module_not_found
  
  browse_for_foundry:
  nsDialogs::SelectFolderDialog "Select Foundry VTT User Data Folder" "$LOCALAPPDATA"
  Pop $0
  StrCmp $0 CANCEL module_not_found
  StrCpy $un.FoundryPath "$0\Data\modules"
  IfFileExists "$un.FoundryPath\foundry-mcp-bridge\module.json" foundry_module_found
  
  module_not_found:
  StrCpy $un.FoundryPath ""
  Return
  
  foundry_module_found:
  DetailPrint "Found Foundry module at: $un.FoundryPath\foundry-mcp-bridge"
FunctionEnd

Function un.GetClaudeConfigPath
  ; Find Claude Desktop configuration file
  StrCpy $un.ClaudeConfigPath "$APPDATA\Claude\claude_desktop_config.json"
  IfFileExists $un.ClaudeConfigPath config_found
  StrCpy $un.ClaudeConfigPath "$LOCALAPPDATA\Claude\claude_desktop_config.json"
  IfFileExists $un.ClaudeConfigPath config_found
  StrCpy $un.ClaudeConfigPath ""
  
  config_found:
FunctionEnd

Function un.RemoveClaudeConfig
  ; Remove Foundry MCP Server entry from Claude Desktop config
  Call un.GetClaudeConfigPath
  StrCmp $un.ClaudeConfigPath "" no_config_found
  
  ; Create backup before modification  
  StrCpy $2 "$un.ClaudeConfigPath.backup"
  CopyFiles $un.ClaudeConfigPath "$2"
  DetailPrint "Created backup at: $2"
  
  ; Create temporary PowerShell script for config removal
  FileOpen $4 "$TEMP\remove-foundry-mcp.ps1" w
  FileWrite $4 "try {$\r$\n"
  FileWrite $4 "  Write-Host 'Removing foundry-mcp from Claude Desktop config'$\r$\n"
  FileWrite $4 "  $$configPath = '$un.ClaudeConfigPath'$\r$\n"
  FileWrite $4 "  Write-Host 'Config path:' $$configPath$\r$\n"
  FileWrite $4 "  $$config = Get-Content $$configPath -Raw | ConvertFrom-Json$\r$\n"
  FileWrite $4 "  if ($$config.mcpServers -and $$config.mcpServers.'foundry-mcp') {$\r$\n"
  FileWrite $4 "    $$config.mcpServers.PSObject.Properties.Remove('foundry-mcp')$\r$\n"
  FileWrite $4 "    $$json = $$config | ConvertTo-Json -Depth 10$\r$\n"
  FileWrite $4 "    [System.IO.File]::WriteAllText($$configPath, $$json, [System.Text.UTF8Encoding]::new($$false))$\r$\n"
  FileWrite $4 "    Write-Host 'SUCCESS: foundry-mcp entry removed from Claude config'$\r$\n"
  FileWrite $4 "  } else {$\r$\n"
  FileWrite $4 "    Write-Host 'INFO: foundry-mcp entry not found in config'$\r$\n"
  FileWrite $4 "  }$\r$\n"
  FileWrite $4 "} catch {$\r$\n"
  FileWrite $4 "  Write-Host 'ERROR:' $$_.Exception.Message$\r$\n"
  FileWrite $4 "  exit 1$\r$\n"
  FileWrite $4 "}$\r$\n"
  FileClose $4
  
  ; Execute the temporary PowerShell script
  ${PowerShellExecWithOutput} 'powershell.exe -inputformat none -NoProfile -ExecutionPolicy Bypass -File "$TEMP\remove-foundry-mcp.ps1"'
  
  ; Clean up temp script
  Delete "$TEMP\remove-foundry-mcp.ps1"
  Pop $0 ; Exit code
  Pop $1 ; Output
  
  IntCmp $0 0 config_success config_failed config_failed
  
  config_success:
  DetailPrint "Claude Desktop configuration updated successfully"
  DetailPrint "PowerShell output: $1"
  Return
  
  config_failed:
  DetailPrint "Failed to update Claude Desktop configuration (exit code: $0)"
  DetailPrint "PowerShell output: $1"
  MessageBox MB_ICONEXCLAMATION "Failed to remove Foundry MCP Server from Claude Desktop configuration.$\r$\n$\r$\nYou may need to manually remove the 'foundry-mcp' entry from:$\r$\n$un.ClaudeConfigPath$\r$\n$\r$\nA backup was created at:$\r$\n$un.ClaudeConfigPath.backup"
  Return
  
  no_config_found:
  DetailPrint "Claude Desktop configuration file not found"
  MessageBox MB_ICONINFORMATION "Claude Desktop configuration file not found - no configuration changes needed."
FunctionEnd
