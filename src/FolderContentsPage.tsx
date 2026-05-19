import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';
const USER_KEY = 'secure-drive-user';

type StoredUser = {
  id: number;
  name: string;
  handle: string;
  email: string;
};

type FolderEntry = {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size: number | null;
};

type FolderTreeNode = FolderEntry & {
  isExpanded: boolean;
  isLoading: boolean;
  loadError: string | null;
  lastUpdated: string;
  children: FolderTreeNode[] | null;
};

type LocationState = {
  folderPath?: string;
};

function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredUser>;
    if (
      typeof parsed.id !== 'number' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.handle !== 'string' ||
      typeof parsed.email !== 'string'
    ) {
      return null;
    }

    return parsed as StoredUser;
  } catch {
    return null;
  }
}

function formatSize(value: number | null): string {
  if (value === null) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function createMockLastUpdated(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }

  const now = Date.now();
  const maxRangeMs = 1000 * 60 * 60 * 24 * 14;
  const offsetMs = hash % maxRangeMs;
  const date = new Date(now - offsetMs);

  return date.toLocaleString();
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-amber-300">
      <path
        fill="currentColor"
        d="M3 6.75A2.75 2.75 0 0 1 5.75 4h4.04c.87 0 1.68.41 2.2 1.1l.56.75c.23.31.59.49.98.49h4.77A2.75 2.75 0 0 1 21 9.09v8.16A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Z"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-slate-300">
      <path
        fill="currentColor"
        d="M7 3.75A2.75 2.75 0 0 1 9.75 1h4.79c.73 0 1.42.29 1.93.8l2.73 2.73c.51.51.8 1.2.8 1.93v13.79A2.75 2.75 0 0 1 17.25 23h-7.5A2.75 2.75 0 0 1 7 20.25V3.75Zm8.5.56V7h2.69L15.5 4.31Z"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-rose-400">
      <path
        fill="currentColor"
        d="M12 2.25c.45 0 .87.24 1.1.63l8.4 14.1c.23.39.23.87 0 1.26-.23.39-.65.63-1.1.63H3.6c-.45 0-.87-.24-1.1-.63-.23-.39-.23-.87 0-1.26l8.4-14.1c.23-.39.65-.63 1.1-.63Zm0 5.25a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 0 1.5 0v-5.5A.75.75 0 0 0 12 7.5Zm0 9.25a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
      />
    </svg>
  );
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function getRelativePath(fullPath: string, basePath: string): string {
  const normalizedFull = normalizePath(fullPath);
  const normalizedBase = normalizePath(basePath).replace(/\/+$/, '');
  if (!normalizedBase) {
    return normalizedFull;
  }
  if (normalizedFull === normalizedBase) {
    return '';
  }
  const prefix = `${normalizedBase}/`;
  return normalizedFull.startsWith(prefix) ? normalizedFull.slice(prefix.length) : normalizedFull;
}

function toTreeNodes(items: FolderEntry[]): FolderTreeNode[] {
  return items.map((item) => ({
    ...item,
    isExpanded: false,
    isLoading: false,
    loadError: null,
    lastUpdated: createMockLastUpdated(item.path),
    children: null,
  }));
}

function updateNodeByPath(
  nodes: FolderTreeNode[],
  targetPath: string,
  updater: (node: FolderTreeNode) => FolderTreeNode
): FolderTreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return updater(node);
    }

    if (!node.children) {
      return node;
    }

    return {
      ...node,
      children: updateNodeByPath(node.children, targetPath, updater),
    };
  });
}

