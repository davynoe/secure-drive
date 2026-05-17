import { watch } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { syncConnectionToBackend } from './backendSync';
import { getSyncConnectionById, syncFileMetadataSnapshot } from './syncStore';
const connectionWatchStates = new Map();
async function collectDirectorySnapshot(folderPath) {
    const results = [];
    const visitDirectory = async (currentPath) => {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const relativePath = path.relative(folderPath, fullPath).split(path.sep).join('/');
            let stats;
            try {
                stats = await fs.stat(fullPath);
            }
            catch {
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
function clearConnectionWatchers(connectionId) {
    const state = connectionWatchStates.get(connectionId);
    if (!state) {
        return;
    }
    closeStateWatchers(state);
    connectionWatchStates.delete(connectionId);
}
function closeStateWatchers(state) {
    for (const watcher of state.watchers) {
        watcher.close();
    }
    state.watchers = [];
    if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
    }
}
async function createDirectoryWatchers(connection) {
    const watchedDirectories = new Set();
    const watchers = [];
    const addWatcher = (directoryPath) => {
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
        }
        catch {
            // Ignore directories that cannot be watched; a future rescan may recover them.
        }
    };
    const visitDirectory = async (currentPath) => {
        addWatcher(currentPath);
        let entries;
        try {
            entries = await fs.readdir(currentPath, { withFileTypes: true });
        }
        catch {
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
async function refreshConnection(connection) {
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
    }
    catch {
        syncFileMetadataSnapshot(connection.id, []);
    }
    const latestConnection = getSyncConnectionById(connection.id) ?? connection;
    state.connection = latestConnection;
    void syncConnectionToBackend(latestConnection);
    closeStateWatchers(state);
    try {
        state.watchers = await createDirectoryWatchers(connection);
    }
    catch {
        // Leave the snapshot in place even if watchers cannot be re-established.
    }
    state.refreshing = false;
    if (state.pendingRefresh) {
        scheduleConnectionRefresh(connection.id);
    }
}
function scheduleConnectionRefresh(connectionId) {
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
async function refreshConnectionState(connectionId) {
    const state = connectionWatchStates.get(connectionId);
    if (!state) {
        return;
    }
    await refreshConnection(state.connection);
}
export function registerConnectionWatcher(connection) {
    clearConnectionWatchers(connection.id);
    const state = {
        connection,
        watchers: [],
        debounceTimer: null,
        refreshing: false,
        pendingRefresh: false,
        refreshSuppressed: false,
    };
    connectionWatchStates.set(connection.id, state);
    return refreshConnection(connection);
}
export async function initializeSyncWatchers(connections) {
    await Promise.all(connections.map((connection) => registerConnectionWatcher(connection)));
}
export function stopAllSyncWatchers() {
    for (const connectionId of connectionWatchStates.keys()) {
        clearConnectionWatchers(connectionId);
    }
}
export async function runWithConnectionRefreshSuppressed(connectionId, task, options) {
    const state = connectionWatchStates.get(connectionId);
    if (!state) {
        return task();
    }
    const shouldSchedulePendingRefresh = options?.schedulePendingRefresh ?? true;
    state.refreshSuppressed = true;
    try {
        return await task();
    }
    finally {
        state.refreshSuppressed = false;
        if (state.pendingRefresh) {
            if (shouldSchedulePendingRefresh) {
                state.pendingRefresh = false;
                scheduleConnectionRefresh(connectionId);
            }
            else {
                state.pendingRefresh = false;
            }
        }
    }
}
//# sourceMappingURL=syncWatcher.js.map