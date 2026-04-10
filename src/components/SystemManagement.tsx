import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  History,
  MessageSquare,
  Pill,
  Clock,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPHDateTime } from '../lib/time';

type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'caregiver' | 'relative';
  active: boolean;
  residentId?: string;
  residentIds?: string[];
};

type ResidentRow = {
  id: number;
  name: string;
  room: string;
  archived: number | boolean;
  caregiver_user_id?: string | null;
  caregiver_name?: string | null;
};

type CareTask = {
  id: string;
  caregiverUserId: string;
  caregiverName: string;
  residentIds: number[];
  residents: Array<{ id: number; name: string; room: string }>;
  taskType: string;
  scheduleTime: string;
  priority: 'low' | 'medium' | 'high';
  notes?: string | null;
  completed?: boolean;
  completedAt?: string | null;
};

function taskIconForText(taskType: string) {
  const t = (taskType || '').toLowerCase();
  if (/(med|medicine|medication|pill)/.test(t)) return Pill;
  if (/(schedule|scheduled|round|check-in|check in|time)/.test(t)) return Clock;
  return ClipboardCheck;
}

export function SystemManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, AppUser['role']>>({});
  const [draftAssignments, setDraftAssignments] = useState<Record<number, string>>({});
  const [draftFamilyLinks, setDraftFamilyLinks] = useState<Record<string, string>>({});
  const [draftFamilyLinksMulti, setDraftFamilyLinksMulti] = useState<Record<string, string[]>>({});
  const [stats, setStats] = useState({ residents: 0, devices: 0, alerts: 0, medications: 0 });
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [savingFamilyLinks, setSavingFamilyLinks] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [clearingAllLogs, setClearingAllLogs] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [showAssignments, setShowAssignments] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showTaskLogs, setShowTaskLogs] = useState(true);
  const [showSmsTest, setShowSmsTest] = useState(true);
  const [smsScenario, setSmsScenario] = useState<'fall' | 'sleep' | 'pulse'>('fall');
  const [smsRecipient, setSmsRecipient] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [unismsConfigured, setUnismsConfigured] = useState<boolean | null>(null);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [facilityName, setFacilityName] = useState('Sunrise Senior Care');
  const [facilityId, setFacilityId] = useState('SCF-2024');
  const [savingFacility, setSavingFacility] = useState(false);
  const [newTask, setNewTask] = useState({
    caregiverUserId: '',
    residentIds: [] as number[],
    taskType: '',
    scheduleTime: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    notes: '',
  });

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [usersRes, residentsRes, devicesRes, alertsRes, medicationsRes, tasksRes] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/residents?includeArchived=true'),
        apiFetch('/api/devices'),
        apiFetch('/api/alerts'),
        apiFetch('/api/medications'),
        apiFetch('/api/care-tasks'),
      ]);
      if (!usersRes.ok) throw new Error('Failed to load users');
      const usersData: AppUser[] = await usersRes.json();
      setUsers(usersData);
      const residentsData: ResidentRow[] = residentsRes.ok ? await residentsRes.json() : [];
      const devicesData = devicesRes.ok ? await devicesRes.json() : [];
      const alertsData = alertsRes.ok ? await alertsRes.json() : [];
      const medicationsData = medicationsRes.ok ? await medicationsRes.json() : [];
      const rawTasks: CareTask[] = tasksRes.ok ? await tasksRes.json() : [];
      const tasksData = rawTasks.map((t) => ({ ...t, completed: Boolean(t.completed) }));
      setResidents(residentsData);
      setTasks(tasksData);
      setDraftAssignments(
        residentsData.reduce((acc, r) => {
          acc[r.id] = r.caregiver_user_id || '';
          return acc;
        }, {} as Record<number, string>)
      );
      setDraftRoles(
        usersData.reduce((acc, u) => {
          acc[u.id] = u.role;
          return acc;
        }, {} as Record<string, AppUser['role']>)
      );
      setDraftFamilyLinks(
        usersData.reduce((acc, u) => {
          acc[u.id] = u.residentId || '';
          return acc;
        }, {} as Record<string, string>)
      );
      setDraftFamilyLinksMulti(
        usersData.reduce((acc, u) => {
          const arr = Array.isArray((u as any).residentIds) ? (u as any).residentIds : (u.residentId ? [u.residentId] : []);
          acc[u.id] = [...new Set(arr.map((s: string) => String(s).trim()).filter(Boolean))];
          return acc;
        }, {} as Record<string, string[]>)
      );
      setStats({
        residents: residentsData.length,
        devices: devicesData.length,
        alerts: alertsData.filter((a: any) => a.status !== 'resolved').length,
        medications: medicationsData.filter((m: any) => !m.given).length,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load system management data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load();
    }, 7000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/settings/facility');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setFacilityName(String(data?.facilityName || 'Sunrise Senior Care'));
        setFacilityId(String(data?.facilityId || 'SCF-2024'));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let res = await apiFetch('/api/admin/unisms-status');
        if (res.status === 404) res = await apiFetch('/api/sms/unisms-status');
        if (!cancelled && res.ok) {
          const data = await res.json();
          setUnismsConfigured(Boolean(data?.configured));
        }
      } catch {
        if (!cancelled) setUnismsConfigured(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changedUsers = useMemo(
    () => users.filter((u) => draftRoles[u.id] && draftRoles[u.id] !== u.role),
    [users, draftRoles]
  );
  const caregiverUsers = useMemo(
    () => users.filter((u) => u.active && u.role === 'caregiver'),
    [users]
  );
  const relativeUsers = useMemo(
    () => users.filter((u) => u.active && u.role === 'relative'),
    [users]
  );
  const activeTasks = useMemo(
    () => tasks.filter((t) => !t.completed),
    [tasks]
  );
  const taskLogTasks = useMemo(() => {
    const done = tasks.filter((t) => t.completed);
    return done.sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    });
  }, [tasks]);

  const activeResidents = useMemo(() => {
    const list = residents.filter((r) => !Boolean(r.archived));
    const seen = new Set<number>();
    return list.filter((r) => {
      const id = Number(r.id);
      if (!Number.isFinite(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [residents]);
  const changedAssignments = useMemo(
    () =>
      activeResidents.filter((r) => {
        const current = r.caregiver_user_id || '';
        const draft = draftAssignments[r.id] ?? current;
        return draft !== current;
      }),
    [activeResidents, draftAssignments]
  );

  const handleSaveRoles = async () => {
    if (changedUsers.length === 0) {
      showToast('No role changes to save');
      return;
    }
    try {
      setSaving(true);
      for (const user of changedUsers) {
        const res = await apiFetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: draftRoles[user.id] }),
        });
        if (!res.ok) throw new Error(`Failed updating ${user.email}`);
      }
      await load();
      showToast('Role assignments saved');
    } catch (e: any) {
      setError(e?.message || 'Failed to save role assignments');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAssignments = async () => {
    if (changedAssignments.length === 0) {
      showToast('No assignment changes to save');
      return;
    }
    try {
      setSavingAssignments(true);
      for (const resident of changedAssignments) {
        const caregiverUserId = draftAssignments[resident.id] || null;
        const res = await apiFetch(`/api/residents/${resident.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caregiverUserId }),
        });
        if (!res.ok) throw new Error(`Failed assigning caregiver for ${resident.name}`);
      }
      await load();
      showToast('Caregiver assignments saved');
    } catch (e: any) {
      setError(e?.message || 'Failed to save caregiver assignments');
    } finally {
      setSavingAssignments(false);
    }
  };

  const changedFamilyLinks = useMemo(() => {
    return relativeUsers.filter((u) => {
      const current = Array.isArray((u as any).residentIds) ? (u as any).residentIds : (u.residentId ? [u.residentId] : []);
      const draft = draftFamilyLinksMulti[u.id] ?? current;
      const a = [...new Set(current.map((s: any) => String(s).trim()).filter(Boolean))].sort().join('|');
      const b = [...new Set(draft.map((s: any) => String(s).trim()).filter(Boolean))].sort().join('|');
      return a !== b;
    });
  }, [relativeUsers, draftFamilyLinksMulti]);

  const handleSaveFamilyLinks = async () => {
    if (changedFamilyLinks.length === 0) {
      showToast('No family links to save');
      return;
    }
    try {
      setSavingFamilyLinks(true);
      setError('');
      for (const user of changedFamilyLinks) {
        const residentIds = (draftFamilyLinksMulti[user.id] || []).map((s) => String(s).trim()).filter(Boolean);
        const first = residentIds[0] ?? null;
        const res = await apiFetch(`/api/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ residentId: first, residentIds }),
        });
        if (!res.ok) throw new Error(`Failed linking resident for ${user.email}`);
      }
      await load();
      showToast('Family links saved');
    } catch (e: any) {
      setError(e?.message || 'Failed to save family links');
    } finally {
      setSavingFamilyLinks(false);
    }
  };

  const handleCreateTask = async () => {
    const residentIds = Array.from(
      new Set(newTask.residentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
    );
    if (!newTask.caregiverUserId || residentIds.length === 0 || !newTask.taskType.trim() || !newTask.scheduleTime.trim()) {
      setError('Please complete all required task fields (including at least one resident).');
      return;
    }
    try {
      setSavingTask(true);
      setError('');
      const res = await apiFetch('/api/care-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caregiverUserId: newTask.caregiverUserId,
          residentIds,
          taskType: newTask.taskType.trim(),
          scheduleTime: newTask.scheduleTime,
          priority: newTask.priority,
          notes: newTask.notes.trim() || undefined,
        }),
      });
      const raw = await res.text();
      let payload: unknown = null;
      if (raw.trim()) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
      }
      const errObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      if (!res.ok) {
        const detail = typeof errObj.detail === 'string' ? errObj.detail : '';
        const errMsg = typeof errObj.error === 'string' ? errObj.error : '';
        const details = Array.isArray(errObj.details) ? (errObj.details as string[]).filter(Boolean).join('; ') : '';
        const msg =
          [errMsg, detail, details].filter(Boolean).join(': ') ||
          (payload === null && raw
            ? `Server returned non-JSON (${res.status}). Restart the backend on port 4000.`
            : res.status === 404
              ? 'Care tasks API not found — use the latest backend and ensure it is running on port 4000.'
              : `Request failed (${res.status})`);
        throw new Error(msg);
      }
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid response when creating care task.');
      }
      const created = { ...(payload as CareTask), completed: Boolean((payload as CareTask).completed) };
      setTasks((prev) => [...prev, created]);
      setNewTask({
        caregiverUserId: '',
        residentIds: [],
        taskType: '',
        scheduleTime: '',
        priority: 'medium',
        notes: '',
      });
      setShowNewTaskForm(false);
      showToast('Care task created');
    } catch (e: any) {
      setError(e?.message || 'Failed to create task');
    } finally {
      setSavingTask(false);
    }
  };

  const handleRemoveTask = async (id: string) => {
    try {
      const res = await apiFetch(`/api/care-tasks/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to remove task');
      }
      setTasks((prev) => prev.filter((t) => t.id !== id));
      showToast('Care task removed');
    } catch (e: any) {
      setError(e?.message || 'Failed to remove task');
    }
  };

  const handleClearTaskLogs = async () => {
    try {
      const res = await apiFetch('/api/care-tasks/completed', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear task logs');
      setTasks((prev) => prev.filter((t) => !t.completed));
      showToast('Task logs cleared');
    } catch (e: any) {
      setError(e?.message || 'Failed to clear task logs');
    }
  };

  const handleClearAllLogs = async () => {
    const ok = window.confirm(
      'Clear ALL recorded logs?\n\nThis will permanently delete incident history, medication logs/events, completed task logs, and audit logs.'
    );
    if (!ok) return;
    try {
      setClearingAllLogs(true);
      const res = await apiFetch('/api/admin/logs/clear-all', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || data?.error || 'Failed to clear all logs');
      }
      const totalCleared = Number(data?.totalCleared || 0);
      await load();
      showToast(totalCleared > 0 ? `Cleared ${totalCleared} log records` : 'No logs to clear');
    } catch (e: any) {
      setError(e?.message || 'Failed to clear all logs');
    } finally {
      setClearingAllLogs(false);
    }
  };

  const handleSendTestSms = async () => {
    const recipient = smsRecipient.trim();
    if (!recipient.startsWith('+')) {
      setSmsFeedback({ type: 'err', text: 'Use E.164 format starting with + (e.g. +639123456789).' });
      return;
    }
    setSmsBusy(true);
    setSmsFeedback(null);
    try {
      let res = await apiFetch('/api/admin/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: smsScenario, recipient }),
      });
      if (res.status === 404) {
        res = await apiFetch('/api/sms/test-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario: smsScenario, recipient }),
        });
      }
      const raw = await res.text();
      let payload: Record<string, unknown> = {};
      if (raw.trim()) {
        try {
          payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      }
      if (!res.ok) {
        const detail = typeof payload.detail === 'string' ? payload.detail : '';
        const err = typeof payload.error === 'string' ? payload.error : '';
        if (res.status === 404) {
          throw new Error(
            'SMS API not found (404). Stop every Node process, then start the backend again from the project folder (npm run dev:backend or npm run dev:all) so the latest server code loads.'
          );
        }
        throw new Error([err, detail].filter(Boolean).join(': ') || `Request failed (${res.status})`);
      }
      const ref = typeof payload.referenceId === 'string' ? payload.referenceId : '';
      setSmsFeedback({
        type: 'ok',
        text: ref ? `Sent. Reference: ${ref}` : (typeof payload.message === 'string' ? payload.message : 'Test SMS queued.'),
      });
      showToast('Test SMS sent');
    } catch (e: any) {
      setSmsFeedback({ type: 'err', text: e?.message || 'Failed to send test SMS' });
    } finally {
      setSmsBusy(false);
    }
  };

  const handleSaveFacility = async () => {
    if (!facilityName.trim() || !facilityId.trim()) {
      setError('Facility name and ID are required.');
      return;
    }
    try {
      setSavingFacility(true);
      setError('');
      const res = await apiFetch('/api/settings/facility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityName: facilityName.trim(),
          facilityId: facilityId.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || data?.error || 'Failed to save facility settings');
        return;
      }
      setFacilityName(String(data?.facilityName || facilityName.trim()));
      setFacilityId(String(data?.facilityId || facilityId.trim()));
      showToast('Facility settings saved');
    } catch (e: any) {
      setError(e?.message || 'Failed to save facility settings');
    } finally {
      setSavingFacility(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">System Management</h1>
            <p className="text-slate-500 mt-1">Live system data and role controls (no mock data).</p>
          </div>
          <button
            type="button"
            onClick={handleClearAllLogs}
            disabled={clearingAllLogs}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 text-sm font-medium flex items-center gap-2"
            title="Clear all recorded logs"
          >
            <Trash2 className="w-4 h-4" />
            {clearingAllLogs ? 'Clearing logs...' : 'Clear All Logs'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Residents" value={stats.residents} icon={Users} />
        <Metric label="Devices" value={stats.devices} icon={Settings} />
        <Metric label="Open Alerts" value={stats.alerts} icon={Settings} />
        <Metric label="Pending Meds" value={stats.medications} icon={Settings} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <div className="font-semibold text-slate-900">Facility Settings</div>
          <div className="text-sm text-slate-500 mt-0.5">Edit facility name shown in the sidebar for all users.</div>
        </div>
        <div className="p-5 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Facility name</label>
              <input
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                placeholder="e.g. Sunrise Senior Care"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Facility ID</label>
              <input
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                placeholder="e.g. SCF-2024"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveFacility}
            disabled={savingFacility}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {savingFacility ? 'Saving...' : 'Save Facility Settings'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              <UserCog className="w-4 h-4 text-blue-600" />
              User Role Management
            </div>
            <div className="text-sm text-slate-500 mt-0.5">Roles are loaded from `/api/users`.</div>
          </div>
          <button
            onClick={load}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="p-5 bg-slate-50 space-y-3">
          {loading && <div className="text-sm text-slate-500">Loading users...</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && users.length === 0 && <div className="text-sm text-slate-500">No users found.</div>}
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between bg-white rounded-lg p-4 border border-slate-200">
              <div>
                <div className="font-medium text-slate-900">{user.name}</div>
                <div className="text-xs text-slate-500">{user.email}</div>
              </div>
              <select
                value={draftRoles[user.id] || user.role}
                onChange={(e) => setDraftRoles((prev) => ({ ...prev, [user.id]: e.target.value as AppUser['role'] }))}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="admin">Administrator</option>
                <option value="caregiver">Caregiver</option>
                <option value="relative">Relative/Family</option>
              </select>
            </div>
          ))}
          <button
            onClick={handleSaveRoles}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mt-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Role Assignments'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSmsTest((v) => !v)}
          className="w-full p-5 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50"
        >
          <div className="text-left">
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              SMS alert testing
            </div>
            <div className="text-sm text-slate-500 mt-0.5">
              Prototype: send one sample safety SMS via UniSMS (thesis / demo). Requires <code className="text-xs bg-slate-100 px-1 rounded">UNISMS_API_SECRET</code> on the server.
            </div>
          </div>
          {showSmsTest ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showSmsTest && (
          <div className="p-5 bg-slate-50 space-y-4">
            {unismsConfigured === false && (
              <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                UniSMS is not configured. Set <strong>UNISMS_API_SECRET</strong> (your API secret key) in the environment and restart the backend.
              </div>
            )}
            {unismsConfigured === true && (
              <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">API secret detected — you can send test messages.</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Alert scenario</label>
                <select
                  value={smsScenario}
                  onChange={(e) => setSmsScenario(e.target.value as 'fall' | 'sleep' | 'pulse')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="fall">Fall detection</option>
                  <option value="sleep">Sleep anomaly</option>
                  <option value="pulse">Pulse rate anomaly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Recipient (E.164)</label>
                <input
                  type="text"
                  value={smsRecipient}
                  onChange={(e) => setSmsRecipient(e.target.value)}
                  placeholder="+639123456789"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  autoComplete="tel"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSendTestSms}
              disabled={smsBusy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-60"
            >
              <MessageSquare className="w-4 h-4" />
              {smsBusy ? 'Sending…' : 'Send test SMS'}
            </button>
            {smsFeedback && (
              <div
                className={`text-sm rounded-lg px-3 py-2 ${
                  smsFeedback.type === 'ok'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {smsFeedback.text}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowTasks((v) => !v)}
          className="w-full p-5 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50"
        >
          <div className="text-left">
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-blue-600" />
              Caregiver Task Assignment
            </div>
            <div className="text-sm text-slate-500 mt-0.5">Assign and manage specific tasks for caregivers</div>
          </div>
          {showTasks ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showTasks && (
          <div className="p-5 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Active Tasks ({activeTasks.length})</span>
              <button
                onClick={() => setShowNewTaskForm((v) => !v)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                New Task
              </button>
            </div>
            {showNewTaskForm && (
              <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Caregiver</label>
                    <select
                      value={newTask.caregiverUserId}
                      onChange={(e) => setNewTask((p) => ({ ...p, caregiverUserId: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">Select caregiver</option>
                      {caregiverUsers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Task Type</label>
                    <input
                      value={newTask.taskType}
                      onChange={(e) => setNewTask((p) => ({ ...p, taskType: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      placeholder="e.g. Medication Assistance"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Schedule</label>
                    <input
                      type="datetime-local"
                      value={newTask.scheduleTime}
                      onChange={(e) => setNewTask((p) => ({ ...p, scheduleTime: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Priority</label>
                    <select
                      value={newTask.priority}
                      onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value as 'low' | 'medium' | 'high' }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Assigned Residents</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-36 overflow-auto border border-slate-200 rounded-lg p-2">
                    {activeResidents.map((r) => {
                      const rid = Number(r.id);
                      return (
                      <label key={rid} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={newTask.residentIds.some((id) => Number(id) === rid)}
                          onChange={(e) =>
                            setNewTask((p) => ({
                              ...p,
                              residentIds: e.target.checked
                                ? [...p.residentIds.filter((id) => Number(id) !== rid), rid]
                                : p.residentIds.filter((id) => Number(id) !== rid),
                            }))
                          }
                        />
                        {r.name} (Room {r.room})
                      </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notes</label>
                  <textarea
                    value={newTask.notes}
                    onChange={(e) => setNewTask((p) => ({ ...p, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    rows={2}
                    placeholder="Optional instructions"
                  />
                </div>
                <button
                  onClick={handleCreateTask}
                  disabled={savingTask}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
                >
                  {savingTask ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            )}
            {activeTasks.length === 0 && <div className="text-sm text-slate-500">No active tasks.</div>}
            {activeTasks.map((task) => (
              <div key={task.id} className="bg-white rounded-lg p-4 border border-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {(() => {
                        const Icon = taskIconForText(task.taskType);
                        return (
                          <span className="font-semibold text-slate-900 flex items-center gap-2">
                            <Icon className="w-4 h-4 text-slate-500" />
                            {task.taskType}
                          </span>
                        );
                      })()}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        task.priority === 'high' ? 'bg-red-100 text-red-700' :
                        task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {task.priority.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-blue-600">{task.caregiverName}</div>
                    <div className="text-sm text-slate-600">{task.residents.map((r) => `${r.name} (Room ${r.room})`).join(', ') || 'No resident assigned'}</div>
                    <div className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <Calendar className="w-4 h-4" />
                      {formatPHDateTime(task.scheduleTime)}
                    </div>
                    {task.notes && <div className="text-sm text-slate-600 mt-1">{task.notes}</div>}
                  </div>
                  <button
                    onClick={() => handleRemoveTask(task.id)}
                    className="px-3 py-1 bg-red-50 text-red-700 rounded-lg text-xs hover:bg-red-100 transition-colors font-medium flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden mt-4">
              <button
                type="button"
                onClick={() => setShowTaskLogs((v) => !v)}
                className="w-full p-4 flex items-center justify-between hover:bg-slate-50 text-left"
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-500" />
                  <div>
                    <div className="text-sm font-medium text-slate-900">Task logs</div>
                    <div className="text-xs text-slate-500">Completed tasks (archived when a caregiver marks Done)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {taskLogTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearTaskLogs();
                      }}
                      className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                    >
                      Clear logs
                    </button>
                  )}
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{taskLogTasks.length}</span>
                  {showTaskLogs ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </button>
              {showTaskLogs && (
                <div className="px-4 pb-4 pt-0 space-y-2 border-t border-slate-100 bg-slate-50/80">
                  {taskLogTasks.length === 0 && (
                    <div className="text-sm text-slate-500 py-4 text-center">No completed tasks yet.</div>
                  )}
                  {taskLogTasks.map((task) => (
                    <div key={task.id} className="bg-white rounded-lg p-4 border border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {(() => {
                              const Icon = taskIconForText(task.taskType);
                              return (
                                <span className="font-semibold text-slate-800 flex items-center gap-2">
                                  <Icon className="w-4 h-4 text-slate-500" />
                                  {task.taskType}
                                </span>
                              );
                            })()}
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Completed</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              task.priority === 'high' ? 'bg-red-100 text-red-700' :
                              task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {task.priority.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-sm text-blue-600">{task.caregiverName}</div>
                          <div className="text-sm text-slate-600">{task.residents.map((r) => `${r.name} (Room ${r.room})`).join(', ') || 'No resident assigned'}</div>
                          <div className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                            <Calendar className="w-4 h-4" />
                            Scheduled {formatPHDateTime(task.scheduleTime)}
                          </div>
                          {task.completedAt && (
                            <div className="text-sm text-green-700 mt-1 font-medium">
                              Marked done {formatPHDateTime(task.completedAt)}
                            </div>
                          )}
                          {task.notes && <div className="text-sm text-slate-600 mt-1">{task.notes}</div>}
                        </div>
                        <button
                          onClick={() => handleRemoveTask(task.id)}
                          className="px-3 py-1 bg-red-50 text-red-700 rounded-lg text-xs hover:bg-red-100 transition-colors font-medium flex items-center gap-1 flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowAssignments((v) => !v)}
          className="w-full p-5 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50"
        >
          <div className="text-left">
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Caregiver & Resident Assignment
            </div>
            <div className="text-sm text-slate-500 mt-0.5">
              Assign caregivers to residents and manage care responsibilities
            </div>
          </div>
          {showAssignments ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showAssignments && (
          <div className="p-5 bg-slate-50 space-y-3">
            {activeResidents.length === 0 && <div className="text-sm text-slate-500">No active residents available.</div>}
            {activeResidents.map((resident) => (
              <div key={resident.id} className="flex items-center justify-between bg-white rounded-lg p-4 border border-slate-200 gap-3">
                <div>
                  <div className="font-medium text-slate-900">{resident.name}</div>
                  <div className="text-xs text-slate-500">Room {resident.room}</div>
                </div>
                <select
                  value={draftAssignments[resident.id] ?? resident.caregiver_user_id ?? ''}
                  onChange={(e) =>
                    setDraftAssignments((prev) => ({
                      ...prev,
                      [resident.id]: e.target.value,
                    }))
                  }
                  className="min-w-52 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Unassigned</option>
                  {caregiverUsers.map((caregiver) => (
                    <option key={caregiver.id} value={caregiver.id}>
                      {caregiver.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              onClick={handleSaveAssignments}
              disabled={savingAssignments}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mt-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {savingAssignments ? 'Saving...' : 'Save Caregiver Assignments'}
            </button>

            <div className="h-px bg-slate-200 my-4" />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">Family Member ↔ Resident Linking</div>
                <div className="text-sm text-slate-500">Choose which resident a family account can view</div>
              </div>
              <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">
                {relativeUsers.length} family accounts
              </div>
            </div>
            {relativeUsers.length === 0 ? (
              <div className="text-sm text-slate-500 bg-white rounded-lg p-4 border border-slate-200">
                No active family/relative accounts found.
              </div>
            ) : (
              <div className="space-y-2">
                {relativeUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between bg-white rounded-lg p-4 border border-slate-200 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{u.name}</div>
                      <div className="text-xs text-slate-500 truncate">{u.email}</div>
                    </div>
                    <div className="min-w-60">
                      <div className="grid grid-cols-1 gap-1.5 max-h-28 overflow-auto border border-slate-200 rounded-lg p-2 bg-white">
                        {activeResidents.map((r) => {
                          const rid = `RES-${1000 + Number(r.id)}`;
                          const selected = (draftFamilyLinksMulti[u.id] ?? (u as any).residentIds ?? (u.residentId ? [u.residentId] : [])).includes(rid);
                          return (
                            <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  setDraftFamilyLinksMulti((prev) => {
                                    const cur = prev[u.id] ?? ((u as any).residentIds ?? (u.residentId ? [u.residentId] : []));
                                    const next = e.target.checked ? [...cur, rid] : cur.filter((x: string) => x !== rid);
                                    return { ...prev, [u.id]: [...new Set(next)] };
                                  });
                                }}
                              />
                              <span className="truncate">{r.name} (Room {r.room}) · {rid}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Selected: {(draftFamilyLinksMulti[u.id]?.length ?? ((u as any).residentIds?.length ?? (u.residentId ? 1 : 0)))} resident(s)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={handleSaveFamilyLinks}
              disabled={savingFamilyLinks}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium mt-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {savingFamilyLinks ? 'Saving...' : 'Save Family Links'}
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <Check className="w-5 h-5" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
    </div>
  );
}