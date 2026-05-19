import { app } from 'electron';
import { execFile } from 'node:child_process';
import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pullRemoteChanges, syncConnectionToBackend } from './backendSync';
import { getSyncConnectionById, syncFileMetadataSnapshot, type FileMetadataInput, type SyncConnection } from './syncStore';

const execFileAsync = promisify(execFile);
const malwareScannerName = process.platform === 'win32' ? 'malware_scanner.exe' : 'malware_scanner';
const malwareScannerPath = path.join(app.getAppPath(), malwareScannerName);

type ConnectionWatchState = {
  connection: SyncConnection;
  watchers: FSWatcher[];
  debounceTimer: NodeJS.Timeout | null;
  pollTimer: NodeJS.Timeout | null;
  refreshing: boolean;
  polling: boolean;
  pendingRefresh: boolean;
  refreshSuppressed: boolean;
};

const connectionWatchStates = new Map<number, ConnectionWatchState>();
const CONNECTION_POLL_INTERVAL_MS = 3000;

async function collectDirectorySnapshot(folderPath: string): Promise<FileMetadataInput[]> {
  const results: FileMetadataInput[] = [];

  async function scanForVirus(fullPath: string, isExecutable: boolean): Promise<boolean> {
    if (!isExecutable) {
      return false;
    }

    try {
      const result = await execFileAsync(malwareScannerPath, [fullPath, '--exit-code']);
      // Parse stdout output - scanner outputs "0" or "1"
      const output = result.stdout?.toString().trim() ?? '0';
      return output === '1';
    } catch (error: any) {
      // Check stdout even on error
      if (error?.stdout) {
        const output = error.stdout.toString().trim();
        return output === '1';
      }
      return false;
    }
  }

  const visitDirectory = async (currentPath: string) => {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(folderPath, fullPath).split(path.sep).join('/');

      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }

      const isDirectory = entry.isDirectory();
      const isVirus = await scanForVirus(fullPath, !isDirectory && path.extname(entry.name).toLowerCase() === '.exe');
      results.push({
        filename: entry.name,
        relativePath,
        size: isDirectory ? null : stats.size,
        lastModified: Math.floor(stats.mtimeMs),
        isDirectory,
        isVirus,
        deleted: false,
      });

      if (isDirectory) {
        await visitDirectory(fullPath);
      }
    }
  };

  await visitDirectory(folderPath);
  return results;
}

function clearConnectionWatchers(connectionId: number): void {
  const state = connectionWatchStates.get(connectionId);
  if (!state) {
    return;
  }

  stopConnectionPolling(state);
  closeStateWatchers(state);
  connectionWatchStates.delete(connectionId);
}

function closeStateWatchers(state: ConnectionWatchState): void {
  for (const watcher of state.watchers) {
    watcher.close();
  }

  state.watchers = [];

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
}

function stopConnectionPolling(state: ConnectionWatchState): void {
  if (!state.pollTimer) {
    return;
  }

  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function startConnectionPolling(connectionId: number): void {
  const state = connectionWatchStates.get(connectionId);
  if (!state || state.pollTimer) {
    return;
  }

  state.pollTimer = setInterval(() => {
    const currentState = connectionWatchStates.get(connectionId);
    if (!currentState || currentState.polling || currentState.refreshing) {
      return;
    }

    const latestConnection = getSyncConnectionById(connectionId) ?? currentState.connection;
    currentState.connection = latestConnection;
    currentState.polling = true;

    void pullRemoteChanges(latestConnection).finally(() => {
      const nextState = connectionWatchStates.get(connectionId);
      if (!nextState) {
        return;
      }

      nextState.polling = false;
    });
  }, CONNECTION_POLL_INTERVAL_MS);
}

async function createDirectoryWatchers(connection: SyncConnection): Promise<FSWatcher[]> {
  const watchedDirectories = new Set<string>();
  const watchers: FSWatcher[] = [];

  const addWatcher = (directoryPath: string) => {
    if (watchedDirectories.has(directoryPath)) {
      return;
    }

    watchedDirectories.add(directoryPath);
    try {
      const watcher = watch(directoryPath, { persistent: true }, () => {
        scheduleConnectionRefresh(connection.id);
      });

      watcher.on('error', () => {
        scheduleConnectionRefresh(connection.id);
      });

      watchers.push(watcher);
    } catch {
      // Ignore directories that cannot be watched; a future rescan may recover them.
    }
  };

  const visitDirectory = async (currentPath: string) => {
    addWatcher(currentPath);

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      await visitDirectory(path.join(currentPath, entry.name));
    }
  };

  await visitDirectory(connection.folderPath);
  return watchers;
}

