import { useEffect, useState } from 'react';
import { MemoryRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import CollaboratorPromptPage from './CollaboratorPromptPage';
import FolderContentsPage from './FolderContentsPage';
import Homepage from './Homepage';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';

const AUTH_FLAG_KEY = 'secure-drive-authenticated';

function readAuthFlag(): boolean {
  try {
    return localStorage.getItem(AUTH_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeAuthFlag(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(AUTH_FLAG_KEY, 'true');
    } else {
      localStorage.removeItem(AUTH_FLAG_KEY);
    }
  } catch {
    // Ignore localStorage write failures.
  }
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(readAuthFlag);

  useEffect(() => {
    setIsLoggedIn(readAuthFlag());

    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_FLAG_KEY) {
        setIsLoggedIn(readAuthFlag());
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogin = () => {
    writeAuthFlag(true);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    writeAuthFlag(false);
    setIsLoggedIn(false);
  };

  return (
    <Router>
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