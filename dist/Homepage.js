import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
const USER_KEY = 'secure-drive-user';
const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';
const CONNECTIONS_KEY = 'secure-drive-connections';
// @ts-ignore - Vite will inject this at build time
const API_URL = import.meta.env.VITE_API_URL;
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
export default function Homepage({ onLogout }) {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => readStoredUser());
    const [connections, setConnections] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [allUsers, setAllUsers] = useState([]);
    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [connectionRequests, setConnectionRequests] = useState([]);
    const [socialLoading, setSocialLoading] = useState(false);
    const [socialError, setSocialError] = useState('');
    const [activeRequestId, setActiveRequestId] = useState(null);
    const [sendingToUserId, setSendingToUserId] = useState(null);
    const [activeConnectionRequestId, setActiveConnectionRequestId] = useState(null);
    const collaboratorsPanelRef = useRef(null);
    const collaboratorSearchRef = useRef(null);
    const loadConnections = useCallback(async (ownerUserId) => {
        if (ownerUserId) {
            try {
                const rows = await window.secureDrive.listSyncConnections(ownerUserId);
                setConnections(rows.map((row) => ({
                    folderPath: row.folderPath,
                    folderName: row.folderName,
                    collaborator: row.collaborator ?? '',
                })));
                return;
            }
            catch {
                // Fall back to legacy localStorage data below.
            }
        }
        try {
            const raw = localStorage.getItem(CONNECTIONS_KEY);
            if (!raw) {
                setConnections([]);
                return;
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                setConnections([]);
                return;
            }
            setConnections(parsed);
        }
        catch {
            setConnections([]);
        }
    }, []);
    const getRemoteConnectionIdFromRequest = (request) => {
        const candidate = request.connectionId ??
            request.remoteConnectionId ??
            request.syncConnectionId ??
            request.connection_id ??
            request.remote_connection_id ??
            request.sync_connection_id ??
            null;
        return typeof candidate === 'number' ? candidate : null;
    };
    const getRequestFolderPath = (request) => {
        if (typeof request.description === 'string' && request.description.trim()) {
            return request.description;
        }
        return null;
    };
    const loadSocialData = useCallback(async (currentUserId) => {
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
            const usersData = (await allUsersResponse.json());
            const requestsData = (await requestsResponse.json());
            const friendsData = (await friendsResponse.json());
            const socialLookup = new Map();
            for (const candidate of usersData) {
                socialLookup.set(candidate.id, candidate);
            }
            for (const friend of friendsData) {
                socialLookup.set(friend.id, friend);
            }
            if (user && user.id === currentUserId) {
                socialLookup.set(user.id, user);
            }
            setAllUsers(Array.isArray(usersData) ? usersData : []);
            setFriendRequests(Array.isArray(requestsData) ? requestsData : []);
            setFriends(Array.isArray(friendsData) ? friendsData : []);
            const connectionRequestsResponse = await fetch(`${API_URL}/connection-requests/${currentUserId}`);
            if (connectionRequestsResponse.ok) {
                const connectionRequestsData = (await connectionRequestsResponse.json());
                setConnectionRequests(Array.isArray(connectionRequestsData) ? connectionRequestsData : []);
                if (Array.isArray(connectionRequestsData)) {
                    await Promise.all(connectionRequestsData.map(async (request) => {
                        if (request.requester_id !== currentUserId) {
                            return;
                        }
                        const remoteConnectionId = getRemoteConnectionIdFromRequest(request);
                        const folderPath = getRequestFolderPath(request);
                        if (remoteConnectionId === null || !folderPath) {
                            return;
                        }
                        const folderName = request.title?.trim() || folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folderPath;
                        await window.secureDrive.upsertSyncConnection({
                            ownerUserId: currentUserId,
                            remoteConnectionId,
                            folderPath,
                            folderName,
                            collaborator: socialLookup.get(request.receiver_id)?.name ??
                                socialLookup.get(request.receiver_id)?.handle ??
                                'Unknown collaborator',
                        });
                    }));
                }
            }
            else {
                setConnectionRequests([]);
            }
        }
        catch (error) {
            setSocialError('Failed to load friends data. Please try again.');
            console.error('Failed to load social data:', error);
        }
        finally {
            setSocialLoading(false);
        }
    }, [user]);
    const sendFriendRequest = async (candidate) => {
        if (!user)
            return;
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
        }
        catch (error) {
            setSocialError('Unable to send friend request right now.');
            console.error('Failed to send friend request:', error);
        }
        finally {
            setSendingToUserId(null);
        }
    };
    const acceptFriendRequest = async (requestId) => {
        if (!user)
            return;
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
        }
        catch (error) {
            setSocialError('Unable to accept friend request right now.');
            console.error('Failed to accept friend request:', error);
        }
        finally {
            setActiveRequestId(null);
        }
    };
    const rejectFriendRequest = async (requestId) => {
        if (!user)
            return;
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
        }
        catch (error) {
            setSocialError('Unable to reject friend request right now.');
            console.error('Failed to reject friend request:', error);
        }
        finally {
            setActiveRequestId(null);
        }
    };
    const cancelFriendRequest = async (requestId) => {
        if (!user)
            return;
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
        }
        catch (error) {
            setSocialError('Unable to cancel friend request right now.');
            console.error('Failed to cancel friend request:', error);
        }
        finally {
            setActiveRequestId(null);
        }
    };
    const cancelConnectionRequest = async (requestId) => {
        if (!user)
            return;
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
        }
        catch (error) {
            setSocialError('Unable to cancel connection request right now.');
            console.error('Failed to cancel connection request:', error);
        }
        finally {
            setActiveConnectionRequestId(null);
        }
    };
    const rejectConnectionRequest = async (requestId) => {
        if (!user)
            return;
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
        }
        catch (error) {
            setSocialError('Unable to reject connection request right now.');
            console.error('Failed to reject connection request:', error);
        }
        finally {
            setActiveConnectionRequestId(null);
        }
    };
    const acceptConnectionRequest = async (request) => {
        if (!user)
            return;
        setActiveConnectionRequestId(request.id);
        setSocialError('');
        try {
            const selectedFolder = await window.secureDrive.pickFolder();
            if (!selectedFolder) {
                return;
            }
            try {
                localStorage.setItem(SELECTED_FOLDER_KEY, selectedFolder);
            }
            catch {
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
                const data = (await response.json());
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
            }
            catch (syncError) {
                console.error('Failed to persist sync connection locally:', syncError);
            }
            await loadSocialData(user.id);
            navigate('/files', { state: { folderPath: selectedFolder } });
        }
        catch (error) {
            setSocialError('Unable to accept connection request right now.');
            console.error('Failed to accept connection request:', error);
        }
        finally {
            setActiveConnectionRequestId(null);
        }
    };
    const userLookup = useMemo(() => {
        const byId = new Map();
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
            return [];
        }
        return friendRequests.filter((request) => request.requester_id === user.id || request.receiver_id === user.id);
    }, [friendRequests, user]);
    const pendingConnectionRequests = useMemo(() => {
        if (!user) {
            return [];
        }
        return connectionRequests.filter((request) => request.requester_id === user.id || request.receiver_id === user.id);
    }, [connectionRequests, user]);
    const blockedUserIds = useMemo(() => {
        if (!user) {
            return new Set();
        }
        const blocked = new Set();
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
            if (blockedUserIds.has(candidate.id))
                return false;
            if (!normalized)
                return true;
            return (candidate.name.toLowerCase().includes(normalized) ||
                candidate.handle.toLowerCase().includes(normalized) ||
                candidate.email.toLowerCase().includes(normalized));
        });
    }, [allUsers, blockedUserIds, searchTerm]);
    useEffect(() => {
        const currentUser = readStoredUser();
        setUser(currentUser);
        const onStorage = (event) => {
            if (event.key === USER_KEY) {
                const refreshedUser = readStoredUser();
                setUser(refreshedUser);
                void loadConnections(refreshedUser?.id);
                if (refreshedUser) {
                    void loadSocialData(refreshedUser.id);
                }
                else {
                    setAllUsers([]);
                    setFriendRequests([]);
                    setFriends([]);
                }
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [loadConnections, loadSocialData]);
    useEffect(() => {
        if (!user) {
            return;
        }
        let disposed = false;
        const refreshData = () => {
            if (disposed) {
                return;
            }
            void loadConnections(user.id);
            void loadSocialData(user.id);
        };
        refreshData();
        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                refreshData();
            }
        }, 4000);
        const onFocus = () => refreshData();
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshData();
            }
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            disposed = true;
            window.clearInterval(intervalId);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [user, loadConnections, loadSocialData]);
    const handlePickFolder = async () => {
        try {
            const selectedFolder = await window.secureDrive.pickFolder();
            if (!selectedFolder)
                return;
            try {
                localStorage.setItem(SELECTED_FOLDER_KEY, selectedFolder);
            }
            catch {
                // Ignore localStorage write failures.
            }
            navigate('/connect-folder', { state: { folderPath: selectedFolder } });
        }
        catch {
            // Keep the current screen if folder selection fails.
        }
    };
    return (_jsx("main", { className: "min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100", children: _jsxs("div", { className: "mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 md:px-10 md:py-14", children: [_jsxs("header", { className: "mb-10 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90", children: "Secure Drive" }, void 0), _jsx("h1", { className: "mt-2 text-3xl font-bold md:text-4xl", children: "Homepage" }, void 0), _jsxs("p", { className: "mt-2 text-sm text-slate-300", children: ["Welcome, ", user?.name || user?.handle || 'Guest'] }, void 0)] }, void 0), _jsx("button", { type: "button", onClick: () => void window.secureDrive.syncNow(), className: "rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-300/20", children: "Sync now" }, void 0)] }, void 0), _jsx("div", { className: "mb-5 flex justify-end", children: _jsx("button", { type: "button", onClick: onLogout, className: "rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition hover:bg-white/10", children: "Log out" }, void 0) }, void 0), _jsxs("section", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: [_jsxs("article", { className: "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-slate-300", children: "Storage used" }, void 0), _jsx("p", { className: "mt-3 text-3xl font-bold text-white", children: "128 GB" }, void 0), _jsx("p", { className: "mt-2 text-sm text-slate-300", children: "of 512 GB plan" }, void 0)] }, void 0), _jsxs("article", { className: "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-slate-300", children: "Synced files" }, void 0), _jsx("p", { className: "mt-3 text-3xl font-bold text-white", children: "2,418" }, void 0), _jsx("p", { className: "mt-2 text-sm text-slate-300", children: "updated in last 24h" }, void 0)] }, void 0), _jsxs("article", { className: "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-slate-300", children: "Shared vaults" }, void 0), _jsx("p", { className: "mt-3 text-3xl font-bold text-white", children: "12" }, void 0), _jsxs("p", { className: "mt-2 text-sm text-slate-300", children: [pendingConnectionRequests.length, " pending connection requests"] }, void 0)] }, void 0), _jsxs("article", { className: "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.16em] text-slate-300", children: "Security score" }, void 0), _jsx("p", { className: "mt-3 text-3xl font-bold text-emerald-300", children: "98%" }, void 0), _jsx("p", { className: "mt-2 text-sm text-slate-300", children: "2FA enabled" }, void 0)] }, void 0)] }, void 0), _jsxs("section", { className: "mt-8 grid gap-5 lg:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2", children: [_jsx("h2", { className: "text-lg font-semibold text-white", children: "Active sync folders" }, void 0), connections.length === 0 ? (_jsx("p", { className: "mt-4 text-sm text-slate-300", children: "No secure folder connections yet." }, void 0)) : (_jsx("ul", { className: "mt-4 space-y-3 text-sm text-slate-200", children: connections.map((connection) => (_jsxs("li", { className: "flex items-center justify-between rounded-xl bg-black/20 px-4 py-3", children: [_jsxs("span", { children: [connection.folderName, " - syncing with ", connection.collaborator] }, void 0), _jsx("button", { type: "button", onClick: () => navigate('/files', { state: { folderPath: connection.folderPath } }), className: "rounded-lg border border-emerald-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-300/20", children: "Open" }, void 0)] }, connection.folderPath))) }, void 0))] }, void 0), _jsxs("aside", { className: "rounded-2xl border border-white/10 bg-white/5 p-6", children: [_jsx("h2", { className: "text-lg font-semibold text-white", children: "Quick actions" }, void 0), _jsxs("div", { className: "mt-4 grid gap-3", children: [_jsx("button", { type: "button", onClick: handlePickFolder, className: "rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300", children: "New secure folder" }, void 0), _jsx("button", { type: "button", onClick: () => {
                                                collaboratorsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                collaboratorSearchRef.current?.focus();
                                            }, className: "rounded-xl border border-slate-500/40 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800", children: "Add collaborator" }, void 0), _jsx("button", { type: "button", onClick: () => collaboratorsPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), className: "rounded-xl border border-slate-500/40 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800", children: "Collaborators" }, void 0)] }, void 0)] }, void 0)] }, void 0), _jsxs("section", { className: "mt-6 rounded-2xl border border-white/10 bg-white/5 p-6", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("h2", { className: "text-lg font-semibold text-white", children: "Connection requests" }, void 0), _jsxs("span", { className: "text-xs uppercase tracking-[0.14em] text-slate-300", children: ["Total: ", pendingConnectionRequests.length] }, void 0)] }, void 0), socialError && (_jsx("div", { className: "mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200", children: socialError }, void 0)), socialLoading ? (_jsx("p", { className: "mt-4 text-sm text-slate-400", children: "Loading connection requests..." }, void 0)) : pendingConnectionRequests.length === 0 ? (_jsx("p", { className: "mt-4 text-sm text-slate-400", children: "No connection requests yet." }, void 0)) : (_jsx("ul", { className: "mt-4 space-y-3", children: pendingConnectionRequests.map((request) => {
                                const isIncoming = request.receiver_id === user?.id;
                                const otherUserId = isIncoming ? request.requester_id : request.receiver_id;
                                const otherUser = userLookup.get(otherUserId);
                                return (_jsx("li", { className: "rounded-xl border border-white/10 bg-black/20 px-4 py-4", children: _jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium text-slate-100", children: [isIncoming ? 'From' : 'To', " ", otherUser?.name ?? `User #${otherUserId}`] }, void 0), _jsxs("p", { className: "text-xs text-slate-400", children: ["@", otherUser?.handle ?? 'unknown'] }, void 0), _jsx("p", { className: "mt-2 text-sm text-slate-300", children: request.title ?? 'Connection request' }, void 0), _jsx("p", { className: "mt-1 text-xs text-slate-400", children: request.description ?? 'No description provided.' }, void 0)] }, void 0), _jsx("div", { className: "flex items-center gap-2", children: isIncoming ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: () => void acceptConnectionRequest(request), disabled: activeConnectionRequestId === request.id, className: "rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60", children: activeConnectionRequestId === request.id ? 'Picking folder...' : 'Accept' }, void 0), _jsx("button", { type: "button", onClick: () => void rejectConnectionRequest(request.id), disabled: activeConnectionRequestId === request.id, className: "rounded-lg border border-rose-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60", children: "Reject" }, void 0)] }, void 0)) : (_jsx("button", { type: "button", onClick: () => void cancelConnectionRequest(request.id), disabled: activeConnectionRequestId === request.id, className: "rounded-lg border border-amber-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-60", children: activeConnectionRequestId === request.id ? 'Working...' : 'Cancel' }, void 0)) }, void 0)] }, void 0) }, request.id));
                            }) }, void 0))] }, void 0), _jsxs("section", { id: "collaborators-panel", ref: collaboratorsPanelRef, className: "mt-6 rounded-2xl border border-white/10 bg-white/5 p-6", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("h2", { className: "text-lg font-semibold text-white", children: "Collaborators" }, void 0), _jsxs("span", { className: "text-xs uppercase tracking-[0.14em] text-slate-300", children: ["Friends: ", friends.length, " | Pending: ", pendingRequests.length] }, void 0)] }, void 0), socialError && (_jsx("div", { className: "mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200", children: socialError }, void 0)), _jsxs("div", { className: "mt-4", children: [_jsx("label", { htmlFor: "collaborator-search", className: "mb-2 block text-sm font-medium text-slate-200", children: "Search and add collaborator" }, void 0), _jsx("input", { id: "collaborator-search", ref: collaboratorSearchRef, type: "text", value: searchTerm, onChange: (event) => setSearchTerm(event.target.value), placeholder: "Search by name or handle", disabled: socialLoading, className: "w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30" }, void 0)] }, void 0), _jsxs("div", { className: "mt-5 grid gap-5 lg:grid-cols-2", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold uppercase tracking-[0.14em] text-slate-300", children: "Discover users" }, void 0), socialLoading ? (_jsx("p", { className: "mt-3 text-sm text-slate-400", children: "Loading users..." }, void 0)) : filteredCandidates.length === 0 ? (_jsx("p", { className: "mt-3 text-sm text-slate-400", children: "No users match your search." }, void 0)) : (_jsx("ul", { className: "mt-3 space-y-2", children: filteredCandidates.map((candidate) => (_jsxs("li", { className: "flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-slate-100", children: candidate.name }, void 0), _jsxs("p", { className: "text-xs text-slate-400", children: ["@", candidate.handle] }, void 0)] }, void 0), _jsx("button", { type: "button", onClick: () => void sendFriendRequest(candidate), disabled: sendingToUserId === candidate.id || socialLoading, className: "rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300", children: sendingToUserId === candidate.id ? 'Sending...' : 'Add' }, void 0)] }, candidate.id))) }, void 0))] }, void 0), _jsxs("div", { className: "space-y-5", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold uppercase tracking-[0.14em] text-slate-300", children: "Pending requests" }, void 0), socialLoading ? (_jsx("p", { className: "mt-3 text-sm text-slate-400", children: "Loading requests..." }, void 0)) : pendingRequests.length === 0 ? (_jsx("p", { className: "mt-3 text-sm text-slate-400", children: "No pending requests." }, void 0)) : (_jsx("ul", { className: "mt-3 space-y-2", children: pendingRequests.map((request) => {
                                                        const isIncoming = request.receiver_id === user?.id;
                                                        const otherUserId = isIncoming ? request.requester_id : request.receiver_id;
                                                        const otherUser = userLookup.get(otherUserId);
                                                        const displayName = otherUser?.name ?? `User #${otherUserId}`;
                                                        const displayHandle = otherUser?.handle ?? 'unknown';
                                                        return (_jsxs("li", { className: "rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-amber-100", children: displayName }, void 0), _jsxs("p", { className: "text-xs text-amber-200/80", children: ["@", displayHandle] }, void 0)] }, void 0), _jsx("span", { className: "text-xs font-semibold uppercase tracking-[0.1em] text-amber-300", children: isIncoming ? 'Incoming' : 'Outgoing' }, void 0)] }, void 0), _jsx("div", { className: "mt-3 flex items-center gap-2", children: isIncoming ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", onClick: () => void acceptFriendRequest(request.id), disabled: activeRequestId === request.id, className: "rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-60", children: activeRequestId === request.id ? 'Working...' : 'Accept' }, void 0), _jsx("button", { type: "button", onClick: () => void rejectFriendRequest(request.id), disabled: activeRequestId === request.id, className: "rounded-lg border border-rose-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60", children: "Reject" }, void 0)] }, void 0)) : (_jsx("button", { type: "button", onClick: () => void cancelFriendRequest(request.id), disabled: activeRequestId === request.id, className: "rounded-lg border border-amber-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-60", children: activeRequestId === request.id ? 'Working...' : 'Cancel' }, void 0)) }, void 0)] }, request.id));
                                                    }) }, void 0))] }, void 0), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold uppercase tracking-[0.14em] text-slate-300", children: "Friends" }, void 0), socialLoading ? (_jsx("p", { className: "mt-3 text-sm text-slate-400", children: "Loading friends..." }, void 0)) : friends.length === 0 ? (_jsx("p", { className: "mt-3 text-sm text-slate-400", children: "No collaborators connected yet." }, void 0)) : (_jsx("ul", { className: "mt-3 space-y-2", children: friends.map((friend) => (_jsx("li", { className: "flex items-center justify-between rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-3", children: _jsxs("div", { children: [_jsx("p", { className: "text-sm text-slate-100", children: friend.name }, void 0), _jsxs("p", { className: "text-xs text-emerald-200/80", children: ["@", friend.handle] }, void 0)] }, void 0) }, friend.id))) }, void 0))] }, void 0)] }, void 0)] }, void 0)] }, void 0)] }, void 0) }, void 0));
}
//# sourceMappingURL=Homepage.js.map