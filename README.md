# Secure Drive

A secure Electron desktop application for bidirectional file synchronization between collaborators with built-in AI-powered malware detection. Two users establish a sync connection, select folders, and the app handles real-time file synchronization with automatic malware scanning on all executable files.

**Problems Solved:**
- Eliminates manual file transfers with automated background sync
- Simplifies access control with straightforward two-user connections
- Provides a single source of truth on the server
- Ensures security of the files via it's malware detector

## Features

- **Bidirectional Real-time Sync**: Two-way file synchronization with automatic change detection
- **File Watcher**: Monitors folders for INSERT, DELETE, RENAME, UPDATE operations
- **Malware Detection**: Every executable file is scanned before sync using a trained DNN model (98.56% accuracy)
- **Connection Management**: Establish and manage sync connections between trusted collaborators
- **Single Source of Truth**: Server maintains canonical state; local changes upload, remote changes download
- **WebSocket Support**: Real-time synchronization notifications

## Key Components

- **Malware Scanner**: DNN-based static malware analyzer that scans PE headers. See [sd-malware-detector](https://github.com/davynoe/sd-malware-detector) for model details.
- **Backend Sync** (`backendSync.ts`): Orchestrates file synchronization across connections
- **Sync Store** (`syncStore.ts`): SQLite database for storing sync metadata and file information
- **Sync Watcher** (`syncWatcher.ts`): Monitors folders for file system changes

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/davynoe/secure-drive
cd secure-drive
```

2. Install dependencies:
```bash
npm install
```

3. Start the development environment:
```bash
npm start
```

## Architecture

**Application Flow:**
1. Users authenticate with credentials
2. Establish sync connection between two collaborators
3. Each user selects a local folder to sync
4. App handles bidirectional synchronization in background

**Main Process** (`main.ts`): Manages Electron lifecycle, IPC, file watchers, and malware scanning
**Renderer Process** (`App.tsx`, pages): React-based UI for authentication and collaboration
**Sync Engine** (`syncWatcher.ts`): Watches folders for changes, stores metadata in SQLite, coordinates uploads/downloads

## Security

- Executable files scanned using trained DNN model before sync
- Static PE header analysis (no dynamic execution) for fast, safe scanning
- User authentication and connection verification required
- Server maintains canonical source of truth

## Authors

- Eren Tanyaş: [davynoe](https://github.com/davynoe)
- Ali İhsan Cengiz: [battista26](https://github.com/battista26)
