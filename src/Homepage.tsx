import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const HANDLE_KEY = 'secure-drive-handle';
const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';
const CONNECTIONS_KEY = 'secure-drive-connections';

type SavedConnection = {
  folderPath: string;
  folderName: string;
  collaborator: string;
};

type Collaborator = {
  id: string;
  name: string;
  handle: string;
  status: 'online' | 'away' | 'offline';
};

type PendingInvite = {
  id: string;
  name: string;
};

const STATIC_COLLABORATORS: Collaborator[] = [
  { id: 'u1', name: 'Alice Johnson', handle: 'alice.j', status: 'online' },
  { id: 'u2', name: 'Marco Rivera', handle: 'mrivera', status: 'away' },
  { id: 'u3', name: 'Priya Shah', handle: 'priya.s', status: 'online' },
  { id: 'u4', name: 'Noah Kim', handle: 'noahk', status: 'offline' },
  { id: 'u5', name: 'Sofia Martinez', handle: 'sofiam', status: 'online' },
  { id: 'u6', name: 'Liam Carter', handle: 'liamc', status: 'away' },
  { id: 'u7', name: 'Mina Park', handle: 'minap', status: 'online' },
];

type HomepageProps = {
  onLogout: () => void;
};

export default function Homepage({ onLogout }: HomepageProps) {
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [friends, setFriends] = useState<Collaborator[]>([STATIC_COLLABORATORS[0], STATIC_COLLABORATORS[2]]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
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

  const handleSendInvite = (candidate: Collaborator) => {
    const isAlreadyFriend = friends.some((friend) => friend.id === candidate.id);
    const isAlreadyPending = pendingInvites.some((invite) => invite.id === candidate.id);
    if (isAlreadyFriend || isAlreadyPending) return;

    setPendingInvites((prev) => [...prev, { id: candidate.id, name: candidate.name }]);

    window.setTimeout(() => {
      setPendingInvites((prev) => prev.filter((invite) => invite.id !== candidate.id));
      setFriends((prev) => {
        if (prev.some((friend) => friend.id === candidate.id)) {
          return prev;
        }
        return [...prev, candidate];
      });
    }, 5000);
  };

  const filteredCandidates = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return STATIC_COLLABORATORS.filter((candidate) => {
      const blocked =
        friends.some((friend) => friend.id === candidate.id) ||
        pendingInvites.some((invite) => invite.id === candidate.id);
      if (blocked) return false;
      if (!normalized) return true;
      return (
        candidate.name.toLowerCase().includes(normalized) ||
        candidate.handle.toLowerCase().includes(normalized)
      );
    });
  }, [friends, pendingInvites, searchTerm]);

  useEffect(() => {
    try {
      setHandle(localStorage.getItem(HANDLE_KEY) ?? '');
    } catch {
      setHandle('');
    }

    loadConnections();

    const onStorage = (event: StorageEvent) => {
      if (event.key === CONNECTIONS_KEY) {
        loadConnections();
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
            <p className="mt-2 text-sm text-slate-300">Welcome, {handle || 'Guest'}</p>
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
            <p className="mt-2 text-sm text-slate-300">{pendingInvites.length} pending invites</p>
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
              Friends: {friends.length} | Pending: {pendingInvites.length}
            </span>
          </div>

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
              className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Discover users</h3>
              {filteredCandidates.length === 0 ? (
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
                        onClick={() => handleSendInvite(candidate)}
                        className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300"
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Pending invites</h3>
                {pendingInvites.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No pending invites.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {pendingInvites.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex items-center justify-between rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-3"
                      >
                        <span className="text-sm text-amber-100">{invite.name}</span>
                        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-amber-300">
                          Pending
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Friends</h3>
                {friends.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-400">No collaborators connected yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {friends.map((friend) => (
                      <li
                        key={friend.id}
                        className="flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-3"
                      >
                        <span className="text-sm text-slate-100">{friend.name}</span>
                        <span className="text-xs uppercase tracking-[0.1em] text-emerald-300">{friend.status}</span>
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
