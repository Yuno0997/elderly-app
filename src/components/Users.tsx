import { useEffect, useState } from 'react';
import { Search, Plus, X, RotateCcw, UserX, Users as UsersIcon, UserCheck, Trash2, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPHDate } from '../lib/time';

const AVATAR_COLORS = [
  'from-purple-400 to-purple-600',
  'from-blue-400 to-blue-600',
  'from-teal-400 to-teal-600',
  'from-indigo-400 to-indigo-600',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
];

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

type AppUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profilePhoto?: string | null;
  role: 'admin' | 'caregiver' | 'relative';
  active: boolean;
  created_at?: string;
  residentId?: string;
  colorIndex: number;
  department: string;
  responsibilities: string[];
  joined: string;
  lastActive: string;
};

const ROLE_META: Record<string, { label: string; badge: string; dot: string }> = {
  admin: { label: 'Administrator', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  caregiver: { label: 'Caregiver', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  relative: { label: 'Family Member', badge: 'bg-teal-100 text-teal-700', dot: 'bg-teal-500' },
};
const TEMP_PASSWORD_MIN_LENGTH = 4;

export function Users() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch('/api/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.map((u: any, i: number) => ({
        ...u,
        role: u.role,
        profilePhoto: u.profile_photo ?? u.profilePhoto ?? null,
        colorIndex: i % AVATAR_COLORS.length,
        department: u.role === 'admin' ? 'Administration' : u.role === 'caregiver' ? 'Care Team' : 'Family Member',
        responsibilities: u.role === 'relative' && u.residentId ? [u.residentId] : ['Platform Access'],
        joined: u.created_at ? formatPHDate(u.created_at, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
        lastActive: 'Recently',
      })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (!res.ok) return;
        const me = await res.json();
        setCurrentUserId(String(me?.id || ''));
      } catch {
        // ignore
      }
    })();
  }, []);

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.department.toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const activeAdminCount = users.filter((u) => u.role === 'admin' && u.active).length;
  const canDeleteUser = (u: AppUser) => {
    if (!u) return false;
    if (u.id === currentUserId) return false;
    if (u.role === 'admin' && activeAdminCount <= 1) return false;
    return true;
  };

  const handleToggleActive = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    if (user.role === 'admin' && user.active && activeAdminCount <= 1) {
      showToast('You cannot deactivate the last active administrator.');
      return;
    }
    const res = await apiFetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    });
    if (!res.ok) {
      showToast('Failed to update user status');
      return;
    }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u));
    showToast(user.active ? `${user.name} deactivated` : `${user.name} reactivated`);
    if (selectedUser?.id === id) setSelectedUser((prev: any) => ({ ...prev, active: !prev.active }));
  };

  const handleDeleteUser = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    if (!canDeleteUser(user)) {
      showToast(user.id === currentUserId ? 'You cannot delete your own account.' : 'Cannot delete the last active administrator.');
      return;
    }
    const confirmed = window.confirm(`Delete ${user.name}? This action cannot be undone.`);
    if (!confirmed) return;
    const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      let msg = 'Failed to delete user';
      try {
        const data = await res.json();
        msg = data?.detail || data?.error || msg;
      } catch {
        // Keep default message for non-JSON responses.
      }
      showToast(msg);
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== id));
    if (selectedUser?.id === id) setSelectedUser(null);
    showToast(`${user.name} deleted`);
  };

  const stats = {
    total: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    caregiver: users.filter(u => u.role === 'caregiver').length,
    relative: users.filter(u => u.role === 'relative').length,
    active: users.filter(u => u.active).length,
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-0.5">{stats.total} total · {stats.active} active</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-semibold text-purple-700">{stats.admin}</span>
          <span className="text-purple-600 ml-1">Admin</span>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-semibold text-blue-700">{stats.caregiver}</span>
          <span className="text-blue-600 ml-1">Caregivers</span>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-semibold text-teal-700">{stats.relative}</span>
          <span className="text-teal-600 ml-1">Family</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {['all', 'admin', 'caregiver', 'relative'].map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-2 text-sm capitalize transition-colors ${
                roleFilter === role ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {role === 'all' ? 'All' : ROLE_META[role]?.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* User Profile Cards Grid */}
      {loading && <div className="text-sm text-slate-500 mb-4">Loading users...</div>}
      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map(user => (
          <UserCard
            key={user.id}
            user={user}
            activeAdminCount={activeAdminCount}
            currentUserId={currentUserId}
            onView={() => setSelectedUser(user)}
            onToggleActive={handleToggleActive}
            onDelete={handleDeleteUser}
          />
        ))}
        {filteredUsers.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400">
            <UsersIcon className="w-16 h-16 mx-auto mb-4 text-slate-200" />
            <p>No users found</p>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          activeAdminCount={activeAdminCount}
          currentUserId={currentUserId}
          onClose={() => setSelectedUser(null)}
          onToggleActive={handleToggleActive}
          onDelete={handleDeleteUser}
        />
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onAdd={(newUser: any) => {
            setUsers(prev => [...prev, { ...newUser, colorIndex: prev.length % AVATAR_COLORS.length }]);
            setShowAddModal(false);
            showToast('User added successfully');
            loadUsers();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-xl text-sm z-50 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

function UserCard({ user, activeAdminCount, currentUserId, onView, onToggleActive, onDelete }: any) {
  const meta = ROLE_META[user.role] ?? ROLE_META.caregiver;
  const canToggleActive = user.role !== 'admin' || !user.active || activeAdminCount > 1;
  const canDelete = user.id !== currentUserId && (user.role !== 'admin' || activeAdminCount > 1);
  return (
    <div className={`bg-white rounded-xl border shadow-sm transition-all hover:shadow-md ${user.active ? 'border-slate-200' : 'border-slate-200 opacity-75'}`}>
      {/* Card Header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${AVATAR_COLORS[user.colorIndex]} flex items-center justify-center text-lg font-bold text-white flex-shrink-0 shadow-md`}>
            {user.profilePhoto ? (
              <img src={user.profilePhoto} alt={user.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              getInitials(user.name)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{user.name}</div>
                <div className="text-xs text-slate-500 truncate">{user.email}</div>
              </div>
              {!user.active && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs flex-shrink-0">Inactive</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                {meta.label}
              </span>
              {user.active && (
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                  Active
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-1.5">{user.department}</div>
          <div className="flex flex-wrap gap-1">
            {user.responsibilities.slice(0, 2).map((r: string) => (
              <span key={r} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{r}</span>
            ))}
            {user.responsibilities.length > 2 && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-xs">+{user.responsibilities.length - 2} more</span>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="px-5 pb-4 flex items-center justify-between gap-2">
        <div className="text-xs text-slate-400">Active {user.lastActive}</div>
        <div className="flex gap-2">
          <button
            onClick={onView}
            className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
          >
            View
          </button>
          {canToggleActive && (
            user.active ? (
              <button
                onClick={() => onToggleActive(user.id)}
                className="px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
              >
                Deactivate
              </button>
            ) : (
              <button
                onClick={() => onToggleActive(user.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reactivate
              </button>
            )
          )}
          <button
            onClick={() => canDelete && onDelete(user.id)}
            disabled={!canDelete}
            title={!canDelete ? (user.id === currentUserId ? 'You cannot delete your own account' : 'Cannot delete the last active administrator') : 'Delete user'}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              canDelete
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({ user, activeAdminCount, currentUserId, onClose, onToggleActive, onDelete }: any) {
  const canDelete = user.id !== currentUserId && (user.role !== 'admin' || activeAdminCount > 1);
  const meta = ROLE_META[user.role] ?? ROLE_META.caregiver;
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [mobile, setMobile] = useState(user.phone ?? '');
  const [mobileMsg, setMobileMsg] = useState('');
  const [mobileErr, setMobileErr] = useState('');
  const [residentLink, setResidentLink] = useState(user.residentId ?? '');
  const [residentLinkMsg, setResidentLinkMsg] = useState('');
  const [residentLinkErr, setResidentLinkErr] = useState('');
  const [residentOptions, setResidentOptions] = useState<Array<{ id: number; name: string; room: string }>>([]);

  useEffect(() => {
    if (user.role !== 'relative') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/residents');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setResidentOptions(rows.map((r: any) => ({ id: Number(r.id), name: String(r.name || ''), room: String(r.room || '') })));
      } catch {
        // ignore resident option load errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, user.role]);

  const handleSaveMobile = async () => {
    setMobileErr('');
    setMobileMsg('');
    const res = await apiFetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: mobile.trim() || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMobileErr(data?.detail || data?.error || 'Failed to update mobile number');
      return;
    }
    user.phone = data?.phone ?? null;
    setMobileMsg('Mobile number updated.');
  };

  const handleResetPassword = async () => {
    setPwErr('');
    setPwMsg('');
    if (newPassword.length < TEMP_PASSWORD_MIN_LENGTH) {
      setPwErr(`Temporary password must be at least ${TEMP_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    const res = await apiFetch(`/api/users/${user.id}/reset-password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPwErr(data?.error || 'Failed to reset password');
      return;
    }
    setPwMsg('Password reset successful.');
    setNewPassword('');
  };

  const handleSaveResidentLink = async () => {
    setResidentLinkErr('');
    setResidentLinkMsg('');
    const res = await apiFetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residentId: residentLink || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setResidentLinkErr(data?.detail || data?.error || 'Failed to update linked resident');
      return;
    }
    user.residentId = data?.residentId ?? residentLink ?? '';
    setResidentLinkMsg('Linked resident updated.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${AVATAR_COLORS[user.colorIndex]} flex items-center justify-center text-xl font-bold text-white shadow-lg`}>
                {user.profilePhoto ? (
                  <img src={user.profilePhoto} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  getInitials(user.name)
                )}
              </div>
              <div>
                <h2 className="font-bold text-slate-900">{user.name}</h2>
                <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${meta.badge}`}>{meta.label}</div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {[
            { label: 'Email', value: user.email },
            { label: 'Phone', value: user.phone || 'Not set' },
            { label: 'Department', value: user.department },
            { label: 'Joined', value: user.joined },
            { label: 'Last Active', value: user.lastActive },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <span className="text-sm font-medium text-slate-900 text-right ml-4">{value}</span>
            </div>
          ))}

          <div>
            <div className="text-sm text-slate-500 mb-2">Assigned Responsibilities</div>
            <div className="flex flex-wrap gap-2">
              {user.responsibilities.map((r: string) => (
                <span key={r} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs">{r}</span>
              ))}
            </div>
          </div>

          {user.role === 'relative' && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-sm text-slate-500 mb-2">Linked Resident</div>
              <div className="flex gap-2">
                <select
                  value={residentLink}
                  onChange={(e) => setResidentLink(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select resident</option>
                  {residentOptions.map((r) => {
                    const publicId = `RES-${1000 + Number(r.id)}`;
                    return (
                      <option key={publicId} value={publicId}>
                        {r.name} (Room {r.room}) · {publicId}
                      </option>
                    );
                  })}
                </select>
                <button
                  onClick={handleSaveResidentLink}
                  className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900"
                >
                  Save
                </button>
              </div>
              {residentLinkErr && <div className="text-xs text-red-600 mt-2">{residentLinkErr}</div>}
              {residentLinkMsg && <div className="text-xs text-green-600 mt-2">{residentLinkMsg}</div>}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-500 mb-2">Mobile Number</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="e.g. 09171234567"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveMobile}
                className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900"
              >
                Save
              </button>
            </div>
            {mobileErr && <div className="text-xs text-red-600 mt-2">{mobileErr}</div>}
            {mobileMsg && <div className="text-xs text-green-600 mt-2">{mobileMsg}</div>}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-500 mb-2">Admin Password Reset</div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New temporary password"
                  className="w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleResetPassword}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                Reset
              </button>
            </div>
            {pwErr && <div className="text-xs text-red-600 mt-2">{pwErr}</div>}
            {pwMsg && <div className="text-xs text-green-600 mt-2">{pwMsg}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex gap-3">
          {(user.role !== 'admin' || !user.active || activeAdminCount > 1) && (
            user.active ? (
              <button
                onClick={() => { onToggleActive(user.id); onClose(); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
              >
                <UserX className="w-4 h-4" />
                Deactivate User
              </button>
            ) : (
              <button
                onClick={() => { onToggleActive(user.id); onClose(); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Reactivate User
              </button>
            )
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
          >
            Close
          </button>
          <button
            onClick={() => { if (canDelete) { onDelete(user.id); onClose(); } }}
            disabled={!canDelete}
            title={!canDelete ? (user.id === currentUserId ? 'You cannot delete your own account' : 'Cannot delete the last active administrator') : 'Delete user'}
            className={`px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-2 ${
              canDelete
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ onClose, onAdd }: any) {
  const [form, setForm] = useState({ name: '', email: '', mobile: '', role: 'caregiver', password: '', residentId: '' });
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [error, setError] = useState('');
  const [residentOptions, setResidentOptions] = useState<Array<{ id: number; name: string; room: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/residents');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setResidentOptions(
          rows.map((r: any) => ({
            id: Number(r.id),
            name: String(r.name || ''),
            room: String(r.room || ''),
          }))
        );
      } catch {
        // keep empty options
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) return;
    setError('');
    if (form.password.length < TEMP_PASSWORD_MIN_LENGTH) {
      setError(`Temporary password must be at least ${TEMP_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    const res = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.mobile || undefined,
        password: form.password,
        role: form.role,
        residentId: form.role === 'relative' ? form.residentId || undefined : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || 'Failed to create user');
      return;
    }
    onAdd({
      ...data,
      department: data.role === 'admin' ? 'Administration' : data.role === 'caregiver' ? 'Care Team' : 'Family Member',
      responsibilities: data.role === 'relative' && data.residentId ? [data.residentId] : ['Platform Access'],
      joined: data.created_at ? formatPHDate(data.created_at, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
      lastActive: 'Never',
      active: data.active,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Add New User</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: 'Full Name *', key: 'name', type: 'text', placeholder: 'e.g. Nurse Maria Santos' },
            { label: 'Email Address *', key: 'email', type: 'email', placeholder: 'maria@safealert.com' },
            { label: 'Mobile Number', key: 'mobile', type: 'text', placeholder: 'e.g. 09171234567' },
            { label: 'Temporary Password *', key: 'password', type: 'password', placeholder: 'e.g. 1234' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{f.label}</label>
              {f.key === 'password' ? (
                <div className="relative">
                  <input
                    type={showTempPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full px-3 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTempPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    aria-label={showTempPassword ? 'Hide password' : 'Show password'}
                  >
                    {showTempPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <input
                  type={f.type}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role *</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="caregiver">Caregiver / Staff</option>
              <option value="admin">Administrator</option>
              <option value="relative">Family Member</option>
            </select>
          </div>
          {form.role === 'relative' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Linked Resident</label>
              <select
                value={form.residentId}
                onChange={(e) => setForm({ ...form, residentId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select resident</option>
                {residentOptions.map((r) => {
                  const publicId = `RES-${1000 + Number(r.id)}`;
                  return (
                    <option key={publicId} value={publicId}>
                      {r.name} (Room {r.room}) · {publicId}
                    </option>
                  );
                })}
              </select>
              <div className="text-[11px] text-slate-400 mt-1">
                Family account will only see records for this linked resident.
              </div>
            </div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="text-[11px] text-slate-400">Temporary password can be simple (minimum 4 characters). User will be prompted to change it on first login.</div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm">
            Add User
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
