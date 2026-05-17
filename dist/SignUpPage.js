import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
const USER_KEY = 'secure-drive-user';
// @ts-ignore - Vite will inject this at build time
const API_URL = import.meta.env.VITE_API_URL;
export default function SignUpPage({ onSignUp }) {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [handle, setHandle] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!username.trim() || !email.trim() || !handle.trim() || !password.trim())
            return;
        setError('');
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: username.trim(),
                    handle: handle.trim(),
                    password: password.trim(),
                    email: email.trim(),
                }),
            });
            const data = await response.json();
            if (data.status === 'success' || data.status === 'ok') {
                try {
                    localStorage.setItem(USER_KEY, JSON.stringify({
                        id: data.id,
                        name: data.name,
                        handle: data.handle,
                        email: data.email,
                    }, satisfies, StoredUser));
                }
                catch {
                    // Ignore localStorage write failures.
                }
                onSignUp({ id: data.id, name: data.name, handle: data.handle, email: data.email });
                return;
            }
            setError(data.message || 'Failed to create account.');
        }
        catch (err) {
            setError('Failed to connect to server. Please try again.');
            console.error('Sign up error:', err);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("main", { className: "min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100", children: _jsx("div", { className: "mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10 md:px-10 md:py-14", children: _jsxs("section", { className: "w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-black/30 backdrop-blur-xl", children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90", children: "Secure Drive" }, void 0), _jsx("h1", { className: "mt-3 text-3xl font-bold", children: "Create your account" }, void 0), _jsx("p", { className: "mt-2 text-sm text-slate-300", children: "Choose a username, email, handle, and password to get started." }, void 0), _jsxs("form", { className: "mt-7 space-y-4", onSubmit: handleSubmit, children: [error && (_jsx("div", { className: "rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200", children: error }, void 0)), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm font-medium text-slate-200", htmlFor: "username", children: "Username" }, void 0), _jsx("input", { id: "username", type: "text", value: username, onChange: (event) => setUsername(event.target.value), placeholder: "Your name", className: "w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30", required: true, disabled: loading }, void 0)] }, void 0), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm font-medium text-slate-200", htmlFor: "email", children: "Email" }, void 0), _jsx("input", { id: "email", type: "email", value: email, onChange: (event) => setEmail(event.target.value), placeholder: "you@example.com", className: "w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30", required: true, disabled: loading }, void 0)] }, void 0), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm font-medium text-slate-200", htmlFor: "handle", children: "Handle" }, void 0), _jsx("input", { id: "handle", type: "text", value: handle, onChange: (event) => setHandle(event.target.value), placeholder: "your-handle", className: "w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30", required: true, disabled: loading }, void 0)] }, void 0), _jsxs("div", { children: [_jsx("label", { className: "mb-2 block text-sm font-medium text-slate-200", htmlFor: "password", children: "Password" }, void 0), _jsx("input", { id: "password", type: "password", value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Create a password", className: "w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30", required: true, disabled: loading }, void 0)] }, void 0), _jsx("button", { type: "submit", disabled: loading, className: "mt-2 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed", children: loading ? 'Creating account...' : 'Sign up' }, void 0)] }, void 0), _jsxs("p", { className: "mt-6 text-sm text-slate-300", children: ["Already have an account?", ' ', _jsx(Link, { to: "/login", className: "font-semibold text-emerald-300 transition hover:text-emerald-200", children: "Log in" }, void 0)] }, void 0)] }, void 0) }, void 0) }, void 0));
}
//# sourceMappingURL=SignUpPage.js.map