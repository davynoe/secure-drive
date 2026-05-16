import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

const USER_KEY = 'secure-drive-user';
// @ts-ignore - Vite will inject this at build time
const API_URL = import.meta.env.VITE_API_URL as string;

type StoredUser = {
  id: number;
  name: string;
  handle: string;
  email: string;
};

type LoginPageProps = {
  onLogin: (user: StoredUser) => void;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!handle.trim() || !password.trim()) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim(), password: password.trim() }),
      });

      const data = await response.json();

      if (data.status === 'success' || data.status === 'ok') {
        try {
          localStorage.setItem(
            USER_KEY,
            JSON.stringify({
              id: data.id,
              name: data.name,
              handle: data.handle,
              email: data.email,
            } satisfies StoredUser),
          );
        } catch {
          // Ignore localStorage write failures.
        }
        onLogin({ id: data.id, name: data.name, handle: data.handle, email: data.email });
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      setError('Failed to connect to server. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10 md:px-10 md:py-14">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-black/30 backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">Secure Drive</p>
          <h1 className="mt-3 text-3xl font-bold">Log in to continue</h1>
          <p className="mt-2 text-sm text-slate-300">Sign in with your handle and password.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="handle">
                Handle
              </label>
              <input
                id="handle"
                type="text"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="your-handle"
                className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-300">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-emerald-300 transition hover:text-emerald-200">
              Sign up
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
