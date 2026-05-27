declare module '*.css';

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
	skipScan: boolean;
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
	skipScan?: boolean;
	deleted?: boolean;
};

interface Window {
	secureDrive: {
		apiBaseUrl: string;
		pickFolder: () => Promise<string | null>;
		listFolder: (folderPath: string) => Promise<FolderEntry[]>;
		listSyncConnections: (ownerUserId: number) => Promise<SyncConnection[]>;
		upsertSyncConnection: (input: SyncConnectionInput) => Promise<SyncConnection | null>;
		listFileMetadata: (connectionId: number) => Promise<FileMetadata[]>;
		upsertFileMetadata: (connectionId: number, input: FileMetadataInput) => Promise<FileMetadata | null>;
		replaceFileMetadata: (connectionId: number, files: FileMetadataInput[]) => Promise<FileMetadata[]>;
		deleteFile: (filePath: string) => Promise<boolean>;
		deleteSyncConnection: (connectionId: number) => Promise<boolean>;
		listScanningPaths: () => Promise<string[]>;
		syncNow: () => Promise<boolean>;
	};
}
