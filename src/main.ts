import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

type FolderEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size: number | null;
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});