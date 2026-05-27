import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import {
	listAllSyncConnections,
	listFileMetadata,
	replaceFileMetadataForConnection,
	updateSyncConnection,
	type FileMetadataInput,
	type SyncConnection,
} from './syncStore';
import { runWithConnectionRefreshSuppressed } from './syncWatcher';

declare const __API_BASE_URL__: string;

type SyncChangesResponse = {
	status?: string;
	changes?: RemoteChange[];
};

type RemoteChange = {
	id?: number;
	actorUserId?: number;
	actor_user_id?: number;
	changeType?: string;
	change_type?: string;
	pathBefore?: string | null;
	path_before?: string | null;
	pathAfter?: string | null;
	path_after?: string | null;
};

type RemoteFileMetadata = {
	id?: number;
	filename?: string;
	relativePath?: string;
	relative_path?: string;
	size?: number | null;
	contentHash?: string | null;
	content_hash?: string | null;
	isDirectory?: boolean | number;
	is_directory?: boolean | number;
	deleted?: boolean | number;
	lastModified?: number;
	last_modified?: number;
};

type RemoteFilesResponse = {
	status?: string;
	files?: RemoteFileMetadata[];
};

type UploadInitResponse = {
	status?: string;
	uploadId?: string;
};

const MAX_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

function getApiBaseUrl(): string | null {
	const value = typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__.trim() : '';
	return value.length > 0 ? value : null;
}

async function postJson(url: string, body: unknown): Promise<void> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
}

async function postJsonAndRead<T>(url: string, body: unknown): Promise<T> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	return (await response.json()) as T;
}

function normalizeRelativePath(relativePath: string): string {
	const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
	const segments = normalized.split('/').filter(Boolean);

	if (segments.length === 0 || segments.some((segment) => segment === '..')) {
		throw new Error('Invalid relative path.');
	}

	return segments.join('/');
}

function getLocalAbsolutePath(connection: SyncConnection, relativePath: string): string {
	const normalized = normalizeRelativePath(relativePath);
	return path.join(connection.folderPath, ...normalized.split('/'));
}

function resolveRemotePath(file: RemoteFileMetadata): string | null {
	const candidate = file.relativePath ?? file.relative_path;
	if (typeof candidate !== 'string' || candidate.trim().length === 0) {
		return null;
	}

	try {
		return normalizeRelativePath(candidate);
	} catch {
		return null;
	}
}

function isRemoteDirectory(file: RemoteFileMetadata): boolean {
	const value = file.isDirectory ?? file.is_directory;
	return value === true || value === 1;
}

function isRemoteDeleted(file: RemoteFileMetadata): boolean {
	const value = file.deleted;
	return value === true || value === 1;
}

function getRemoteLastModified(file: RemoteFileMetadata): number {
	const value = file.lastModified ?? file.last_modified;
	return typeof value === 'number' ? value : Date.now();
}

function isExecutablePath(relativePath: string): boolean {
	return relativePath.toLowerCase().endsWith('.exe');
}

function mapRemoteMetadataToLocalInput(file: RemoteFileMetadata): FileMetadataInput | null {
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
		lastModified: getRemoteLastModified(file),
		contentHash: (file.contentHash ?? file.content_hash) ?? null,
		isDirectory,
		isVirus: !isDirectory && !isRemoteDeleted(file) && isExecutablePath(relativePath) ? 0 : null,
		skipScan: !isDirectory && !isRemoteDeleted(file) && isExecutablePath(relativePath),
		deleted: isRemoteDeleted(file),
	};
}

