# Leaf IDE

## Executive Summary
Leaf is a lightweight, local-first integrated development environment engineered for maximum performance and data privacy. It operates entirely on the host machine without telemetry, external authentication dependencies, or cloud integration. The primary objective is to provide a highly responsive, secure development environment suitable for sensitive or proprietary codebases.

## Architecture Overview
The application utilizes a modern, cross-platform technology stack optimized for low latency and minimal resource consumption.
- **Frontend Layer**: React and TypeScript, bundled via Vite.
- **Backend Service**: Rust via the Tauri framework, providing native OS integration and secure file system access.
- **Editor Engine**: Monaco Editor (`@monaco-editor/react`), supporting over 80 languages with advanced syntax evaluation.
- **Data Persistence**: SQLite (`rusqlite`), executing locally to manage metadata such as the interactive Knowledge Graph.
- **Terminal Subsystem**: xterm.js integration for direct host shell access.

## Core Capabilities
- **Interactive Knowledge Graph**: Generates a force-directed visual representation of the workspace architecture. Nodes map directly to source code definitions, allowing instantaneous navigation via automated SQLite queries.
- **Cross-Platform Compatibility**: Native compilation targets for macOS, Windows, and Linux environments.
- **Zero-Egress Security Model**: All operations, data parsing, and caching occur locally. No network egress is required for core functionality.

## Deployment and Installation
Automated continuous integration is handled via GitHub Actions. Pre-compiled binaries are generated for all supported operating systems upon release.

1. Navigate to the repository's Releases page.
2. Download the appropriate artifact for the target operating system:
   - **macOS**: `leaf-vX.Y.Z.app.tar.gz` or `.dmg`
   - **Windows**: `leaf-vX.Y.Z-setup.exe`
   - **Linux**: `leaf-vX.Y.Z.AppImage` or `.deb`
3. Execute the installer.

## Development Environment
The repository utilizes DevContainers to ensure a standardized, reproducible build environment across the engineering team.

### Setup Instructions
1. Clone the repository to the local workstation.
2. Open the directory within Visual Studio Code.
3. Accept the prompt to "Reopen in Container". The Docker daemon will automatically provision an isolated environment containing Node.js, Rust, and the required C++ toolchains.

### Manual Build Procedures
For local compilation outside the DevContainer:
```bash
# Initialize frontend dependencies
npm install

# Compile and launch the application in development mode
npm run tauri dev
```


