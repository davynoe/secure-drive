import { listAllSyncConnections, listFileMetadata, updateSyncConnection } from './syncStore';
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
export async function syncConnectionToBackend(connection) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl || connection.remoteConnectionId === null) {
        return;
    }
    const files = listFileMetadata(connection.id);
    for (const file of files) {
        await postJson(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/file`, {
            actorUserId: connection.ownerUserId,
            relativePath: file.relativePath,
            filename: file.filename,
            isDirectory: file.isDirectory ? 1 : 0,
            size: file.size,
            contentHash: file.contentHash,
            deleted: file.deleted ? 1 : 0,
        });
    }
    const changesResponse = await fetch(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/changes?cursor=${connection.lastSyncedChangeId}&limit=1000`);
    if (!changesResponse.ok) {
        return;
    }
    const data = (await changesResponse.json());
    if (!Array.isArray(data.changes) || data.changes.length === 0) {
        return;
    }
    const lastChangeId = data.changes.reduce((maxId, change) => {
        if (typeof change.id !== 'number') {
            return maxId;
        }
        return Math.max(maxId, change.id);
    }, connection.lastSyncedChangeId);
    if (lastChangeId > connection.lastSyncedChangeId) {
        updateSyncConnection(connection.id, { lastSyncedChangeId: lastChangeId });
    }
}
export async function syncAllConnections(connections) {
    const items = connections ?? listAllSyncConnections();
    for (const connection of items) {
        await syncConnectionToBackend(connection);
    }
}
//# sourceMappingURL=backendSync.js.map