async function uploadFileInChunks(connection: SyncConnection, apiBaseUrl: string, relativePath: string): Promise<void> {
	const localFilePath = getLocalAbsolutePath(connection, relativePath);
	const stats = await fs.stat(localFilePath);
	const uploadInit = await postJsonAndRead<UploadInitResponse>(
		`${apiBaseUrl}/sync/${connection.remoteConnectionId}/upload-init`,
		{ actorUserId: connection.ownerUserId },
	);

	if (uploadInit.status && uploadInit.status !== 'success') {
		throw new Error('Failed to initialize chunked upload.');
	}

	if (typeof uploadInit.uploadId !== 'string' || uploadInit.uploadId.length === 0) {
		throw new Error('Upload id was not returned by the server.');
	}

	const handle = await fs.open(localFilePath, 'r');
	const hash = createHash('sha256');
	let totalChunks = 0;
	let bytesReadTotal = 0;

	try {
		let position = 0;
		while (position < stats.size) {
			const buffer = Buffer.allocUnsafe(Math.min(MAX_UPLOAD_CHUNK_SIZE, stats.size - position));
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);

			if (bytesRead <= 0) {
				break;
			}

			const chunk = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
			hash.update(chunk);
			bytesReadTotal += bytesRead;

			const chunkResponse = await postJsonAndRead<{ status?: string }>(
				`${apiBaseUrl}/sync/${connection.remoteConnectionId}/upload-chunk`,
				{
					actorUserId: connection.ownerUserId,
					uploadId: uploadInit.uploadId,
					chunkIndex: totalChunks,
					contentBase64: chunk.toString('base64'),
				},
			);

			if (chunkResponse.status && chunkResponse.status !== 'success') {
				throw new Error(`Chunk ${totalChunks} upload failed.`);
			}

			position += bytesRead;
			totalChunks += 1;
		}
	} finally {
		await handle.close();
	}

	const completeResponse = await postJsonAndRead<{ status?: string }>(
		`${apiBaseUrl}/sync/${connection.remoteConnectionId}/upload-complete`,
		{
			actorUserId: connection.ownerUserId,
			uploadId: uploadInit.uploadId,
			totalChunks,
			relativePath,
			filename: path.basename(relativePath),
			contentHash: hash.digest('hex'),
		},
	);

	if (completeResponse.status && completeResponse.status !== 'success') {
		throw new Error('Failed to complete chunked upload.');
	}

	if (bytesReadTotal !== stats.size) {
		throw new Error('Uploaded byte count did not match file size.');
	}
}

async function pushLocalSnapshot(connection: SyncConnection, apiBaseUrl: string): Promise<void> {
	const files = listFileMetadata(connection.id);

	for (const file of files) {
		if (file.isVirus === 1) {
			continue;
		}

		if (file.skipScan && !file.deleted) {
			continue;
		}

		if (file.deleted) {
			await postJson(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/file`, {
				actorUserId: connection.ownerUserId,
				relativePath: file.relativePath,
				filename: file.filename,
				isDirectory: file.isDirectory ? 1 : 0,
				size: file.size,
				contentHash: file.contentHash,
				deleted: 1,
			});
			continue;
		}

		if (file.isDirectory) {
			await postJson(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/directory`, {
				actorUserId: connection.ownerUserId,
				relativePath: file.relativePath,
			});
			continue;
		}

		try {
			await uploadFileInChunks(connection, apiBaseUrl, file.relativePath);
		} catch {
			await postJson(`${apiBaseUrl}/sync/${connection.remoteConnectionId}/file`, {
				actorUserId: connection.ownerUserId,
				relativePath: file.relativePath,
				filename: file.filename,
				isDirectory: 0,
				deleted: 1,
			});
		}
	}
}

async function getRemoteChanges(connection: SyncConnection, apiBaseUrl: string): Promise<RemoteChange[]> {
	const changesResponse = await fetch(
		`${apiBaseUrl}/sync/${connection.remoteConnectionId}/changes?cursor=${connection.lastSyncedChangeId}&limit=1000`,
	);

	if (!changesResponse.ok) {
		throw new Error(`Failed to fetch remote changes (${changesResponse.status}).`);
	}

	const data = (await changesResponse.json()) as SyncChangesResponse;
	if (!Array.isArray(data.changes)) {
		return [];
	}

	return data.changes;
}

async function getRemoteFiles(connection: SyncConnection, apiBaseUrl: string): Promise<RemoteFileMetadata[]> {
	const filesResponse = await fetch(
		`${apiBaseUrl}/sync/${connection.remoteConnectionId}/files?userId=${encodeURIComponent(String(connection.ownerUserId))}`,
	);

	if (!filesResponse.ok) {
		throw new Error(`Failed to fetch remote files (${filesResponse.status}).`);
	}

	const data = (await filesResponse.json()) as RemoteFilesResponse;
	if (!Array.isArray(data.files)) {
		return [];
	}

	return data.files;
}

