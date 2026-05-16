import { watch, type FSWatcher } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { syncFileMetadataSnapshot, type FileMetadataInput, type SyncConnection } from './syncStore';

type ConnectionWatchState = {
  connection: SyncConnection;
  watchers: FSWatcher[];
  debounceTimer: NodeJS.Timeout | null;
  refreshing: boolean;
  pendingRefresh: boolean;
};

const connectionWatchStates = new Map<number, ConnectionWatchState>();

async function collectDirectorySnapshot(folderPath: string): Promise<FileMetadataInput[]> {
  const results: FileMetadataInput[] = [];

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
      results.push({
        filename: entry.name,
        relativePath,
        size: isDirectory ? null : stats.size,
        lastModified: Math.floor(stats.mtimeMs),
        isDirectory,
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
    refreshing: false,
    pendingRefresh: false,
  };

  connectionWatchStates.set(connection.id, state);
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
