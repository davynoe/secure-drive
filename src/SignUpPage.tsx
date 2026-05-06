import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

const USERNAME_KEY = 'secure-drive-username';
const EMAIL_KEY = 'secure-drive-email';
const HANDLE_KEY = 'secure-drive-handle';

type SignUpPageProps = {
  onSignUp: () => void;
};

export default function SignUpPage({ onSignUp }: SignUpPageProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !email.trim() || !handle.trim() || !password.trim()) return;

    try {
      localStorage.setItem(USERNAME_KEY, username.trim());
      localStorage.setItem(EMAIL_KEY, email.trim());
      localStorage.setItem(HANDLE_KEY, handle.trim());
    } catch {
      // Ignore localStorage write failures.
    }

    onSignUp();
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-emerald-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-10 md:px-10 md:py-14">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-black/30 backdrop-blur-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">Secure Drive</p>
          <h1 className="mt-3 text-3xl font-bold">Create your account</h1>
          <p className="mt-2 text-sm text-slate-300">Choose a username, email, handle, and password to get started.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
                required
              />
            </div>

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
                placeholder="Create a password"
                className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/30"
                required
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
            >
              Sign up
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-300">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-300 transition hover:text-emerald-200">
              Log in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}