async function refreshConnection(connection: SyncConnection): Promise<void> {
  const state = connectionWatchStates.get(connection.id);
  if (!state) {
    return;
  }

  if (state.refreshing) {
    state.pendingRefresh = true;
    return;
  }

  state.refreshing = true;
  state.pendingRefresh = false;

  try {
    const snapshot = await collectDirectorySnapshot(connection.folderPath);
    syncFileMetadataSnapshot(connection.id, snapshot);
  } catch {
    syncFileMetadataSnapshot(connection.id, []);
  }

  const latestConnection = getSyncConnectionById(connection.id) ?? connection;
  state.connection = latestConnection;
  void syncConnectionToBackend(latestConnection);

  closeStateWatchers(state);

  try {
    state.watchers = await createDirectoryWatchers(connection);
  } catch {
    // Leave the snapshot in place even if watchers cannot be re-established.
  }

  state.refreshing = false;

  if (state.pendingRefresh) {
    scheduleConnectionRefresh(connection.id);
  }
}

function scheduleConnectionRefresh(connectionId: number): void {
  const state = connectionWatchStates.get(connectionId);
  if (!state) {
    return;
  }

  if (state.refreshSuppressed) {
    state.pendingRefresh = true;
    return;
  }

  if (state.refreshing) {
    state.pendingRefresh = true;
    return;
  }

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = setTimeout(() => {
    const connectionState = connectionWatchStates.get(connectionId);
    if (!connectionState) {
      return;
    }

    connectionState.debounceTimer = null;
    void refreshConnectionState(connectionId);
  }, 300);
}

async function refreshConnectionState(connectionId: number): Promise<void> {
  const state = connectionWatchStates.get(connectionId);
  if (!state) {
    return;
  }

  await refreshConnection(state.connection);
}

export function registerConnectionWatcher(connection: SyncConnection): Promise<void> {
  clearConnectionWatchers(connection.id);

  const state: ConnectionWatchState = {
    connection,
    watchers: [],
    debounceTimer: null,
    pollTimer: null,
    refreshing: false,
    polling: false,
    pendingRefresh: false,
    refreshSuppressed: false,
  };

  connectionWatchStates.set(connection.id, state);
  startConnectionPolling(connection.id);
  return refreshConnection(connection);
}

export async function initializeSyncWatchers(connections: SyncConnection[]): Promise<void> {
  await Promise.all(connections.map((connection) => registerConnectionWatcher(connection)));
}

export function stopAllSyncWatchers(): void {
  for (const connectionId of connectionWatchStates.keys()) {
    clearConnectionWatchers(connectionId);
  }
}

export async function runWithConnectionRefreshSuppressed<T>(
  connectionId: number,
  task: () => Promise<T>,
  options?: { schedulePendingRefresh?: boolean },
): Promise<T> {
  const state = connectionWatchStates.get(connectionId);
  if (!state) {
    return task();
  }

  const shouldSchedulePendingRefresh = options?.schedulePendingRefresh ?? true;

  state.refreshSuppressed = true;

  try {
    return await task();
  } finally {
    state.refreshSuppressed = false;

    if (state.pendingRefresh) {
      if (shouldSchedulePendingRefresh) {
        state.pendingRefresh = false;
        scheduleConnectionRefresh(connectionId);
      } else {
        state.pendingRefresh = false;
      }
    }
  }
}
