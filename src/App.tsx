import { useEffect, useState } from 'react';
import { MemoryRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import CollaboratorPromptPage from './CollaboratorPromptPage';
import FolderContentsPage from './FolderContentsPage';
import Homepage from './Homepage';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

const USER_KEY = 'secure-drive-user';

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

function writeStoredUser(user: StoredUser | null): void {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    // Ignore localStorage write failures.
  }
}

function RefreshButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={handleRefresh}
      className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-300/40 bg-slate-950/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-emerald-300/20"
      title="Refresh app"
      aria-label="Refresh app"
      disabled={isRefreshing}
    >
      {isRefreshing ? 'Refreshing...' : 'Refresh'}
    </button>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => readStoredUser() !== null);

  useEffect(() => {
    setIsLoggedIn(readStoredUser() !== null);

    const onStorage = (event: StorageEvent) => {
      if (event.key === USER_KEY) {
        setIsLoggedIn(readStoredUser() !== null);
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogin = (user: StoredUser) => {
    writeStoredUser(user);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    writeStoredUser(null);
    setIsLoggedIn(false);
  };

  return (
    <Router>
      <RefreshButton />
      <Routes>
        <Route
          path="/"
          element={isLoggedIn ? <Homepage onLogout={handleLogout} /> : <Navigate to="/signup" replace />}
        />
        <Route
          path="/signup"
          element={!isLoggedIn ? <SignUpPage onSignUp={handleLogin} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/login"
          element={!isLoggedIn ? <LoginPage onLogin={handleLogin} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/connect-folder"
          element={isLoggedIn ? <CollaboratorPromptPage /> : <Navigate to="/signup" replace />}
        />
        <Route path="/files" element={isLoggedIn ? <FolderContentsPage /> : <Navigate to="/signup" replace />} />
        <Route path="*" element={<Navigate to={isLoggedIn ? '/' : '/signup'} replace />} />
      </Routes>
    </Router>
  );
}