function findNodeByPath(nodes: FolderTreeNode[], targetPath: string): FolderTreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node;
    }

    if (node.children) {
      const result = findNodeByPath(node.children, targetPath);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

export default function FolderContentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;

  const [folderPath, setFolderPath] = useState('');
  const [entries, setEntries] = useState<FolderTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [virusPaths, setVirusPaths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const selectedFromRoute = locationState?.folderPath ?? '';

    if (selectedFromRoute) {
      setFolderPath(selectedFromRoute);
      try {
        localStorage.setItem(SELECTED_FOLDER_KEY, selectedFromRoute);
      } catch {
        // Ignore localStorage write failures.
      }
      return;
    }

    try {
      const fromStorage = localStorage.getItem(SELECTED_FOLDER_KEY) ?? '';
      setFolderPath(fromStorage);
    } catch {
      setFolderPath('');
    }
  }, [locationState]);

  useEffect(() => {
    let isMounted = true;

    const loadFolder = async () => {
      if (!folderPath) {
        setEntries([]);
        setLoading(false);
        setError('No folder selected yet.');
        return;
      }

      setLoading(true);
      setError('');

      try {
        const list = await window.secureDrive.listFolder(folderPath);
        if (!isMounted) return;
        setEntries(toTreeNodes(list));
      } catch {
        if (!isMounted) return;
        setEntries([]);
        setError('Could not read this folder. Please pick another one.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadFolder();

    return () => {
      isMounted = false;
    };
  }, [folderPath]);

  useEffect(() => {
    let isMounted = true;

    const loadVirusFlags = async () => {
      if (!folderPath) {
        setVirusPaths(new Set());
        return;
      }

      const user = readStoredUser();
      if (!user) {
        setVirusPaths(new Set());
        return;
      }

      try {
        const connections = await window.secureDrive.listSyncConnections(user.id);
        const connection = connections.find((item) => item.folderPath === folderPath);
        if (!connection) {
          setVirusPaths(new Set());
          return;
        }

        const files = await window.secureDrive.listFileMetadata(connection.id);
        if (!isMounted) return;

        const flagged = new Set(
          files
            .filter((file) => file.isVirus && !file.deleted)
            .map((file) => file.relativePath),
        );
        setVirusPaths(flagged);
      } catch {
        if (isMounted) {
          setVirusPaths(new Set());
        }
      }
    };

    void loadVirusFlags();

    return () => {
      isMounted = false;
    };
  }, [folderPath]);

  const handleToggleFolder = async (nodePath: string) => {
    const targetNode = findNodeByPath(entries, nodePath);
    if (!targetNode || targetNode.kind !== 'directory') {
      return;
    }

    if (targetNode.isExpanded) {
      setEntries((prev) =>
        updateNodeByPath(prev, nodePath, (node) => ({
          ...node,
          isExpanded: false,
        }))
      );
      return;
    }

    setEntries((prev) =>
      updateNodeByPath(prev, nodePath, (node) => ({
        ...node,
        isExpanded: true,
      }))
    );

    if (targetNode.children !== null) {
      return;
    }

    setEntries((prev) =>
      updateNodeByPath(prev, nodePath, (node) => ({
        ...node,
        isLoading: true,
        loadError: null,
      }))
    );

    try {
      const children = await window.secureDrive.listFolder(nodePath);
      setEntries((prev) =>
        updateNodeByPath(prev, nodePath, (node) => ({
          ...node,
          isLoading: false,
          loadError: null,
          children: toTreeNodes(children),
        }))
      );
    } catch {
      setEntries((prev) =>
        updateNodeByPath(prev, nodePath, (node) => ({
          ...node,
          isLoading: false,
          loadError: 'Could not read this folder.',
          children: [],
        }))
      );
    }
  };

  const renderTreeNodes = (nodes: FolderTreeNode[], depth = 0): ReactElement[] => {
    return nodes.flatMap((node) => {
      const relativePath = node.kind === 'file' ? getRelativePath(node.path, folderPath) : '';
      const isVirus = node.kind === 'file' && virusPaths.has(relativePath);
      const row = (
        <div
          key={node.path}
          className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-200 hover:bg-white/5"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {node.kind === 'directory' ? (
              <button
                type="button"
                onClick={() => void handleToggleFolder(node.path)}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-left text-slate-100 transition hover:bg-white/10"
              >
                <span className="w-4 text-center text-emerald-300">{node.isExpanded ? 'v' : '>'}</span>
                <FolderIcon />
                <span className="truncate">{node.name}</span>
              </button>
            ) : (
              <>
                <span className="w-4 text-center text-slate-500">-</span>
                <FileIcon />
                {isVirus ? (
                  <span className="flex items-center text-rose-300" title="Virus detected" aria-label="Virus detected">
                    <WarningIcon />
                  </span>
                ) : null}
                <span className="truncate">{node.name}</span>
              </>
            )}
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-6 text-xs text-slate-400">
            <span>{node.kind === 'file' ? formatSize(node.size) : '-'}</span>
            <span>Updated: {node.lastUpdated}</span>
          </div>
        </div>
      );

      if (node.kind !== 'directory' || !node.isExpanded) {
        return [row];
      }

      if (node.isLoading) {
        return [
          row,
          <p key={`${node.path}:loading`} className="px-2 py-1 text-xs text-slate-400" style={{ paddingLeft: `${depth * 16 + 36}px` }}>
            Loading...
          </p>,
        ];
      }

      if (node.loadError) {
        return [
          row,
          <p key={`${node.path}:error`} className="px-2 py-1 text-xs text-rose-300" style={{ paddingLeft: `${depth * 16 + 36}px` }}>
            {node.loadError}
          </p>,
        ];
      }

      if (!node.children || node.children.length === 0) {
        return [
          row,
          <p key={`${node.path}:empty`} className="px-2 py-1 text-xs text-slate-400" style={{ paddingLeft: `${depth * 16 + 36}px` }}>
            Empty folder
          </p>,
        ];
      }

      return [row, ...renderTreeNodes(node.children, depth + 1)];
    });
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 md:px-10 md:py-14">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90">Secure Drive</p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Folder contents</h1>
            <p className="mt-2 max-w-3xl break-all text-sm text-slate-300">{folderPath || 'No folder selected'}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            Back to homepage
          </button>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur">
          {loading ? (
            <p className="text-sm text-slate-300">Loading folder contents...</p>
          ) : error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-300">This folder is empty.</p>
          ) : <div className="space-y-1">{renderTreeNodes(entries)}</div>}
        </section>
      </div>
    </main>
  );
}
