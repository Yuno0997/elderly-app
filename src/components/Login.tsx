import { useState, useEffect, useRef } from 'react';
import { User } from '../App';
import { Heart, Eye, EyeOff, Clock, ShieldAlert } from 'lucide-react';
import { apiUrl, setAuthToken } from '../lib/api';

interface LoginProps {
  onLogin: (user: User) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Lockout countdown state
  const [lockSeconds, setLockSeconds] = useState(0);
  const [lockMessage, setLockMessage] = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start (or restart) countdown given total seconds to wait
  const startCountdown = (seconds: number, message: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setLockSeconds(seconds);
    setLockMessage(message);
    countdownRef.current = setInterval(() => {
      setLockSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setLockMessage('');
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
    return `0:${String(s).padStart(2, '0')}`;
  };

  const isLocked = lockSeconds > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      let data: {
        error?: string;
        token?: string;
        user?: User;
        retryAfter?: number;
        lockMessage?: string;
        lockedOut?: boolean;
      } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.ok
            ? 'Invalid response from server.'
            : `Server error (${res.status}). Is Apache proxying /elderly-app/api to port 4000?`
        );
      }

      // Handle rate-limit / lockout responses (429 or 401 with lockedOut flag)
      if (res.status === 429 || data.lockedOut) {
        const secs = data.retryAfter ?? 60;
        const msg = data.lockMessage || data.error || 'Too many login attempts.';
        startCountdown(secs, msg);
        setError(msg);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Login failed');
      }
      setAuthToken(data.token!);
      // Fetch fresh user profile so role/linked-resident changes reflect immediately.
      const meRes = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        onLogin(me);
      } else {
        onLogin(data.user!);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-teal-50 p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-teal-500 rounded-2xl mb-4 shadow-lg">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">SafeAlert Band</h1>
            <p className="text-slate-500 mt-1 text-sm">Elderly Care Monitoring System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLocked}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                placeholder="you@safealert.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLocked}
                  className="w-full px-4 pr-11 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isLocked}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="remember" className="ml-2 text-sm text-slate-600">
                Remember me
              </label>
            </div>

            {/* Lockout banner with live countdown */}
            {isLocked && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  <span>{lockMessage}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm text-red-600">
                    Try again in{' '}
                    <span className="font-bold tabular-nums text-red-700 text-base">
                      {formatCountdown(lockSeconds)}
                    </span>
                  </span>
                </div>
                {/* Countdown progress bar */}
                <div className="w-full bg-red-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 bg-red-400 rounded-full transition-all duration-1000 ease-linear"
                    style={{
                      width: `${(lockSeconds / (lockMessage.includes('5 minute') ? 300 : 60)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Regular error (no lockout) */}
            {error && !isLocked && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || isLocked}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white py-2.5 rounded-lg font-medium hover:from-blue-700 hover:to-teal-600 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in…' : isLocked ? `Locked — ${formatCountdown(lockSeconds)}` : 'Sign In'}
            </button>
          </form>

        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          SafeAlert Band · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
