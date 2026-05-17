import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { MemoryRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import CollaboratorPromptPage from './CollaboratorPromptPage';
import FolderContentsPage from './FolderContentsPage';
import Homepage from './Homepage';
import LoginPage from './LoginPage';
import SignUpPage from './SignUpPage';
const USER_KEY = 'secure-drive-user';
function readStoredUser() {
    try {
        const raw = localStorage.getItem(USER_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed.id !== 'number' ||
            typeof parsed.name !== 'string' ||
            typeof parsed.handle !== 'string' ||
            typeof parsed.email !== 'string') {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function writeStoredUser(user) {
    try {
        if (user) {
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        }
        else {
            localStorage.removeItem(USER_KEY);
        }
    }
    catch {
        // Ignore localStorage write failures.
    }
}
export default function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(() => readStoredUser() !== null);
    useEffect(() => {
        setIsLoggedIn(readStoredUser() !== null);
        const onStorage = (event) => {
            if (event.key === USER_KEY) {
                setIsLoggedIn(readStoredUser() !== null);
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    const handleLogin = (user) => {
        writeStoredUser(user);
        setIsLoggedIn(true);
    };
    const handleLogout = () => {
        writeStoredUser(null);
        setIsLoggedIn(false);
    };
    return (_jsx(Router, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: isLoggedIn ? _jsx(Homepage, { onLogout: handleLogout }, void 0) : _jsx(Navigate, { to: "/signup", replace: true }, void 0) }, void 0), _jsx(Route, { path: "/signup", element: !isLoggedIn ? _jsx(SignUpPage, { onSignUp: handleLogin }, void 0) : _jsx(Navigate, { to: "/", replace: true }, void 0) }, void 0), _jsx(Route, { path: "/login", element: !isLoggedIn ? _jsx(LoginPage, { onLogin: handleLogin }, void 0) : _jsx(Navigate, { to: "/", replace: true }, void 0) }, void 0), _jsx(Route, { path: "/connect-folder", element: isLoggedIn ? _jsx(CollaboratorPromptPage, {}, void 0) : _jsx(Navigate, { to: "/signup", replace: true }, void 0) }, void 0), _jsx(Route, { path: "/files", element: isLoggedIn ? _jsx(FolderContentsPage, {}, void 0) : _jsx(Navigate, { to: "/signup", replace: true }, void 0) }, void 0), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: isLoggedIn ? '/' : '/signup', replace: true }, void 0) }, void 0)] }, void 0) }, void 0));
}
//# sourceMappingURL=App.js.map