async function downloadRemoteFile(connection: SyncConnection, apiBaseUrl: string, relativePath: string, destinationPath: string, lastModified: number): Promise<void> {
	const fileResponse = await fetch(
		`${apiBaseUrl}/sync/${connection.remoteConnectionId}/file?userId=${encodeURIComponent(String(connection.ownerUserId))}&path=${encodeURIComponent(relativePath)}`,
	);

	if (!fileResponse.ok) {
		throw new Error(`Failed to download file (${fileResponse.status}) for ${relativePath}`);
	}

	if (!fileResponse.body) {
		throw new Error(`File response for ${relativePath} is not streamable.`);
	}

	await fs.mkdir(path.dirname(destinationPath), { recursive: true });
	const writer = createWriteStream(destinationPath, { flags: 'w' });
	const reader = fileResponse.body.getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			if (!writer.write(Buffer.from(value))) {
				await once(writer, 'drain');
			}
		}
	} finally {
		writer.end();
		await once(writer, 'finish');
	}

	if (Number.isFinite(lastModified)) {
		const timestamp = new Date(lastModified);
		await fs.utimes(destinationPath, timestamp, timestamp);
	}
}

function collectChangedPaths(changes: RemoteChange[]): Set<string> {
	const paths = new Set<string>();

	for (const change of changes) {
		const pathBefore = change.pathBefore ?? change.path_before;
		const pathAfter = change.pathAfter ?? change.path_after;

		for (const candidate of [pathBefore, pathAfter]) {
			if (typeof candidate !== 'string' || candidate.trim().length === 0) {
				continue;
			}

			try {
				paths.add(normalizeRelativePath(candidate));
			} catch {
				// Ignore malformed paths from server.
			}
		}
	}

	return paths;
}

async function applyRemoteChangesToLocal(
	connection: SyncConnection,
	apiBaseUrl: string,
	changes: RemoteChange[],
	remoteFiles: RemoteFileMetadata[],
): Promise<void> {
	const changedPaths = collectChangedPaths(changes);
	if (changedPaths.size === 0) {
		return;
	}

	const remoteByPath = new Map<string, RemoteFileMetadata>();
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

			await downloadRemoteFile(connection, apiBaseUrl, relativePath, localPath, getRemoteLastModified(remoteFile));
		}
	}, { schedulePendingRefresh: false });
}

export async function pullRemoteChanges(connection: SyncConnection, apiBaseUrl?: string): Promise<void> {
	const resolvedApiBaseUrl = apiBaseUrl ?? getApiBaseUrl();
	if (!resolvedApiBaseUrl || connection.remoteConnectionId === null) {
		return;
	}

	try {
		const changes = await getRemoteChanges(connection, resolvedApiBaseUrl);

		if (changes.length === 0) {
			return;
		}

		const foreignChanges = changes.filter((change) => {
			const actorUserId = change.actorUserId ?? change.actor_user_id;
			return typeof actorUserId !== 'number' || actorUserId !== connection.ownerUserId;
		});

		if (foreignChanges.length > 0) {
			const remoteFiles = await getRemoteFiles(connection, resolvedApiBaseUrl);
			await applyRemoteChangesToLocal(connection, resolvedApiBaseUrl, foreignChanges, remoteFiles);

			const metadataInputs = remoteFiles
				.map((file) => mapRemoteMetadataToLocalInput(file))
				.filter((file): file is FileMetadataInput => file !== null);

			const remotePaths = new Set(metadataInputs.map((file) => file.relativePath));
			const preservedVirusEntries = listFileMetadata(connection.id)
				.filter((file) => file.isVirus === 1 && !remotePaths.has(file.relativePath))
				.map((file) => ({
					filename: file.filename,
					relativePath: file.relativePath,
					size: file.size,
					lastModified: file.lastModified,
					contentHash: file.contentHash ?? null,
					isDirectory: file.isDirectory,
					isVirus: file.isVirus,
					skipScan: file.skipScan,
					deleted: file.deleted,
				}));

			replaceFileMetadataForConnection(connection.id, [...metadataInputs, ...preservedVirusEntries]);
		}

		updateCursorFromChanges(connection, changes);
	} catch (error) {
		console.error(`Failed to pull remote changes for connection ${connection.id}:`, error);
	}
}

function updateCursorFromChanges(connection: SyncConnection, changes: RemoteChange[]): void {
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

export async function syncConnectionToBackend(connection: SyncConnection): Promise<void> {
	const apiBaseUrl = getApiBaseUrl();
	if (!apiBaseUrl || connection.remoteConnectionId === null) {
		return;
	}

	try {
		await pushLocalSnapshot(connection, apiBaseUrl);
		await pullRemoteChanges(connection, apiBaseUrl);
	} catch (error) {
		console.error(`Failed to sync connection ${connection.id}:`, error);
	}
}

export async function syncAllConnections(connections?: SyncConnection[]): Promise<void> {
	const items = connections ?? listAllSyncConnections();

	for (const connection of items) {
		await syncConnectionToBackend(connection);
	}
}