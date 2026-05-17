import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listAllSyncConnections, listFileMetadata, replaceFileMetadataForConnection, updateSyncConnection, } from './syncStore';
import { runWithConnectionRefreshSuppressed } from './syncWatcher';
function getApiBaseUrl() {
    const value = typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__.trim() : '';
    return value.length > 0 ? value : null;
}
async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }
}
function normalizeRelativePath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0 || segments.some((segment) => segment === '..')) {
        throw new Error('Invalid relative path.');
    }
    return segments.join('/');
}
function getLocalAbsolutePath(connection, relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    return path.join(connection.folderPath, ...normalized.split('/'));
}
function resolveRemotePath(file) {
    const candidate = file.relativePath ?? file.relative_path;
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
        return null;
    }
    try {
        return normalizeRelativePath(candidate);
    }
    catch {
        return null;
    }
}
function isRemoteDirectory(file) {
    const value = file.isDirectory ?? file.is_directory;
    return value === true || value === 1;
}
function isRemoteDeleted(file) {
    const value = file.deleted;
    return value === true || value === 1;
}
function mapRemoteMetadataToLocalInput(file) {
    const relativePath = resolveRemotePath(file);
    if (!relativePath) {
        return null;
    }
    const isDirectory = isRemoteDirectory(file);
    const filenameFromPath = relativePath.split('/').filter(Boolean).pop() ?? relativePath;
    const filename = typeof file.filename === 'string' && file.filename.trim().length > 0 ? file.filename : filenameFromPath;
    return {
        filename,
        relativePath,
        size: typeof file.size === 'number' || file.size === null ? file.size : null,
        lastModified: typeof (file.lastModified ?? file.last_modified) === 'number' ? (file.lastModified ?? file.last_modified) : Date.now(),
        contentHash: (file.contentHash ?? file.content_hash) ?? null,
        isDirectory,
        deleted: isRemoteDeleted(file),
    };
}
function hashContent(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
async function pushLocalSnapshot(connection, apiBaseUrl) {
    const files = listFileMetadata(connection.id);
    for (const file of files) {
        const payload = {
            actorUserId: connection.ownerUserId,
            relativePath: file.relativePath,
            filename: file.filename,
            isDirectory: file.isDirectory ? 1 : 0,
            size: file.size,
            contentHash: file.contentHash,
            deleted: file.deleted ? 1 : 0,
        };
        if (!file.deleted && !file.isDirectory) {
            const localFilePath = getLocalAbsolutePath(connection, file.relativePath);
            try {
                const content = await fs.readFile(localFilePath);
                payload.contentBase64 = content.toString('base64');
                payload.size = content.length;
                payload.contentHash = hashContent(content);
            }
            catch {
                payload.deleted = 1;
            }
        }
        await postJson(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/file`, payload);
    }
}
async function getRemoteChanges(connection, apiBaseUrl) {
    const changesResponse = await fetch(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/changes?cursor=${connection.lastSyncedChangeId}&limit=1000`);
    if (!changesResponse.ok) {
        throw new Error(`Failed to fetch remote changes (${changesResponse.status}).`);
    }
    const data = (await changesResponse.json());
    if (!Array.isArray(data.changes)) {
        return [];
    }
    return data.changes;
}
async function getRemoteFiles(connection, apiBaseUrl) {
    const filesResponse = await fetch(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/files?userId=${encodeURIComponent(String(connection.ownerUserId))}`);
    if (!filesResponse.ok) {
        throw new Error(`Failed to fetch remote files (${filesResponse.status}).`);
    }
    const data = (await filesResponse.json());
    if (!Array.isArray(data.files)) {
        return [];
    }
    return data.files;
}
async function downloadRemoteFile(connection, apiBaseUrl, relativePath) {
    const fileResponse = await fetch(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/file?userId=${encodeURIComponent(String(connection.ownerUserId))}&path=${encodeURIComponent(relativePath)}`);
    if (!fileResponse.ok) {
        throw new Error(`Failed to download file (${fileResponse.status}) for ${relativePath}`);
    }
    const arrayBuffer = await fileResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
function collectChangedPaths(changes) {
    const paths = new Set();
    for (const change of changes) {
        const pathBefore = change.pathBefore ?? change.path_before;
        const pathAfter = change.pathAfter ?? change.path_after;
        for (const candidate of [pathBefore, pathAfter]) {
            if (typeof candidate !== 'string' || candidate.trim().length === 0) {
                continue;
            }
            try {
                paths.add(normalizeRelativePath(candidate));
            }
            catch {
                // Ignore malformed paths from server.
            }
        }
    }
    return paths;
}
async function applyRemoteChangesToLocal(connection, apiBaseUrl, changes, remoteFiles) {
    const changedPaths = collectChangedPaths(changes);
    if (changedPaths.size === 0) {
        return;
    }
    const remoteByPath = new Map();
    for (const file of remoteFiles) {
        const relativePath = resolveRemotePath(file);
        if (!relativePath) {
            continue;
        }
        remoteByPath.set(relativePath, file);
    }
    await runWithConnectionRefreshSuppressed(connection.id, async () => {
        for (const relativePath of changedPaths) {
            const remoteFile = remoteByPath.get(relativePath);
            const localPath = getLocalAbsolutePath(connection, relativePath);
            if (!remoteFile || isRemoteDeleted(remoteFile)) {
                await fs.rm(localPath, { recursive: true, force: true });
                continue;
            }
            if (isRemoteDirectory(remoteFile)) {
                await fs.mkdir(localPath, { recursive: true });
                continue;
            }
            await fs.mkdir(path.dirname(localPath), { recursive: true });
            const content = await downloadRemoteFile(connection, apiBaseUrl, relativePath);
            await fs.writeFile(localPath, content);
        }
    }, { schedulePendingRefresh: false });
}
function updateCursorFromChanges(connection, changes) {
    const lastChangeId = changes.reduce((maxId, change) => {
        if (typeof change.id !== 'number') {
            return maxId;
        }
        return Math.max(maxId, change.id);
    }, connection.lastSyncedChangeId);
    if (lastChangeId > connection.lastSyncedChangeId) {
        updateSyncConnection(connection.id, { lastSyncedChangeId: lastChangeId });
    }
}
export async function syncConnectionToBackend(connection) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl || connection.remoteConnectionId === null) {
        return;
    }
    try {
        await pushLocalSnapshot(connection, apiBaseUrl);
        const changes = await getRemoteChanges(connection, apiBaseUrl);
        if (changes.length === 0) {
            return;
        }
        const foreignChanges = changes.filter((change) => {
            const actorUserId = change.actorUserId ?? change.actor_user_id;
            return typeof actorUserId !== 'number' || actorUserId !== connection.ownerUserId;
        });
        if (foreignChanges.length > 0) {
            const remoteFiles = await getRemoteFiles(connection, apiBaseUrl);
            await applyRemoteChangesToLocal(connection, apiBaseUrl, foreignChanges, remoteFiles);
            const metadataInputs = remoteFiles
                .map((file) => mapRemoteMetadataToLocalInput(file))
                .filter((file) => file !== null);
            replaceFileMetadataForConnection(connection.id, metadataInputs);
        }
        updateCursorFromChanges(connection, changes);
    }
    catch (error) {
        console.error(`Failed to sync connection ${connection.id}:`, error);
    }
}
export async function syncAllConnections(connections) {
    const items = connections ?? listAllSyncConnections();
    for (const connection of items) {
        await syncConnectionToBackend(connection);
    }
}
//# sourceMappingURL=backendSync.js.map