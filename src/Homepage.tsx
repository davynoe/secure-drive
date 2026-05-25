import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const USER_KEY = 'secure-drive-user';
const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';
const CONNECTIONS_KEY = 'secure-drive-connections';
// @ts-ignore - Vite will inject this at build time
const API_URL = import.meta.env.VITE_API_URL as string;

type StoredUser = {
  id: number;
  name: string;
  handle: string;
  email: string;
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

type SavedConnection = {
  id: number;
  remoteConnectionId: number | null;
  folderPath: string;
  folderName: string;
  collaborator: string;
};

type AppUser = {
  id: number;
  name: string;
  handle: string;
  email: string;
};

type FriendRequest = {
  id: number;
  requester_id: number;
  receiver_id: number;
  created_at?: string;
};

type ConnectionRequest = {
  id: number;
  requester_id: number;
  receiver_id: number;
  initial_base_id?: number;
  title?: string;
  description?: string;
  connectionId?: number;
  remoteConnectionId?: number;
  syncConnectionId?: number;
  connection_id?: number;
  remote_connection_id?: number;
  sync_connection_id?: number;
  status?: string;
  created_at?: string;
};

type ConnectionAcceptanceResponse = {
  status?: string;
  message?: string;
  connectionId?: number;
  remoteConnectionId?: number;
  syncConnectionId?: number;
  connection_id?: number;
  remote_connection_id?: number;
  sync_connection_id?: number;
  connection?: {
    id?: number;
    remoteConnectionId?: number;
    syncConnectionId?: number;
    connection_id?: number;
    remote_connection_id?: number;
    sync_connection_id?: number;
  };
  connectionRequest?: {
    id?: number;
    connectionId?: number;
    remoteConnectionId?: number;
    syncConnectionId?: number;
    connection_id?: number;
    remote_connection_id?: number;
    sync_connection_id?: number;
  };
};

type ServerEvent = {
  event: string;
  data?: unknown;
};

type ConnectionDeletedPayload = {
  connectionId?: number;
};

type HomepageProps = {
  onLogout: () => void;
};

type ConfirmDialogState =
  | {
      kind: 'close-connection';
      connection: SavedConnection;
    }
  | {
      kind: 'remove-friend';
      friendId: number;
      friendName: string;
    };

export default function Homepage({ onLogout }: HomepageProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<StoredUser | null>(() => readStoredUser());
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<ConnectionRequest[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState('');
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null);
  const [sendingToUserId, setSendingToUserId] = useState<number | null>(null);
  const [activeConnectionRequestId, setActiveConnectionRequestId] = useState<number | null>(null);
  const [closingConnectionId, setClosingConnectionId] = useState<number | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const collaboratorsPanelRef = useRef<HTMLDivElement | null>(null);
  const collaboratorSearchRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const getWebSocketUrl = (apiUrl: string): string => {
    if (!apiUrl) return '';
    if (apiUrl.startsWith('https://')) return apiUrl.replace(/^https:\/\//, 'wss://');
    if (apiUrl.startsWith('http://')) return apiUrl.replace(/^http:\/\//, 'ws://');
    return apiUrl;
  };

  const handleRemoteConnectionDeleted = async (connectionId: number) => {
    if (!user) return;

    try {
      const syncConnections = await window.secureDrive.listSyncConnections(user.id);
      const matching = syncConnections.find((connection) => connection.remoteConnectionId === connectionId);
      if (matching) {
        await window.secureDrive.deleteSyncConnection(matching.id);
      }

      await loadConnections(user.id);
      await loadSocialData(user.id);
    } catch (error) {
      console.error('Failed to remove local connection:', error);
    }
  };

  const loadConnections = async (ownerUserId?: number) => {
    if (ownerUserId) {
      try {
        const rows = await window.secureDrive.listSyncConnections(ownerUserId);
        setConnections(
          rows.map((row) => ({
            id: row.id,
            remoteConnectionId: row.remoteConnectionId,
            folderPath: row.folderPath,
            folderName: row.folderName,
            collaborator: row.collaborator ?? '',
          })),
        );
        return;
      } catch {
        // Fall back to legacy localStorage data below.
      }
    }

    try {
      const raw = localStorage.getItem(CONNECTIONS_KEY);
      if (!raw) {
        setConnections([]);
        return;
      }

      const parsed = JSON.parse(raw) as SavedConnection[];
      if (!Array.isArray(parsed)) {
        setConnections([]);
        return;
      }

      setConnections(
        parsed.map((entry, index) => ({
          id: typeof entry.id === 'number' ? entry.id : -1 - index,
          remoteConnectionId: typeof entry.remoteConnectionId === 'number' ? entry.remoteConnectionId : null,
          folderPath: entry.folderPath,
          folderName: entry.folderName,
          collaborator: entry.collaborator,
        })),
      );
    } catch {
      setConnections([]);
    }
  };

  const closeConnectionConfirmed = async (connection: SavedConnection) => {
    if (!user) return;
    if (connection.remoteConnectionId === null) {
      setSocialError('This connection has no remote id to close.');
      return;
    }

    setClosingConnectionId(connection.id);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/connections/${connection.remoteConnectionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to close connection.');
        return;
      }

      await window.secureDrive.deleteSyncConnection(connection.id);
      await loadConnections(user.id);
    } catch (error) {
      setSocialError('Unable to close connection right now.');
      console.error('Failed to close connection:', error);
    } finally {
      setClosingConnectionId(null);
    }
  };

  const requestCloseConnection = (connection: SavedConnection) => {
    setConfirmDialog({ kind: 'close-connection', connection });
  };

  const getRemoteConnectionIdFromRequest = (request: ConnectionRequest): number | null => {
    const candidate =
      request.connectionId ??
      request.remoteConnectionId ??
      request.syncConnectionId ??
      request.connection_id ??
      request.remote_connection_id ??
      request.sync_connection_id ??
      null;
    return typeof candidate === 'number' ? candidate : null;
  };

  const getRequestFolderPath = (request: ConnectionRequest): string | null => {
    if (typeof request.description === 'string' && request.description.trim()) {
      return request.description;
    }

    return null;
  };

  const loadSocialData = async (currentUserId: number) => {
    setSocialLoading(true);
    setSocialError('');

    try {
      const [allUsersResponse, requestsResponse, friendsResponse] = await Promise.all([
        fetch(`${API_URL}/allusers/${currentUserId}`),
        fetch(`${API_URL}/friend-requests/${currentUserId}`),
        fetch(`${API_URL}/friends/${currentUserId}`),
      ]);

      if (!allUsersResponse.ok || !requestsResponse.ok || !friendsResponse.ok) {
        throw new Error('One or more social endpoints failed.');
      }

      const usersData = (await allUsersResponse.json()) as AppUser[];
      const requestsData = (await requestsResponse.json()) as FriendRequest[];
      const friendsData = (await friendsResponse.json()) as AppUser[];

      setAllUsers(Array.isArray(usersData) ? usersData : []);
      setFriendRequests(Array.isArray(requestsData) ? requestsData : []);
      setFriends(Array.isArray(friendsData) ? friendsData : []);
      const connectionRequestsResponse = await fetch(`${API_URL}/connection-requests/${currentUserId}`);
      if (connectionRequestsResponse.ok) {
        const connectionRequestsData = (await connectionRequestsResponse.json()) as ConnectionRequest[];
        setConnectionRequests(Array.isArray(connectionRequestsData) ? connectionRequestsData : []);

        if (Array.isArray(connectionRequestsData)) {
          await Promise.all(
            connectionRequestsData.map(async (request) => {
              if (request.requester_id !== currentUserId) {
                return;
              }

              const remoteConnectionId = getRemoteConnectionIdFromRequest(request);
              const folderPath = getRequestFolderPath(request);
              if (remoteConnectionId === null || !folderPath) {
                return;
              }

              const folderName =
                request.title?.trim() || folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folderPath;

              await window.secureDrive.upsertSyncConnection({
                ownerUserId: currentUserId,
                remoteConnectionId,
                folderPath,
                folderName,
                collaborator: userLookup.get(request.receiver_id)?.name ?? userLookup.get(request.receiver_id)?.handle ?? 'Unknown collaborator',
              });
            }),
          );
        }
      } else {
        setConnectionRequests([]);
      }
    } catch (error) {
      setSocialError('Failed to load friends data. Please try again.');
      console.error('Failed to load social data:', error);
    } finally {
      setSocialLoading(false);
    }
  };

  const sendFriendRequest = async (candidate: AppUser) => {
    if (!user) return;

    setSendingToUserId(candidate.id);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/friend-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, receiverId: candidate.id }),
      });

      const data = await response.json();

      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to send friend request.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to send friend request right now.');
      console.error('Failed to send friend request:', error);
    } finally {
      setSendingToUserId(null);
    }
  };

  const acceptFriendRequest = async (requestId: number) => {
    if (!user) return;

    setActiveRequestId(requestId);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/friend-requests/${requestId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to accept friend request.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to accept friend request right now.');
      console.error('Failed to accept friend request:', error);
    } finally {
      setActiveRequestId(null);
    }
  };

  const rejectFriendRequest = async (requestId: number) => {
    if (!user) return;

    setActiveRequestId(requestId);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/friend-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to reject friend request.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to reject friend request right now.');
      console.error('Failed to reject friend request:', error);
    } finally {
      setActiveRequestId(null);
    }
  };

  const cancelFriendRequest = async (requestId: number) => {
    if (!user) return;

    setActiveRequestId(requestId);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/friend-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to cancel friend request.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to cancel friend request right now.');
      console.error('Failed to cancel friend request:', error);
    } finally {
      setActiveRequestId(null);
    }
  };

  const cancelConnectionRequest = async (requestId: number) => {
    if (!user) return;

    setActiveConnectionRequestId(requestId);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/connection-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to cancel connection request.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to cancel connection request right now.');
      console.error('Failed to cancel connection request:', error);
    } finally {
      setActiveConnectionRequestId(null);
    }
  };

  const deleteFriendConfirmed = async (friendId: number) => {
    if (!user) return;

    setRemovingFriendId(friendId);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/friends/${friendId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to delete friend.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to delete friend right now.');
      console.error('Failed to delete friend:', error);
    } finally {
      setRemovingFriendId(null);
    }
  };

  const requestRemoveFriend = (friend: AppUser) => {
    const friendName = friend.name ?? friend.handle ?? 'this friend';
    setConfirmDialog({ kind: 'remove-friend', friendId: friend.id, friendName });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;

    const current = confirmDialog;
    setConfirmDialog(null);

    if (current.kind === 'close-connection') {
      await closeConnectionConfirmed(current.connection);
      return;
    }

    if (current.kind === 'remove-friend') {
      await deleteFriendConfirmed(current.friendId);
    }
  };

  const rejectConnectionRequest = async (requestId: number) => {
    if (!user) return;

    setActiveConnectionRequestId(requestId);
    setSocialError('');

    try {
      const response = await fetch(`${API_URL}/connection-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setSocialError(data.message || 'Unable to reject connection request.');
        return;
      }

      await loadSocialData(user.id);
    } catch (error) {
      setSocialError('Unable to reject connection request right now.');
      console.error('Failed to reject connection request:', error);
    } finally {
      setActiveConnectionRequestId(null);
    }
  };

  const acceptConnectionRequest = async (request: ConnectionRequest) => {
    if (!user) return;

    setActiveConnectionRequestId(request.id);
    setSocialError('');

    try {
      const selectedFolder = await window.secureDrive.pickFolder();
      if (!selectedFolder) {
        return;
      }

      try {
        localStorage.setItem(SELECTED_FOLDER_KEY, selectedFolder);
      } catch {
        // Ignore localStorage write failures.
      }

      const folderName = selectedFolder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? selectedFolder;
      const requester = userLookup.get(request.requester_id);

      try {
        const response = await fetch(`${API_URL}/connection-requests/${request.id}/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });

        const data = (await response.json()) as ConnectionAcceptanceResponse;
        if (data.status !== 'success') {
          setSocialError(data.message || 'Unable to accept connection request.');
          return;
        }

        const remoteConnectionId = data.connectionId ?? null;

        if (typeof remoteConnectionId !== 'number') {
          setSocialError('Connection was accepted, but the server did not return a sync connection id.');
          return;
        }

        await window.secureDrive.upsertSyncConnection({
          ownerUserId: user.id,
          remoteConnectionId,
          folderPath: selectedFolder,
          folderName,
          collaborator: requester?.name ?? requester?.handle ?? 'Unknown collaborator',
        });
      } catch (syncError) {
        console.error('Failed to persist sync connection locally:', syncError);
      }

      await loadSocialData(user.id);
      navigate('/files', { state: { folderPath: selectedFolder } });
    } catch (error) {
      setSocialError('Unable to accept connection request right now.');
      console.error('Failed to accept connection request:', error);
    } finally {
      setActiveConnectionRequestId(null);
    }
  };

  const userLookup = useMemo(() => {
    const byId = new Map<number, AppUser>();

    for (const candidate of allUsers) {
      byId.set(candidate.id, candidate);
    }

    for (const friend of friends) {
      byId.set(friend.id, friend);
    }

    if (user) {
      byId.set(user.id, user);
    }

    return byId;
  }, [allUsers, friends, user]);

  const pendingRequests = useMemo(() => {
    if (!user) {
      return [] as FriendRequest[];
    }

    return friendRequests.filter((request) => request.requester_id === user.id || request.receiver_id === user.id);
  }, [friendRequests, user]);

  const pendingConnectionRequests = useMemo(() => {
    if (!user) {
      return [] as ConnectionRequest[];
    }

    return connectionRequests.filter(
      (request) => request.requester_id === user.id || request.receiver_id === user.id,
    );
  }, [connectionRequests, user]);

  const blockedUserIds = useMemo(() => {
    if (!user) {
      return new Set<number>();
    }

    const blocked = new Set<number>();
    blocked.add(user.id);

    for (const friend of friends) {
      blocked.add(friend.id);
    }

    for (const request of pendingRequests) {
      blocked.add(request.requester_id);
      blocked.add(request.receiver_id);
    }

    return blocked;
  }, [friends, pendingRequests, user]);

  const filteredCandidates = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return allUsers.filter((candidate) => {
      if (blockedUserIds.has(candidate.id)) return false;
      if (!normalized) return true;
      return (
        candidate.name.toLowerCase().includes(normalized) ||
        candidate.handle.toLowerCase().includes(normalized) ||
        candidate.email.toLowerCase().includes(normalized)
      );
    });
  }, [allUsers, blockedUserIds, searchTerm]);

  useEffect(() => {
    const currentUser = readStoredUser();
    setUser(currentUser);

    void loadConnections(currentUser?.id);

    if (currentUser) {
      void loadSocialData(currentUser.id);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === USER_KEY) {
        const refreshedUser = readStoredUser();
        setUser(refreshedUser);
        void loadConnections(refreshedUser?.id);
        if (refreshedUser) {
          void loadSocialData(refreshedUser.id);
        } else {
          setAllUsers([]);
          setFriendRequests([]);
          setFriends([]);
        }
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;
    const wsUrl = getWebSocketUrl(API_URL);

    const cleanupSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(connectSocket, 1500);
    };

    const connectSocket = () => {
      if (disposed || !wsUrl) return;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'auth', userId: user.id }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as ServerEvent;
          if (!payload?.event) return;

          switch (payload.event) {
            case 'friendRequest:new':
            case 'friendRequest:accepted':
            case 'friendRequest:rejected':
            case 'friendRequest:canceled':
            case 'connectionRequest:new':
            case 'connectionRequest:accepted':
            case 'connectionRequest:rejected':
            case 'connectionRequest:canceled':
              void loadSocialData(user.id);
              break;
            case 'connection:deleted': {
              const data = (payload.data ?? {}) as ConnectionDeletedPayload;
              if (typeof data.connectionId === 'number') {
                void handleRemoteConnectionDeleted(data.connectionId);
              }
              break;
            }
            default:
              break;
          }
        } catch {
          // Ignore malformed messages.
        }
      });

      socket.addEventListener('close', () => {
        if (!disposed) {
          scheduleReconnect();
        }
      });

      socket.addEventListener('error', () => {
        if (!disposed) {
          scheduleReconnect();
        }
      });
    };

    connectSocket();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      cleanupSocket();
    };
  }, [user]);

  const handlePickFolder = async () => {
    try {
      const selectedFolder = await window.secureDrive.pickFolder();
      if (!selectedFolder) return;

      try {
        localStorage.setItem(SELECTED_FOLDER_KEY, selectedFolder);
      } catch {
        // Ignore localStorage write failures.
      }

      navigate('/connect-folder', { state: { folderPath: selectedFolder } });
    } catch {
      // Keep the current screen if folder selection fails.
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 md:px-10 md:py-14">
        <header className="mb-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
              Secure Drive
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Homepage</h1>
            <p className="mt-2 text-sm text-slate-300">Welcome, {user?.name || user?.handle || 'Guest'}</p>
          </div>
        </header>

        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/10"
          >
            Log out
          </button>
        </div>

        <section className="mt-2 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Active sync folders</h2>
            {connections.length === 0 ? (
              <p className="mt-4 text-sm text-slate-300">No secure folder connections yet.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm text-slate-200">
                {connections.map((connection) => (
                  <li
                    key={connection.folderPath}
                    className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
                  >
                    <span>{connection.folderName} - syncing with {connection.collaborator}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => navigate('/files', { state: { folderPath: connection.folderPath } })}
                        className="rounded-lg border border-emerald-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-300/20"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => requestCloseConnection(connection)}
                        disabled={closingConnectionId === connection.id}
                        className="rounded-lg border border-rose-300/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                      >
                        {closingConnectionId === connection.id ? 'Closing...' : 'Close'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Quick actions</h2>
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                onClick={handlePickFolder}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
              >
                New secure folder
              </button>
              <button
                type="button"
                onClick={() => {
                  collaboratorsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  collaboratorSearchRef.current?.focus();
                }}
                className="rounded-xl border border-slate-500/40 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Add collaborator
              </button>
              <button
                type="button"
                onClick={() => collaboratorsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-xl border border-slate-500/40 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              >
                Collaborators
              </button>
            </div>
          </aside>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Connection requests</h2>
            <span className="text-xs uppercase tracking-[0.14em] text-slate-300">
              Total: {pendingConnectionRequests.length}
            </span>
          </div>

          {socialError && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {socialError}
            </div>
          )}

          {socialLoading ? (
            <p className="mt-4 text-sm text-slate-400">Loading connection requests...</p>
          ) : pendingConnectionRequests.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No connection requests yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {pendingConnectionRequests.map((request) => {
                const isIncoming = request.receiver_id === user?.id;
                const otherUserId = isIncoming ? request.requester_id : request.receiver_id;
                const otherUser = userLookup.get(otherUserId);

                return (
                  <li key={request.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">
                          {isIncoming ? 'From' : 'To'} {otherUser?.name ?? `User #${otherUserId}`}
                        </p>
                        <p className="text-xs text-slate-400">@{otherUser?.handle ?? 'unknown'}</p>
                        <p className="mt-2 text-sm text-slate-300">{request.title ?? 'Connection request'}</p>
                        <p className="mt-1 text-xs text-slate-400">{request.description ?? 'No description provided.'}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {isIncoming ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void acceptConnectionRequest(request)}
                              disabled={activeConnectionRequestId === request.id}
                              className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
                            >
                              {activeConnectionRequestId === request.id ? 'Picking folder...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void rejectConnectionRequest(request.id)}
                              disabled={activeConnectionRequestId === request.id}
                              className="rounded-lg border border-rose-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void cancelConnectionRequest(request.id)}
                            disabled={activeConnectionRequestId === request.id}
                            className="rounded-lg border border-amber-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-60"
                          >
                            {activeConnectionRequestId === request.id ? 'Working...' : 'Cancel'}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          id="collaborators-panel"
          ref={collaboratorsPanelRef}
          className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Collaborators</h2>
            <span className="text-xs uppercase tracking-[0.14em] text-slate-300">
              Friends: {friends.length} | Pending: {pendingRequests.length}
            </span>
          </div>

          {socialError && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {socialError}
            </div>
          )}

          <div className="mt-4">
            <label htmlFor="collaborator-search" className="mb-2 block text-sm font-medium text-slate-200">
              Search and add collaborator
            </label>
            <input
              id="collaborator-search"
              ref={collaboratorSearchRef}
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name or handle"
              disabled={socialLoading}
              className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Discover users</h3>
              {socialLoading ? (
                <p className="mt-3 text-sm text-slate-400">Loading users...</p>
              ) : filteredCandidates.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No users match your search.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {filteredCandidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-100">{candidate.name}</p>
                        <p className="text-xs text-slate-400">@{candidate.handle}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void sendFriendRequest(candidate)}
                        disabled={sendingToUserId === candidate.id || socialLoading}
                        className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300"
                      >
                        {sendingToUserId === candidate.id ? 'Sending...' : 'Add'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Pending requests</h3>
                {socialLoading ? (
                  <p className="mt-3 text-sm text-slate-400">Loading requests...</p>
                ) : pendingRequests.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No pending requests.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {pendingRequests.map((request) => {
                      const isIncoming = request.receiver_id === user?.id;
                      const otherUserId = isIncoming ? request.requester_id : request.receiver_id;
                      const otherUser = userLookup.get(otherUserId);
                      const displayName = otherUser?.name ?? `User #${otherUserId}`;
                      const displayHandle = otherUser?.handle ?? 'unknown';

                      return (
                        <li
                          key={request.id}
                          className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm text-amber-100">{displayName}</p>
                              <p className="text-xs text-amber-200/80">@{displayHandle}</p>
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-300">
                              {isIncoming ? 'Incoming' : 'Outgoing'}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            {isIncoming ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void acceptFriendRequest(request.id)}
                                  disabled={activeRequestId === request.id}
                                  className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60"
                                >
                                  {activeRequestId === request.id ? 'Working...' : 'Accept'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void rejectFriendRequest(request.id)}
                                  disabled={activeRequestId === request.id}
                                  className="rounded-lg border border-rose-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void cancelFriendRequest(request.id)}
                                disabled={activeRequestId === request.id}
                                className="rounded-lg border border-amber-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-60"
                              >
                                {activeRequestId === request.id ? 'Working...' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Friends</h3>
                {socialLoading ? (
                  <p className="mt-3 text-sm text-slate-400">Loading friends...</p>
                ) : friends.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No collaborators connected yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {friends.map((friend) => (
                      <li
                        key={friend.id}
                        className="flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-3"
                      >
                        <div>
                          <p className="text-sm text-slate-100">{friend.name}</p>
                          <p className="text-xs text-emerald-200/80">@{friend.handle}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => requestRemoveFriend(friend)}
                          disabled={removingFriendId === friend.id}
                          className="rounded-lg border border-rose-300/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                        >
                          {removingFriendId === friend.id ? 'Removing...' : 'Remove'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
        {confirmDialog ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-6 shadow-2xl shadow-black/40">
              <h3 className="text-lg font-semibold text-white">
                {confirmDialog.kind === 'close-connection' ? 'Close connection?' : 'Remove friend?'}
              </h3>
              <p className="mt-2 text-sm text-slate-300">
                {confirmDialog.kind === 'close-connection'
                  ? 'This will remove the connection and delete its synced data on this device.'
                  : `Remove ${confirmDialog.friendName} from your collaborators?`}
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmAction()}
                  className="rounded-lg border border-rose-300/60 bg-rose-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:bg-rose-500/30"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </main>
  );
}
