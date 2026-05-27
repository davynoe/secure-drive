import { app } from 'electron';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type SyncConnection = {
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

export type SyncConnectionInput = {
  ownerUserId: number;
  remoteConnectionId?: number | null;
  folderPath: string;
  folderName: string;
  collaborator: string | null;
  lastSyncedChangeId?: number;
};

export type SyncConnectionUpdate = {
  remoteConnectionId?: number | null;
  lastSyncedChangeId?: number;
};

export type FileMetadata = {
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

export type FileMetadataInput = {
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

type DatabaseConnection = ReturnType<typeof createDatabaseConnection>;

let database: DatabaseConnection | null = null;

function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  const storageDirectory = path.join(userDataPath, 'sync-store');
  mkdirSync(storageDirectory, { recursive: true });
  return path.join(storageDirectory, 'metadata.sqlite3');
}

function createDatabaseConnection() {
  const databasePath = getDatabasePath();
  const db = new Database(databasePath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      remote_connection_id INTEGER,
      folder_path TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      collaborator TEXT,
      last_synced_change_id INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(owner_user_id, folder_path)
    );

    CREATE TABLE IF NOT EXISTS file_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connection_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      size INTEGER,
      last_modified INTEGER NOT NULL,
      content_hash TEXT,
      is_directory INTEGER NOT NULL DEFAULT 0,
      is_virus INTEGER NOT NULL DEFAULT 0,
      skip_scan INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(connection_id) REFERENCES sync_connections(id) ON DELETE CASCADE,
      UNIQUE(connection_id, relative_path)
    );

    CREATE INDEX IF NOT EXISTS idx_file_metadata_connection_id
      ON file_metadata(connection_id);

    CREATE INDEX IF NOT EXISTS idx_sync_connections_remote_connection_id
      ON sync_connections(remote_connection_id);
  `);

  migrateSyncConnectionsSchema(db);
  migrateFileMetadataSchema(db);

  return db;
}

function migrateFileMetadataSchema(db: any) {
  const columns = db.prepare('PRAGMA table_info(file_metadata)').all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === 'skip_scan')) {
    return;
  }

  db.exec('ALTER TABLE file_metadata ADD COLUMN skip_scan INTEGER NOT NULL DEFAULT 0;');
}

function migrateSyncConnectionsSchema(db: any) {
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sync_connections'")
    .get() as { sql?: string } | undefined;

  if (!tableInfo?.sql) {
    return;
  }

  const hasLegacyUniqueRemoteId =
    /remote_connection_id\s+INTEGER\s+UNIQUE/i.test(tableInfo.sql) ||
    /UNIQUE\s*\(\s*remote_connection_id\s*\)/i.test(tableInfo.sql);

  if (!hasLegacyUniqueRemoteId) {
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');

  try {
    db.exec(`
      CREATE TABLE sync_connections_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id INTEGER NOT NULL,
        remote_connection_id INTEGER,
        folder_path TEXT NOT NULL,
        folder_name TEXT NOT NULL,
        collaborator TEXT,
        last_synced_change_id INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_user_id, folder_path)
      );

      INSERT INTO sync_connections_new (
        id,
        owner_user_id,
        remote_connection_id,
        folder_path,
        folder_name,
        collaborator,
        last_synced_change_id,
        created_at,
        updated_at
      )
      SELECT
        id,
        owner_user_id,
        remote_connection_id,
        folder_path,
        folder_name,
        collaborator,
        last_synced_change_id,
        created_at,
        updated_at
      FROM sync_connections;

      DROP TABLE sync_connections;
      ALTER TABLE sync_connections_new RENAME TO sync_connections;

      CREATE INDEX IF NOT EXISTS idx_sync_connections_remote_connection_id
        ON sync_connections(remote_connection_id);
    `);

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function getDatabase(): DatabaseConnection {
  if (!database) {
    database = createDatabaseConnection();
  }

  return database;
}

function mapSyncConnection(row: {
  id: number;
  owner_user_id: number;
  remote_connection_id: number | null;
  folder_path: string;
  folder_name: string;
  collaborator: string | null;
  last_synced_change_id: number;
  created_at: string;
  updated_at: string;
}): SyncConnection {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    remoteConnectionId: row.remote_connection_id,
    folderPath: row.folder_path,
    folderName: row.folder_name,
    collaborator: row.collaborator,
    lastSyncedChangeId: row.last_synced_change_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFileMetadata(row: {
  id: number;
  connection_id: number;
  filename: string;
  relative_path: string;
  size: number | null;
  last_modified: number;
  content_hash: string | null;
  is_directory: number;
  is_virus: number;
  skip_scan: number;
  deleted: number;
  created_at: string;
  updated_at: string;
}): FileMetadata {
  return {
    id: row.id,
    connectionId: row.connection_id,
    filename: row.filename,
    relativePath: row.relative_path,
    size: row.size,
    lastModified: row.last_modified,
    contentHash: row.content_hash,
    isDirectory: row.is_directory === 1,
    isVirus: row.is_virus === 1,
    skipScan: row.skip_scan === 1,
    deleted: row.deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertSyncConnection(input: SyncConnectionInput): SyncConnection {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO sync_connections (
      owner_user_id,
      remote_connection_id,
      folder_path,
      folder_name,
      collaborator,
      last_synced_change_id
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_user_id, folder_path) DO UPDATE SET
      remote_connection_id = excluded.remote_connection_id,
      folder_name = excluded.folder_name,
      collaborator = excluded.collaborator,
      last_synced_change_id = excluded.last_synced_change_id,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(
    input.ownerUserId,
    input.remoteConnectionId ?? null,
    input.folderPath,
    input.folderName,
    input.collaborator,
    input.lastSyncedChangeId ?? 0,
  );
  return getSyncConnectionByFolderPath(input.ownerUserId, input.folderPath) as SyncConnection;
}

export function getSyncConnectionByFolderPath(ownerUserId: number, folderPath: string): SyncConnection | null {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT id, owner_user_id, remote_connection_id, folder_path, folder_name, collaborator, last_synced_change_id, created_at, updated_at FROM sync_connections WHERE owner_user_id = ? AND folder_path = ?'
  );
  const row = stmt.get(ownerUserId, folderPath) as
    | {
        id: number;
        owner_user_id: number;
        remote_connection_id: number | null;
        folder_path: string;
        folder_name: string;
        collaborator: string | null;
        last_synced_change_id: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  return row ? mapSyncConnection(row) : null;
}

export function listSyncConnections(ownerUserId: number): SyncConnection[] {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT id, owner_user_id, remote_connection_id, folder_path, folder_name, collaborator, last_synced_change_id, created_at, updated_at FROM sync_connections WHERE owner_user_id = ? ORDER BY updated_at DESC'
  );
  const rows = stmt.all(ownerUserId) as Array<{
    id: number;
    owner_user_id: number;
    remote_connection_id: number | null;
    folder_path: string;
    folder_name: string;
    collaborator: string | null;
    last_synced_change_id: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapSyncConnection);
}

export function listAllSyncConnections(): SyncConnection[] {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT id, owner_user_id, remote_connection_id, folder_path, folder_name, collaborator, last_synced_change_id, created_at, updated_at FROM sync_connections ORDER BY updated_at DESC'
  );
  const rows = stmt.all() as Array<{
    id: number;
    owner_user_id: number;
    remote_connection_id: number | null;
    folder_path: string;
    folder_name: string;
    collaborator: string | null;
    last_synced_change_id: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapSyncConnection);
}

export function deleteSyncConnection(connectionId: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM sync_connections WHERE id = ?');
  const result = stmt.run(connectionId);
  return result.changes > 0;
}

export function getSyncConnectionById(connectionId: number): SyncConnection | null {
  const db = getDatabase();
  const stmt = db.prepare(
    'SELECT id, owner_user_id, remote_connection_id, folder_path, folder_name, collaborator, last_synced_change_id, created_at, updated_at FROM sync_connections WHERE id = ?'
  );
  const row = stmt.get(connectionId) as
    | {
        id: number;
        owner_user_id: number;
        remote_connection_id: number | null;
        folder_path: string;
        folder_name: string;
        collaborator: string | null;
        last_synced_change_id: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  return row ? mapSyncConnection(row) : null;
}

export function updateSyncConnection(connectionId: number, updates: SyncConnectionUpdate): SyncConnection | null {
  const db = getDatabase();
  const current = getSyncConnectionById(connectionId);
  if (!current) {
    return null;
  }

  const stmt = db.prepare(`
    UPDATE sync_connections
    SET
      remote_connection_id = COALESCE(?, remote_connection_id),
      last_synced_change_id = COALESCE(?, last_synced_change_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  stmt.run(
    typeof updates.remoteConnectionId === 'undefined' ? null : updates.remoteConnectionId,
    typeof updates.lastSyncedChangeId === 'undefined' ? null : updates.lastSyncedChangeId,
    connectionId,
  );

  return getSyncConnectionById(connectionId);
}

