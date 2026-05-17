import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
const SELECTED_FOLDER_KEY = 'secure-drive-selected-folder';
function formatSize(value) {
    if (value === null)
        return '-';
    if (value < 1024)
        return `${value} B`;
    if (value < 1024 * 1024)
        return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024)
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function createMockLastUpdated(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    const now = Date.now();
    const maxRangeMs = 1000 * 60 * 60 * 24 * 14;
    const offsetMs = hash % maxRangeMs;
    const date = new Date(now - offsetMs);
    return date.toLocaleString();
}
function FolderIcon() {
    return (_jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", className: "h-4 w-4 text-amber-300", children: _jsx("path", { fill: "currentColor", d: "M3 6.75A2.75 2.75 0 0 1 5.75 4h4.04c.87 0 1.68.41 2.2 1.1l.56.75c.23.31.59.49.98.49h4.77A2.75 2.75 0 0 1 21 9.09v8.16A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Z" }, void 0) }, void 0));
}
function FileIcon() {
    return (_jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", className: "h-4 w-4 text-slate-300", children: _jsx("path", { fill: "currentColor", d: "M7 3.75A2.75 2.75 0 0 1 9.75 1h4.79c.73 0 1.42.29 1.93.8l2.73 2.73c.51.51.8 1.2.8 1.93v13.79A2.75 2.75 0 0 1 17.25 23h-7.5A2.75 2.75 0 0 1 7 20.25V3.75Zm8.5.56V7h2.69L15.5 4.31Z" }, void 0) }, void 0));
}
function toTreeNodes(items) {
    return items.map((item) => ({
        ...item,
        isExpanded: false,
        isLoading: false,
        loadError: null,
        lastUpdated: createMockLastUpdated(item.path),
        children: null,
    }));
}
function updateNodeByPath(nodes, targetPath, updater) {
    return nodes.map((node) => {
        if (node.path === targetPath) {
            return updater(node);
        }
        if (!node.children) {
            return node;
        }
        return {
            ...node,
            children: updateNodeByPath(node.children, targetPath, updater),
        };
    });
}
function findNodeByPath(nodes, targetPath) {
    for (const node of nodes) {
        if (node.path === targetPath) {
            return node;
        }
        if (node.children) {
            const result = findNodeByPath(node.children, targetPath);
            if (result) {
                return result;
            }
        }
    }
    return null;
}
export default function FolderContentsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const locationState = location.state;
    const [folderPath, setFolderPath] = useState('');
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        const selectedFromRoute = locationState?.folderPath ?? '';
        if (selectedFromRoute) {
            setFolderPath(selectedFromRoute);
            try {
                localStorage.setItem(SELECTED_FOLDER_KEY, selectedFromRoute);
            }
            catch {
                // Ignore localStorage write failures.
            }
            return;
        }
        try {
            const fromStorage = localStorage.getItem(SELECTED_FOLDER_KEY) ?? '';
            setFolderPath(fromStorage);
        }
        catch {
            setFolderPath('');
        }
    }, [locationState]);
    useEffect(() => {
        let isMounted = true;
        const loadFolder = async () => {
            if (!folderPath) {
                setEntries([]);
                setLoading(false);
                setError('No folder selected yet.');
                return;
            }
            setLoading(true);
            setError('');
            try {
                const list = await window.secureDrive.listFolder(folderPath);
                if (!isMounted)
                    return;
                setEntries(toTreeNodes(list));
            }
            catch {
                if (!isMounted)
                    return;
                setEntries([]);
                setError('Could not read this folder. Please pick another one.');
            }
            finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };
        void loadFolder();
        return () => {
            isMounted = false;
        };
    }, [folderPath]);
    const handleToggleFolder = async (nodePath) => {
        const targetNode = findNodeByPath(entries, nodePath);
        if (!targetNode || targetNode.kind !== 'directory') {
            return;
        }
        if (targetNode.isExpanded) {
            setEntries((prev) => updateNodeByPath(prev, nodePath, (node) => ({
                ...node,
                isExpanded: false,
            })));
            return;
        }
        setEntries((prev) => updateNodeByPath(prev, nodePath, (node) => ({
            ...node,
            isExpanded: true,
        })));
        if (targetNode.children !== null) {
            return;
        }
        setEntries((prev) => updateNodeByPath(prev, nodePath, (node) => ({
            ...node,
            isLoading: true,
            loadError: null,
        })));
        try {
            const children = await window.secureDrive.listFolder(nodePath);
            setEntries((prev) => updateNodeByPath(prev, nodePath, (node) => ({
                ...node,
                isLoading: false,
                loadError: null,
                children: toTreeNodes(children),
            })));
        }
        catch {
            setEntries((prev) => updateNodeByPath(prev, nodePath, (node) => ({
                ...node,
                isLoading: false,
                loadError: 'Could not read this folder.',
                children: [],
            })));
        }
    };
    const renderTreeNodes = (nodes, depth = 0) => {
        return nodes.flatMap((node) => {
            const row = (_jsxs("div", { className: "flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-200 hover:bg-white/5", style: { paddingLeft: `${depth * 16 + 8}px` }, children: [_jsx("div", { className: "flex min-w-0 items-center gap-2", children: node.kind === 'directory' ? (_jsxs("button", { type: "button", onClick: () => void handleToggleFolder(node.path), className: "flex items-center gap-2 rounded-md px-1 py-1 text-left text-slate-100 transition hover:bg-white/10", children: [_jsx("span", { className: "w-4 text-center text-emerald-300", children: node.isExpanded ? 'v' : '>' }, void 0), _jsx(FolderIcon, {}, void 0), _jsx("span", { className: "truncate", children: node.name }, void 0)] }, void 0)) : (_jsxs(_Fragment, { children: [_jsx("span", { className: "w-4 text-center text-slate-500", children: "-" }, void 0), _jsx(FileIcon, {}, void 0), _jsx("span", { className: "truncate", children: node.name }, void 0)] }, void 0)) }, void 0), _jsxs("div", { className: "ml-4 flex shrink-0 items-center gap-6 text-xs text-slate-400", children: [_jsx("span", { children: node.kind === 'file' ? formatSize(node.size) : '-' }, void 0), _jsxs("span", { children: ["Updated: ", node.lastUpdated] }, void 0)] }, void 0)] }, node.path));
            if (node.kind !== 'directory' || !node.isExpanded) {
                return [row];
            }
            if (node.isLoading) {
                return [
                    row,
                    _jsx("p", { className: "px-2 py-1 text-xs text-slate-400", style: { paddingLeft: `${depth * 16 + 36}px` }, children: "Loading..." }, `${node.path}:loading`),
                ];
            }
            if (node.loadError) {
                return [
                    row,
                    _jsx("p", { className: "px-2 py-1 text-xs text-rose-300", style: { paddingLeft: `${depth * 16 + 36}px` }, children: node.loadError }, `${node.path}:error`),
                ];
            }
            if (!node.children || node.children.length === 0) {
                return [
                    row,
                    _jsx("p", { className: "px-2 py-1 text-xs text-slate-400", style: { paddingLeft: `${depth * 16 + 36}px` }, children: "Empty folder" }, `${node.path}:empty`),
                ];
            }
            return [row, ...renderTreeNodes(node.children, depth + 1)];
        });
    };
    return (_jsx("main", { className: "min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100", children: _jsxs("div", { className: "mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 md:px-10 md:py-14", children: [_jsxs("header", { className: "mb-8 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90", children: "Secure Drive" }, void 0), _jsx("h1", { className: "mt-2 text-3xl font-bold md:text-4xl", children: "Folder contents" }, void 0), _jsx("p", { className: "mt-2 max-w-3xl break-all text-sm text-slate-300", children: folderPath || 'No folder selected' }, void 0)] }, void 0), _jsx("button", { type: "button", onClick: () => navigate('/'), className: "rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10", children: "Back to homepage" }, void 0)] }, void 0), _jsx("section", { className: "rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/20 backdrop-blur", children: loading ? (_jsx("p", { className: "text-sm text-slate-300", children: "Loading folder contents..." }, void 0)) : error ? (_jsx("p", { className: "text-sm text-rose-300", children: error }, void 0)) : entries.length === 0 ? (_jsx("p", { className: "text-sm text-slate-300", children: "This folder is empty." }, void 0)) : _jsx("div", { className: "space-y-1", children: renderTreeNodes(entries) }, void 0) }, void 0)] }, void 0) }, void 0));
}
//# sourceMappingURL=FolderContentsPage.js.map