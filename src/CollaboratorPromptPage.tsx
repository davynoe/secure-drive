import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';
const USER_KEY = 'secure-drive-user';
// @ts-ignore - Vite will inject this at build time
const API_URL = import.meta.env.VITE_API_URL as string;

type AppUser = {
  id: number;
  name: string;
  handle: string;
  email: string;
};

type LocationState = {
  folderPath?: string;
};

type InitialBaseChoice = 'user' | 'receiver';

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

function getFolderName(folderPath: string): string {
  if (!folderPath) return 'Unnamed folder';
  const normalized = folderPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}

export default function CollaboratorPromptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingToUserId, setSendingToUserId] = useState<number | null>(null);
  const [initialBaseChoice, setInitialBaseChoice] = useState<InitialBaseChoice>('user');
  const [error, setError] = useState('');

  const folderPath = locationState?.folderPath ?? '';
  const folderName = useMemo(() => getFolderName(folderPath), [folderPath]);

  useEffect(() => {
    const currentUser = readStoredUser();
    if (!currentUser) {
      navigate('/login', { replace: true });
      return;
    }

    const loadFriends = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${API_URL}/friends/${currentUser.id}`);
        if (!response.ok) {
          throw new Error('Failed to load friends.');
        }

        const data = (await response.json()) as AppUser[];
        setFriends(Array.isArray(data) ? data : []);
      } catch (loadError) {
        setFriends([]);
        setError('Could not load friends right now.');
        console.error('Failed to load friends:', loadError);
      } finally {
        setLoading(false);
      }
    };

    void loadFriends();
  }, [navigate]);

  const handleChooseCollaborator = async (collaborator: AppUser) => {
    if (!folderPath) {
      navigate('/');
      return;
    }

    try {
      localStorage.setItem(SELECTED_FOLDER_KEY, folderPath);
    } catch {
      // Ignore localStorage write failures.
    }

    const currentUser = readStoredUser();
    if (!currentUser) {
      return;
    }

    setSendingToUserId(collaborator.id);
    setError('');

    try {
      const response = await fetch(`${API_URL}/connection-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: currentUser.id,
          receiverId: collaborator.id,
          title: folderName,
          description: folderPath,
          initialBaseId: initialBaseChoice === 'user' ? currentUser.id : collaborator.id,
        }),
      });

      const data = await response.json();
      if (data.status !== 'success') {
        setError(data.message || 'Unable to create connection request.');
        return;
      }

      try {
        await window.secureDrive.upsertSyncConnection({
          ownerUserId: currentUser.id,
          remoteConnectionId: null,
          folderPath,
          folderName,
          collaborator: collaborator.name ?? collaborator.handle ?? 'Unknown collaborator',
        });
      } catch (persistError) {
        console.error('Failed to persist local sync connection:', persistError);
      }

      navigate('/', { replace: true });
    } catch (requestError) {
      setError('Unable to send connection request right now.');
      console.error('Failed to create connection request:', requestError);
    } finally {
      setSendingToUserId(null);
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10 md:px-10 md:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90">Secure Drive</p>
          <h1 className="mt-2 text-3xl font-bold">Pick a collaborator to sync folder with</h1>
          <p className="mt-2 text-sm text-slate-300">
            Folder: <span className="font-semibold text-slate-100">{folderName}</span>
          </p>
        </header>

        {!folderPath ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-rose-300">No folder selected. Go back and choose a folder first.</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-4 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
            >
              Back to homepage
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <fieldset className="rounded-xl border border-white/10 bg-black/20 p-4">
              <legend className="px-1 text-sm font-medium text-slate-200">Initial base</legend>
              <p className="mt-1 text-xs text-slate-400">Choose who starts with the base folder for this connection request.</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                    initialBaseChoice === 'user'
                      ? 'border-emerald-300/50 bg-emerald-400/10 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20'
                  }`}
                >
                  <span className="font-medium">Me</span>
                  <input
                    type="radio"
                    name="initial-base"
                    value="user"
                    checked={initialBaseChoice === 'user'}
                    onChange={() => setInitialBaseChoice('user')}
                    className="h-4 w-4 accent-emerald-400"
                  />
                </label>

                <label
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                    initialBaseChoice === 'receiver'
                      ? 'border-emerald-300/50 bg-emerald-400/10 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20'
                  }`}
                >
                  <span className="font-medium">Receiver</span>
                  <input
                    type="radio"
                    name="initial-base"
                    value="receiver"
                    checked={initialBaseChoice === 'receiver'}
                    onChange={() => setInitialBaseChoice('receiver')}
                    className="h-4 w-4 accent-emerald-400"
                  />
                </label>
              </div>
            </fieldset>

            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Your friends</h2>
              {loading && <span className="text-xs uppercase tracking-[0.14em] text-slate-300">Loading...</span>}
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <ul className="mt-4 space-y-3">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() => void handleChooseCollaborator(friend)}
                    disabled={sendingToUserId === friend.id || loading}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-slate-200 transition hover:border-emerald-300/40 hover:bg-black/35"
                  >
                    <div>
                      <span>{friend.name}</span>
                      <p className="text-xs text-slate-400">@{friend.handle}</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.14em] text-emerald-300">
                      {sendingToUserId === friend.id ? 'Sending...' : 'Request'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-5 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              Cancel
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
