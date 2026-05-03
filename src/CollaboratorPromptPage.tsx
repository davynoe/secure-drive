import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const CONNECTIONS_KEY = 'secure-drive-connections';
const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';

const MOCK_COLLABORATORS = [
  'Alice Johnson',
  'Marco Rivera',
  'Priya Shah',
  'Noah Kim',
  'Sofia Martinez',
];

type SavedConnection = {
  folderPath: string;
  folderName: string;
  collaborator: string;
};

type LocationState = {
  folderPath?: string;
};

function getFolderName(folderPath: string): string {
  if (!folderPath) return 'Unnamed folder';
  const normalized = folderPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? folderPath;
}

function readConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as SavedConnection[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export default function CollaboratorPromptPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;

  const folderPath = locationState?.folderPath ?? '';
  const folderName = useMemo(() => getFolderName(folderPath), [folderPath]);

  const handleChooseCollaborator = (collaborator: string) => {
    if (!folderPath) {
      navigate('/');
      return;
    }

    const nextEntry: SavedConnection = {
      folderPath,
      folderName,
      collaborator,
    };

    const current = readConnections();
    const withoutCurrentFolder = current.filter((item) => item.folderPath !== folderPath);
    const updated = [nextEntry, ...withoutCurrentFolder];

    try {
      localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(updated));
      localStorage.setItem(SELECTED_FOLDER_KEY, folderPath);
    } catch {
      // Ignore localStorage write failures.
    }

    navigate('/files', { state: { folderPath } });
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
            <h2 className="text-lg font-semibold text-white">Your collaborators</h2>
            <ul className="mt-4 space-y-3">
              {MOCK_COLLABORATORS.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => handleChooseCollaborator(name)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-slate-200 transition hover:border-emerald-300/40 hover:bg-black/35"
                  >
                    <span>{name}</span>
                    <span className="text-xs uppercase tracking-[0.14em] text-emerald-300">Select</span>
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
