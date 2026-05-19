import { contextBridge, ipcRenderer } from 'electron';

declare const __API_BASE_URL__: string;

type FolderEntry = {
	name: string;
	path: string;
	kind: 'file' | 'directory';
	size: number | null;
};

type SyncConnection = {
	id: number;
	ownerUserId: number;
	remoteConnectionId: number | null;
	folderPath: string;
	folderName: string;
	collaborator: string | null;
	lastSyncedChangeId: number;
	createdAt: string;
	updatedAt: string;
};

type SyncConnectionInput = {
	ownerUserId: number;
	remoteConnectionId?: number | null;
	folderPath: string;
	folderName: string;
	collaborator: string | null;
	lastSyncedChangeId?: number;
};

type FileMetadata = {
	id: number;
	connectionId: number;
	filename: string;
	relativePath: string;
	size: number | null;
	lastModified: number;
	contentHash: string | null;
	isDirectory: boolean;
	isVirus: boolean;
	deleted: boolean;
	createdAt: string;
	updatedAt: string;
};

type FileMetadataInput = {
	filename: string;
	relativePath: string;
	size: number | null;
	lastModified: number;
	contentHash?: string | null;
	isDirectory?: boolean;
	isVirus?: boolean;
	deleted?: boolean;
};

contextBridge.exposeInMainWorld('secureDrive', {
	apiBaseUrl: __API_BASE_URL__,
	pickFolder: (): Promise<string | null> => ipcRenderer.invoke('secure-drive:pick-folder'),
	listFolder: (folderPath: string): Promise<FolderEntry[]> =>
		ipcRenderer.invoke('secure-drive:list-folder', folderPath),
	listSyncConnections: (ownerUserId: number): Promise<SyncConnection[]> =>
		ipcRenderer.invoke('secure-drive:list-sync-connections', ownerUserId),
	upsertSyncConnection: (input: SyncConnectionInput): Promise<SyncConnection | null> =>
		ipcRenderer.invoke('secure-drive:upsert-sync-connection', input),
	listFileMetadata: (connectionId: number): Promise<FileMetadata[]> =>
		ipcRenderer.invoke('secure-drive:list-file-metadata', connectionId),
	upsertFileMetadata: (connectionId: number, input: FileMetadataInput): Promise<FileMetadata | null> =>
		ipcRenderer.invoke('secure-drive:upsert-file-metadata', connectionId, input),
	replaceFileMetadata: (connectionId: number, files: FileMetadataInput[]): Promise<FileMetadata[]> =>
		ipcRenderer.invoke('secure-drive:replace-file-metadata', connectionId, files),
	deleteFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke('secure-drive:delete-file', filePath),
	deleteSyncConnection: (connectionId: number): Promise<boolean> =>
		ipcRenderer.invoke('secure-drive:delete-sync-connection', connectionId),
	listScanningPaths: (): Promise<string[]> => ipcRenderer.invoke('secure-drive:list-scanning-paths'),
	syncNow: (): Promise<boolean> => ipcRenderer.invoke('secure-drive:sync-now'),
});
