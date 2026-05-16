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

type HomepageProps = {
  onLogout: () => void;
};

export default function Homepage({ onLogout }: HomepageProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState<StoredUser | null>(() => readStoredUser());
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState('');
  const [activeRequestId, setActiveRequestId] = useState<number | null>(null);
  const [sendingToUserId, setSendingToUserId] = useState<number | null>(null);
  const collaboratorsPanelRef = useRef<HTMLDivElement | null>(null);
  const collaboratorSearchRef = useRef<HTMLInputElement | null>(null);

  const loadConnections = () => {
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

      setConnections(parsed);
    } catch {
      setConnections([]);
    }
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

    loadConnections();

    if (currentUser) {
      void loadSocialData(currentUser.id);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === CONNECTIONS_KEY) {
        loadConnections();
      }

      if (event.key === USER_KEY) {
        const refreshedUser = readStoredUser();
        setUser(refreshedUser);
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
        <header className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90">
              Secure Drive
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-4xl">Homepage</h1>
            <p className="mt-2 text-sm text-slate-300">Welcome, {user?.name || user?.handle || 'Guest'}</p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-300/20"
          >
            Sync now
          </button>
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

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Storage used</p>
            <p className="mt-3 text-3xl font-bold text-white">128 GB</p>
            <p className="mt-2 text-sm text-slate-300">of 512 GB plan</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Synced files</p>
            <p className="mt-3 text-3xl font-bold text-white">2,418</p>
            <p className="mt-2 text-sm text-slate-300">updated in last 24h</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Shared vaults</p>
            <p className="mt-3 text-3xl font-bold text-white">12</p>
            <p className="mt-2 text-sm text-slate-300">{pendingRequests.length} pending requests</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Security score</p>
            <p className="mt-3 text-3xl font-bold text-emerald-300">98%</p>
            <p className="mt-2 text-sm text-slate-300">2FA enabled</p>
          </article>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Connections</h2>
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
                    <button
                      type="button"
                      onClick={() => navigate('/files', { state: { folderPath: connection.folderPath } })}
                      className="rounded-lg border border-emerald-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-300/20"
                    >
                      Open
                    </button>
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
