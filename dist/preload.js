import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('secureDrive', {
    apiBaseUrl: __API_BASE_URL__,
    pickFolder: () => ipcRenderer.invoke('secure-drive:pick-folder'),
    listFolder: (folderPath) => ipcRenderer.invoke('secure-drive:list-folder', folderPath),
    listSyncConnections: (ownerUserId) => ipcRenderer.invoke('secure-drive:list-sync-connections', ownerUserId),
    upsertSyncConnection: (input) => ipcRenderer.invoke('secure-drive:upsert-sync-connection', input),
    listFileMetadata: (connectionId) => ipcRenderer.invoke('secure-drive:list-file-metadata', connectionId),
    upsertFileMetadata: (connectionId, input) => ipcRenderer.invoke('secure-drive:upsert-file-metadata', connectionId, input),
    replaceFileMetadata: (connectionId, files) => ipcRenderer.invoke('secure-drive:replace-file-metadata', connectionId, files),
    syncNow: () => ipcRenderer.invoke('secure-drive:sync-now'),
});
//# sourceMappingURL=preload.js.map