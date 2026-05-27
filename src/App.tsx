import { useEffect, useRef, useState } from 'react';
import { MemoryRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
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

type ConnectionDeletedPayload = {
  connectionId?: number;
};

type ServerEvent = {
  event?: string;
  data?: unknown;
};

function getWebSocketUrl(apiUrl: string): string {
  if (!apiUrl) return '';
  if (apiUrl.startsWith('https://')) return apiUrl.replace(/^https:\/\//, 'wss://');
  if (apiUrl.startsWith('http://')) return apiUrl.replace(/^http:\/\//, 'ws://');
  return apiUrl;
}

function ConnectionDeletionListener({ enabled }: { enabled: boolean }) {
  const location = useLocation();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || location.pathname === '/') {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    const user = readStoredUser();
    const apiUrl = window.secureDrive.apiBaseUrl;
    const wsUrl = getWebSocketUrl(apiUrl);

    if (!user || !wsUrl) {
      return;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;

    const cleanupSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };

    const handleRemoteConnectionDeleted = async (connectionId: number) => {
      try {
        const syncConnections = await window.secureDrive.listSyncConnections(user.id);
        const matching = syncConnections.find((connection) => connection.remoteConnectionId === connectionId);
        if (matching) {
          await window.secureDrive.deleteSyncConnection(matching.id);
        }
      } catch (error) {
        console.error('Failed to remove local connection:', error);
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
      if (disposed) return;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({ type: 'auth', userId: user.id }));
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as ServerEvent;
          if (payload?.event !== 'connection:deleted') {
            return;
          }

          const data = (payload.data ?? {}) as ConnectionDeletedPayload;
          if (typeof data.connectionId === 'number') {
            void handleRemoteConnectionDeleted(data.connectionId);
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
  }, [enabled, location.pathname]);

  return null;
}

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
      <ConnectionDeletionListener enabled={isLoggedIn} />
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