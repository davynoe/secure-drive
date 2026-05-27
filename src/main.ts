import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  listFileMetadata,
  listAllSyncConnections,
  listSyncConnections,
  deleteSyncConnection,
  replaceFileMetadataForConnection,
  upsertFileMetadata,
  upsertSyncConnection,
} from './syncStore';
import { syncAllConnections } from './backendSync';
import { initializeSyncWatchers, listScanningPaths, registerConnectionWatcher, stopAllSyncWatchers, stopConnectionWatcher } from './syncWatcher';

declare const __API_BASE_URL__: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function getAppIconPath(): string {
  return path.join(app.getAppPath(), 'appicon.png');
}

function getTrayImage() {
  return nativeImage.createFromPath(getAppIconPath());
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) {
    return;
  }

  tray = new Tray(getTrayImage());
  tray.setToolTip('Secure Drive');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Secure Drive',
      click: () => showMainWindow(),
    },
    {
      label: 'Sync Now',
      click: () => {
        void syncAllConnections();
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit Secure Drive',
      click: () => {
        isQuitting = true;
        stopAllSyncWatchers();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => showMainWindow());
}

const createWindow = () => {
  if (mainWindow) {
    return mainWindow;
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Secure Drive',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide the default application menu bar (File/Edit/View) on Windows/Linux.
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);
  Menu.setApplicationMenu(null);

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
};

type FolderEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size: number | null;
};

type SyncConnectionInput = {
  ownerUserId: number;
  remoteConnectionId?: number | null;
  folderPath: string;
  folderName: string;
  collaborator: string | null;
  lastSyncedChangeId?: number;
};

type FileMetadataInput = {
  filename: string;
  relativePath: string;
  size: number | null;
  lastModified: number;
  contentHash?: string | null;
  isDirectory?: boolean;
  isVirus?: number | null;
  skipScan?: boolean;
  deleted?: boolean;
};

ipcMain.handle('secure-drive:pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('secure-drive:list-folder', async (_event, folderPath: string): Promise<FolderEntry[]> => {
  if (!folderPath || typeof folderPath !== 'string') {
    return [];
  }

  const dirents = await fs.readdir(folderPath, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (dirent): Promise<FolderEntry> => {
      const fullPath = path.join(folderPath, dirent.name);
      if (dirent.isDirectory()) {
        return {
          name: dirent.name,
          path: fullPath,
          kind: 'directory',
          size: null,
        };
      }

      let size: number | null = null;
      try {
        const stats = await fs.stat(fullPath);
        size = stats.size;
      } catch {
        size = null;
      }

      return {
        name: dirent.name,
        path: fullPath,
        kind: 'file',
        size,
      };
    })
  );

  return entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
});

ipcMain.handle('secure-drive:list-scanning-paths', async () => listScanningPaths());

ipcMain.handle('secure-drive:delete-file', async (_event, filePath: string) => {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  try {
    await fs.rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('secure-drive:list-sync-connections', async (_event, ownerUserId: number) => {
  if (typeof ownerUserId !== 'number' || Number.isNaN(ownerUserId)) {
    return [];
  }

  return listSyncConnections(ownerUserId);
});

ipcMain.handle('secure-drive:upsert-sync-connection', async (_event, input: SyncConnectionInput) => {
  if (
    typeof input?.ownerUserId !== 'number' ||
    typeof input.folderPath !== 'string' ||
    typeof input.folderName !== 'string'
  ) {
    return null;
  }

  const connection = upsertSyncConnection({
    ownerUserId: input.ownerUserId,
    remoteConnectionId: typeof input.remoteConnectionId === 'number' ? input.remoteConnectionId : null,
    folderPath: input.folderPath,
    folderName: input.folderName,
    collaborator: typeof input.collaborator === 'string' ? input.collaborator : null,
    lastSyncedChangeId: typeof input.lastSyncedChangeId === 'number' ? input.lastSyncedChangeId : 0,
  });

  void registerConnectionWatcher(connection);
  return connection;
});

ipcMain.handle('secure-drive:list-file-metadata', async (_event, connectionId: number) => {
  if (typeof connectionId !== 'number' || Number.isNaN(connectionId)) {
    return [];
  }

  return listFileMetadata(connectionId);
});

ipcMain.handle('secure-drive:upsert-file-metadata', async (_event, connectionId: number, input: FileMetadataInput) => {
  if (
    typeof connectionId !== 'number' ||
    Number.isNaN(connectionId) ||
    typeof input?.filename !== 'string' ||
    typeof input.relativePath !== 'string' ||
    typeof input.lastModified !== 'number'
  ) {
    return null;
  }

  return upsertFileMetadata(connectionId, {
    filename: input.filename,
    relativePath: input.relativePath,
    size: typeof input.size === 'number' || input.size === null ? input.size : null,
    lastModified: input.lastModified,
    contentHash: typeof input.contentHash === 'string' ? input.contentHash : null,
    isDirectory: Boolean(input.isDirectory),
    isVirus: typeof input.isVirus === 'number' ? input.isVirus : null,
    skipScan: Boolean(input.skipScan),
    deleted: Boolean(input.deleted),
  });
});

ipcMain.handle('secure-drive:replace-file-metadata', async (_event, connectionId: number, files: FileMetadataInput[]) => {
  if (typeof connectionId !== 'number' || Number.isNaN(connectionId) || !Array.isArray(files)) {
    return [];
  }

  return replaceFileMetadataForConnection(
    connectionId,
    files.map((file) => ({
      filename: file.filename,
      relativePath: file.relativePath,
      size: typeof file.size === 'number' || file.size === null ? file.size : null,
      lastModified: file.lastModified,
      contentHash: typeof file.contentHash === 'string' ? file.contentHash : null,
      isDirectory: Boolean(file.isDirectory),
      isVirus: typeof file.isVirus === 'number' ? file.isVirus : null,
      skipScan: Boolean(file.skipScan),
      deleted: Boolean(file.deleted),
    })),
  );
});

ipcMain.handle('secure-drive:delete-sync-connection', async (_event, connectionId: number) => {
  if (typeof connectionId !== 'number' || Number.isNaN(connectionId)) {
    return false;
  }

  stopConnectionWatcher(connectionId);
  return deleteSyncConnection(connectionId);
});

ipcMain.handle('secure-drive:sync-now', async () => {
  await syncAllConnections();
  return true;
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  createWindow();
  createTray();

  try {
    await initializeSyncWatchers(listAllSyncConnections());
  } catch (error) {
    console.error('Failed to initialize sync watchers:', error);
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Keep the app alive in the tray/taskbar on desktop platforms.
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopAllSyncWatchers();
});