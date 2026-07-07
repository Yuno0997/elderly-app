import { useState } from 'react';
import { User } from '../App';
import { X, UserCircle2, Mail } from 'lucide-react';
import { apiFetch, clearAuthToken } from '../lib/api';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onSaved: (user: User) => void;
  onLogout?: () => void;
}

export function ProfileModal({ user, onClose, onSaved, onLogout }: ProfileModalProps) {
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState((user as any).phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [emailChanged, setEmailChanged] = useState(false);

  const handleSave = async () => {
    setError('');
    setMessage('');
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    try {
      setSaving(true);
      const body: Record<string, any> = {
        name: name.trim(),
        phone: phone.trim() || null,
      };
      // Only send email if it actually changed
      if (trimmedEmail !== user.email.toLowerCase()) {
        body.email = trimmedEmail;
      }
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail || data?.error || 'Failed to save profile');
        return;
      }
      onSaved(data);
      if (data.emailChanged) {
        setEmailChanged(true);
        setMessage('Email updated! You will be logged out to sign in with your new email.');
        // Give user a moment to read the message then log out
        setTimeout(() => {
          clearAuthToken();
          if (onLogout) onLogout();
        }, 3000);
      } else {
        setMessage('Profile updated successfully.');
      }
    } catch {
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle2 className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-900">My Profile</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              Email
              <span className="text-xs font-normal text-blue-600 ml-1">(Login email)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailChanged}
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            {email.trim().toLowerCase() !== user.email.toLowerCase() && !emailChanged && (
              <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                ⚠ Changing your email will log you out. You must sign in again with the new email.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Mobile Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 09171234567"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>}
          {message && <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">{message}</div>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || emailChanged}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