export function upsertFileMetadata(connectionId: number, input: FileMetadataInput): FileMetadata {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO file_metadata (
      connection_id,
      filename,
      relative_path,
      size,
      last_modified,
      content_hash,
      is_directory,
      is_virus,
      skip_scan,
      deleted
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(connection_id, relative_path) DO UPDATE SET
      filename = excluded.filename,
      size = excluded.size,
      last_modified = excluded.last_modified,
      content_hash = excluded.content_hash,
      is_directory = excluded.is_directory,
      is_virus = excluded.is_virus,
      skip_scan = excluded.skip_scan,
      deleted = excluded.deleted,
      updated_at = CURRENT_TIMESTAMP
    WHERE NOT (
      filename = excluded.filename
      AND (size = excluded.size OR (size IS NULL AND excluded.size IS NULL))
      AND last_modified = excluded.last_modified
      AND (content_hash = excluded.content_hash OR (content_hash IS NULL AND excluded.content_hash IS NULL))
      AND is_directory = excluded.is_directory
      AND is_virus = excluded.is_virus
      AND skip_scan = excluded.skip_scan
      AND deleted = excluded.deleted
    )
  `);

  stmt.run(
    connectionId,
    input.filename,
    input.relativePath,
    input.size,
    input.lastModified,
    input.contentHash ?? null,
    input.isDirectory ? 1 : 0,
    input.isVirus ? 1 : 0,
    input.skipScan ? 1 : 0,
    input.deleted ? 1 : 0,
  );

  return getFileMetadata(connectionId, input.relativePath) as FileMetadata;
}

export function getFileMetadata(connectionId: number, relativePath: string): FileMetadata | null {
  const db = getDatabase();
  const stmt = db.prepare(
    `SELECT id, connection_id, filename, relative_path, size, last_modified, content_hash, is_directory, is_virus, skip_scan, deleted, created_at, updated_at
     FROM file_metadata
     WHERE connection_id = ? AND relative_path = ?`
  );
  const row = stmt.get(connectionId, relativePath) as
    | {
        id: number;
        connection_id: number;
        filename: string;
        relative_path: string;
        size: number | null;
        last_modified: number;
        content_hash: string | null;
        is_directory: number;
        is_virus: number;
        skip_scan: number;
        deleted: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  return row ? mapFileMetadata(row) : null;
}

export function listFileMetadata(connectionId: number): FileMetadata[] {
  const db = getDatabase();
  const stmt = db.prepare(
    `SELECT id, connection_id, filename, relative_path, size, last_modified, content_hash, is_directory, is_virus, skip_scan, deleted, created_at, updated_at
     FROM file_metadata
     WHERE connection_id = ?
     ORDER BY relative_path ASC`
  );
  const rows = stmt.all(connectionId) as Array<{
    id: number;
    connection_id: number;
    filename: string;
    relative_path: string;
    size: number | null;
    last_modified: number;
    content_hash: string | null;
    is_directory: number;
    is_virus: number;
    skip_scan: number;
    deleted: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapFileMetadata);
}

export function replaceFileMetadataForConnection(connectionId: number, files: FileMetadataInput[]): FileMetadata[] {
  const db = getDatabase();
  const deleteStmt = db.prepare('DELETE FROM file_metadata WHERE connection_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO file_metadata (
      connection_id,
      filename,
      relative_path,
      size,
      last_modified,
      content_hash,
      is_directory,
      is_virus,
      skip_scan,
      deleted
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((entries: FileMetadataInput[]) => {
    deleteStmt.run(connectionId);

    for (const entry of entries) {
      insertStmt.run(
        connectionId,
        entry.filename,
        entry.relativePath,
        entry.size,
        entry.lastModified,
        entry.contentHash ?? null,
        entry.isDirectory ? 1 : 0,
        entry.isVirus ? 1 : 0,
        entry.skipScan ? 1 : 0,
        entry.deleted ? 1 : 0,
      );
    }

    return listFileMetadata(connectionId);
  });

  return tx(files);
}

export function syncFileMetadataSnapshot(connectionId: number, files: FileMetadataInput[]): FileMetadata[] {
  const db = getDatabase();
  const existingRows = listFileMetadata(connectionId);
  const seenPaths = new Set<string>();

  const upsertStmt = db.prepare(`
    INSERT INTO file_metadata (
      connection_id,
      filename,
      relative_path,
      size,
      last_modified,
      content_hash,
      is_directory,
      is_virus,
      skip_scan,
      deleted
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(connection_id, relative_path) DO UPDATE SET
      filename = excluded.filename,
      size = excluded.size,
      last_modified = excluded.last_modified,
      content_hash = excluded.content_hash,
      is_directory = excluded.is_directory,
      is_virus = excluded.is_virus,
      skip_scan = excluded.skip_scan,
      deleted = excluded.deleted,
      updated_at = CURRENT_TIMESTAMP
    WHERE NOT (
      filename = excluded.filename
      AND (size = excluded.size OR (size IS NULL AND excluded.size IS NULL))
      AND last_modified = excluded.last_modified
      AND (content_hash = excluded.content_hash OR (content_hash IS NULL AND excluded.content_hash IS NULL))
      AND is_directory = excluded.is_directory
      AND is_virus = excluded.is_virus
      AND skip_scan = excluded.skip_scan
      AND deleted = excluded.deleted
    )
  `);

  const markDeletedStmt = db.prepare(
    'UPDATE file_metadata SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE connection_id = ? AND relative_path = ? AND deleted = 0'
  );
  const markPresentStmt = db.prepare(
    'UPDATE file_metadata SET deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE connection_id = ? AND relative_path = ? AND deleted = 1'
  );

  const tx = db.transaction((entries: FileMetadataInput[]) => {
    for (const entry of entries) {
      seenPaths.add(entry.relativePath);
      upsertStmt.run(
        connectionId,
        entry.filename,
        entry.relativePath,
        entry.size,
        entry.lastModified,
        entry.contentHash ?? null,
        entry.isDirectory ? 1 : 0,
        entry.isVirus ? 1 : 0,
        entry.skipScan ? 1 : 0,
        entry.deleted ? 1 : 0,
      );
      markPresentStmt.run(connectionId, entry.relativePath);
    }

    for (const row of existingRows) {
      if (!seenPaths.has(row.relativePath)) {
        markDeletedStmt.run(connectionId, row.relativePath);
      }
    }

    return listFileMetadata(connectionId);
  });

  return tx(files);
}
