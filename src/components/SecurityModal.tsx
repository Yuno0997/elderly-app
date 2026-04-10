import { useEffect, useState } from 'react';
import { X, Shield, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPHDateTime } from '../lib/time';

interface SecurityModalProps {
  onClose: () => void;
  onPasswordChanged?: () => void;
  onSessionsRevoked?: () => void;
  forceChange?: boolean;
}

function getPasswordStrength(password: string) {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (/[A-Za-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: '25%' };
  if (score === 2) return { label: 'Fair', color: 'bg-yellow-500', width: '50%' };
  if (score === 3) return { label: 'Good', color: 'bg-blue-500', width: '75%' };
  return { label: 'Strong', color: 'bg-green-500', width: '100%' };
}

export function SecurityModal({ onClose, onPasswordChanged, onSessionsRevoked, forceChange = false }: SecurityModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sessionInfo, setSessionInfo] = useState<{ issuedAt: string | null; expiresAt: string | null } | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const res = await apiFetch('/api/auth/session');
        if (!res.ok) return;
        const data = await res.json();
        setSessionInfo({ issuedAt: data.issuedAt ?? null, expiresAt: data.expiresAt ?? null });
      } catch {
        // ignore session metadata errors
      }
    };
    loadSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(newPassword)) {
      setError('Password must be 6+ characters and include letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to change password');
      setMessage('Password changed successfully.');
      onPasswordChanged?.();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogoutAllSessions = async () => {
    setError('');
    setMessage('');
    try {
      setRevoking(true);
      const res = await apiFetch('/api/auth/logout-all-sessions', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to revoke sessions');
      onSessionsRevoked?.();
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke sessions');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-900">Profile Security</h2>
          </div>
          {!forceChange && (
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {forceChange && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              For security, you must update your temporary password before continuing.
            </div>
          )}
          {sessionInfo && !forceChange && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div>Session started: {sessionInfo.issuedAt ? formatPHDateTime(sessionInfo.issuedAt) : 'N/A'}</div>
              <div>Session expires: {sessionInfo.expiresAt ? formatPHDateTime(sessionInfo.expiresAt) : 'N/A'}</div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Password strength</span>
              <span>{getPasswordStrength(newPassword).label}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded">
              <div
                className={`h-2 rounded ${getPasswordStrength(newPassword).color}`}
                style={{ width: getPasswordStrength(newPassword).width }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Use 6+ chars with letters and numbers.</p>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
          {message && <div className="text-sm text-green-600">{message}</div>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </button>
            {!forceChange && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
              >
                Close
              </button>
            )}
          </div>
          {!forceChange && (
            <button
              type="button"
              onClick={handleLogoutAllSessions}
              disabled={revoking}
              className="w-full px-4 py-2 border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm disabled:opacity-60"
            >
              {revoking ? 'Revoking sessions...' : 'Log Out All Sessions'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
