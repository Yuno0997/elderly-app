import { useState, useEffect, useMemo } from 'react';
import { UserRole, User } from '../App';
import { apiFetch } from '../lib/api';
import { formatPHDate, formatPHDateTime } from '../lib/time';
import { TodoList } from './TodoList';
import { getFamilySelectedResidentId, setFamilySelectedResidentId } from '../lib/family';
import { FamilyResidentSelector } from './FamilyResidentSelector';
import { cn } from './ui/utils';
import {
  Users, Cpu, AlertTriangle, AlertCircle, Heart, Activity, Clock,
  CheckCircle, Bell, Pill, ClipboardList, Stethoscope, TrendingUp, TrendingDown,
  ChevronRight, User as UserIcon, Phone, Eye, Calendar, History,
} from 'lucide-react';

interface DashboardProps {
  userRole: UserRole;
  onNavigate: (page: string) => void;
  user: User;
}

type ApiResident = {
  id: number;
  name: string;
  room: string;
  status: string;
  profile_photo?: string | null;
  caregiver_user_id?: string | null;
  caregiver_name?: string | null;
};

type ApiAlert = {
  id: string;
  type: string;
  severity: 'critical' | 'warning';
  resident: string;
  room: string;
  timestamp: string;
  status: 'unacknowledged' | 'acknowledged';
};

type ApiMedication = {
  id: string;
  resident: string;
  medication: string;
  time: string;
  given: boolean;
};

type ApiCareTask = {
  id: string;
  caregiverUserId: string;
  caregiverName: string | null;
  residentIds: number[];
  residents: Array<{ id: number; name: string; room: string }>;
  taskType: string;
  scheduleTime: string;
  priority: string;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapApiResidents(data: ApiResident[]) {
  return data.map((r, i) => ({
    id: `res-${r.id}`,
    residentId: `RES-${1000 + Number(r.id)}`,
    name: r.name,
    age: 75 + (i % 15),
    room: r.room,
    profilePhoto: r.profile_photo ?? null,
    caregiver: r.caregiver_name || 'Unassigned',
    caregiverUserId: r.caregiver_user_id || null,
    hr: r.status === 'needs_attention' ? 102 : 65 + (i % 25),
    battery: 40 + ((i * 13) % 60),
    status: r.status === 'needs_attention' ? 'warning' : 'stable',
  }));
}

function useDashboardData() {
  const [residents, setResidents] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [careTasks, setCareTasks] = useState<ApiCareTask[]>([]);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [healthRes, residentsRes, alertsRes, medicationsRes, tasksRes] = await Promise.all([
          apiFetch('/api/health'),
          apiFetch('/api/residents'),
          apiFetch('/api/alerts'),
          apiFetch('/api/medications'),
          apiFetch('/api/care-tasks'),
        ]);
        setBackendHealthy(healthRes.ok);
        if (!residentsRes.ok) throw new Error('Failed residents API');
        const data: ApiResident[] = await residentsRes.json();
        setResidents(mapApiResidents(data));
        if (alertsRes.ok) {
          const alertsData: ApiAlert[] = await alertsRes.json();
          setAlerts(alertsData.map(a => ({ ...a, time: new Date(a.timestamp) })));
        }
        if (medicationsRes.ok) {
          const medicationsData: ApiMedication[] = await medicationsRes.json();
          setMedications(medicationsData);
        }
        if (tasksRes.ok) {
          const tasksData: ApiCareTask[] = await tasksRes.json();
          const list = Array.isArray(tasksData) ? tasksData : [];
          setCareTasks(list.map((t) => ({ ...t, completed: Boolean(t.completed) })));
        } else {
          setCareTasks([]);
        }
      } catch (_e) {
        setBackendHealthy(false);
      } finally {
        setIsLoading(false);
      }
    };
    load();

    // Lightweight realtime sync (polling). Keeps caregiver tasks/alerts updated without reload.
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load();
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  const updateAlertStatus = async (id: string, status: 'unacknowledged' | 'acknowledged' | 'resolved') => {
    const res = await apiFetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update alert');
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  const updateMedicationGiven = async (id: string, given: boolean) => {
    const res = await apiFetch(`/api/medications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ given }),
    });
    if (!res.ok) throw new Error('Failed to update medication');
    setMedications((prev) => prev.map((m) => (m.id === id ? { ...m, given } : m)));
  };

  const updateCareTaskCompleted = async (id: string, completed: boolean) => {
    const res = await apiFetch(`/api/care-tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    const text = await res.text();
    let body: unknown = null;
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (!res.ok) {
      const errObj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
      const errMsg = typeof errObj.error === 'string' ? errObj.error : '';
      if (res.status === 404) {
        throw new Error(
          'Task update is unavailable (404). Stop all Node processes and restart the backend (npm run dev:backend or dev:all) so the latest server code loads.'
        );
      }
      throw new Error(errMsg || `Could not update task (${res.status})`);
    }
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid response from server when updating task.');
    }
    const updated = { ...(body as ApiCareTask), completed: Boolean((body as ApiCareTask).completed) };
    setCareTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const clearCompletedTaskLogs = async () => {
    const res = await apiFetch('/api/care-tasks/completed', { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear task logs');
    setCareTasks((prev) => prev.filter((t) => !t.completed));
  };

  return {
    residents,
    alerts,
    medications,
    careTasks,
    backendHealthy,
    isLoading,
    updateAlertStatus,
    updateMedicationGiven,
    updateCareTaskCompleted,
    clearCompletedTaskLogs,
  };
}

export function Dashboard({ userRole, onNavigate, user }: DashboardProps) {
  if (userRole === 'relative') return <RelativeDashboard onNavigate={onNavigate} user={user} />;
  if (userRole === 'caregiver') return <CaregiverDashboard onNavigate={onNavigate} user={user} />;
  return <AdminDashboard onNavigate={onNavigate} />;
}

// ─── Shared data helpers ─────────────────────────────────────────────────────

function timeAgo(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const {
    residents,
    alerts: initialAlerts,
    medications,
    backendHealthy,
    isLoading,
    updateAlertStatus,
    updateMedicationGiven,
  } = useDashboardData();
  const [liveResidents, setLiveResidents] = useState(residents);
  const [alerts, setAlerts] = useState(initialAlerts);
  const activeAlerts = alerts.filter((a) => a.status === 'unacknowledged');
  const pendingMeds = medications.filter((m) => !m.given);

  useEffect(() => {
    setLiveResidents(residents);
  }, [residents]);
  useEffect(() => {
    setAlerts(initialAlerts);
  }, [initialAlerts]);

  useEffect(() => {
    const iv = setInterval(() => {
      setLiveResidents(prev => prev.map(r =>
        r.status !== 'offline' ? { ...r, hr: Math.max(50, Math.min(115, r.hr + Math.round((Math.random() - 0.5) * 6))) } : r
      ));
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  const stats = {
    total: liveResidents.length,
    online: liveResidents.filter(r => r.status !== 'offline').length,
    // Treat "Active Incidents" as items that still need attention.
    // Acknowledged incidents remain visible in the timeline/history but shouldn't stay in the active queue.
    incidents: activeAlerts.length,
    critical: activeAlerts.filter(a => a.severity === 'critical').length,
  };

  const handleAck = async (id: string) => {
    await updateAlertStatus(id, 'acknowledged');
  };

  const handleResolve = async (id: string) => {
    await updateAlertStatus(id, 'resolved');
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Hourly monitoring data (simulated last 8 hours)
  const hourlyData = Array.from({ length: 8 }, (_, i) => ({
    hour: `${String(new Date().getHours() - 7 + i).padStart(2, '0')}:00`,
    checked: 4 + Math.floor(Math.random() * 4),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="text-xs">
        <span className={backendHealthy ? 'text-green-600' : backendHealthy === false ? 'text-red-600' : 'text-slate-400'}>
          Backend: {backendHealthy ? 'Connected' : backendHealthy === false ? 'Disconnected' : 'Checking...'}
        </span>
        {isLoading && <span className="ml-2 text-slate-500">Loading residents...</span>}
      </div>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={Users} label="Total Residents" value={stats.total} color="blue" onClick={() => onNavigate('residents')} />
        <KPICard icon={Cpu} label="Active Devices" value={stats.online} color="green" />
        <KPICard icon={AlertCircle} label="Active Incidents" value={stats.incidents} color="yellow" />
        <KPICard icon={AlertTriangle} label="Critical Alerts" value={stats.critical} color="red" badge={stats.critical > 0} />
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Monitoring - 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Monitoring Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Live Resident Monitoring</h2>
              <button onClick={() => onNavigate('residents')} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {liveResidents.map(r => (
                <ResidentMonitorCard key={r.id} resident={r} />
              ))}
            </div>
          </div>

          {/* Hourly Monitoring Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Hourly Monitoring Activity — Today</h2>
            <div className="flex items-end gap-2 h-20">
              {hourlyData.map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-blue-500 rounded-t opacity-80 transition-all"
                    style={{ height: `${(h.checked / 8) * 100}%`, minHeight: 4 }} />
                  <span className="text-xs text-slate-400 hidden md:block">{h.hour}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1 text-xs text-slate-400 md:hidden">
              <span>{hourlyData[0].hour}</span>
              <span>{hourlyData[hourlyData.length - 1].hour}</span>
            </div>
            <div className="mt-3 text-xs text-slate-500 text-center">
              Average {Math.round(hourlyData.reduce((s, h) => s + h.checked, 0) / hourlyData.length)} residents monitored per hour
            </div>
          </div>
        </div>

        {/* Right Sidebar: Alerts + Tasks */}
        <div className="space-y-4">
          {/* Active Alerts */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900 mb-3">Active Incidents</h2>
            {activeAlerts.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-300" />
                <p className="text-sm">All clear — no active incidents</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAlerts.map(alert => (
                  <AlertEntry key={alert.id} alert={alert} onAck={handleAck} onResolve={handleResolve} />
                ))}
              </div>
            )}
          </div>

          {/* Medications Due */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Pill className="w-4 h-4 text-indigo-500" />
              Medications Due Today
            </h2>
            {pendingMeds.length === 0 ? (
              <div className="text-sm text-slate-500">No pending medications.</div>
            ) : (
              <div className="space-y-2">
                {pendingMeds.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <div className="text-slate-800 truncate">{m.resident}</div>
                      <div className="text-xs text-slate-500">{m.medication} · {m.time}</div>
                    </div>
                    <button
                      onClick={() => updateMedicationGiven(m.id, true)}
                      className="ml-2 flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-600 bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
                    >
                      Pending
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Tasks */}
          <TodoList
            title="To-do List"
            storageKey="safealert_admin_todos_v1"
            suggestions={[
              {
                id: 'unresolved-incidents',
                text: `Review unresolved incidents (${alerts.filter((a) => a.status !== 'resolved').length})`,
              },
              {
                id: 'pending-meds',
                text: `Check pending medications (${medications.filter((m) => !m.given).length})`,
              },
              {
                id: 'verify-residents',
                text: `Verify active residents (${liveResidents.length})`,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Caregiver Dashboard ──────────────────────────────────────────────────────
function careTaskPriorityClass(priority: string) {
  const p = priority?.toLowerCase();
  if (p === 'high') return 'bg-red-100 text-red-700';
  if (p === 'medium') return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

function taskIconForText(taskType: string) {
  const t = (taskType || '').toLowerCase();
  if (/(med|medicine|medication|pill)/.test(t)) return Pill;
  if (/(schedule|scheduled|round|check-in|check in|time)/.test(t)) return Clock;
  if (/(vital|bp|blood pressure|temperature|pulse|hr)/.test(t)) return Stethoscope;
  return ClipboardList;
}

function CaregiverDashboard({ onNavigate, user }: { onNavigate: (p: string) => void; user: User }) {
  const {
    residents: apiResidents,
    alerts,
    medications,
    careTasks,
    backendHealthy,
    isLoading,
    updateMedicationGiven,
    updateCareTaskCompleted,
    clearCompletedTaskLogs,
  } = useDashboardData();
  const [careTaskError, setCareTaskError] = useState('');
  const myResidents = apiResidents;
  const [residents, setResidents] = useState(myResidents);
  const myAlerts = alerts.filter(a =>
    a.status !== 'resolved' &&
    myResidents.some(r => r.name === a.resident)
  );
  const myMeds = medications.filter(m =>
    myResidents.some(r => r.name === m.resident)
  );
  const myPendingMeds = myMeds.filter((m) => !m.given);
  const pendingCareTasks = careTasks.filter((t) => !t.completed);
  const completedCareTasks = useMemo(() => {
    const done = careTasks.filter((t) => t.completed);
    return done.sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    });
  }, [careTasks]);
  const completedMedicationLogs = useMemo(() => {
    return myMeds
      .filter((m) => Boolean(m.given))
      .map((m) => ({
        id: `med-${m.id}`,
        resident: m.resident,
        medication: m.medication,
        time: m.time,
      }));
  }, [myMeds]);

  useEffect(() => {
    setResidents(myResidents);
  }, [myResidents]);

  useEffect(() => {
    const iv = setInterval(() => {
      setResidents(prev => prev.map(r =>
        r.status !== 'offline' ? { ...r, hr: Math.max(50, Math.min(115, r.hr + Math.round((Math.random() - 0.5) * 5))) } : r
      ));
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Welcome, {user.name.split(' ')[1]}</h1>
          <p className="text-sm text-slate-500">Your shift overview · {formatPHDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <p className={`text-xs mt-1 ${backendHealthy ? 'text-green-600' : backendHealthy === false ? 'text-red-600' : 'text-slate-400'}`}>
            Backend: {backendHealthy ? 'Connected' : backendHealthy === false ? 'Disconnected' : 'Checking...'}{isLoading ? ' · Loading residents...' : ''}
          </p>
        </div>
        <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium">
          {residents.length} Assigned Residents
        </div>
      </div>

      {/* Task Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{residents.length}</div>
          <div className="text-xs text-slate-500 mt-1">My Residents</div>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{myAlerts.length}</div>
          <div className="text-xs text-slate-500 mt-1">Active Alerts</div>
        </div>
        <div className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-indigo-600">{myMeds.filter(m => !m.given).length}</div>
          <div className="text-xs text-slate-500 mt-1">Meds Pending</div>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{careTasks.filter((t) => !t.completed).length}</div>
          <div className="text-xs text-slate-500 mt-1">Tasks pending</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assigned Residents */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">My Assigned Residents</h2>
            <button onClick={() => onNavigate('residents')} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Manage <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {residents.map(r => <ResidentMonitorCard key={r.id} resident={r} />)}
          </div>
        </div>

        {/* Right: Alerts + Meds */}
        <div className="space-y-4">
          {/* Contextual Alerts */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900 mb-3">My Resident Alerts</h2>
            {myAlerts.length === 0 ? (
              <div className="text-center py-6 text-slate-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                <p className="text-sm">No alerts for your residents</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myAlerts.map(alert => (
                  <div key={alert.id} className={`p-3 rounded-lg border-l-4 ${
                    alert.severity === 'critical' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-400'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 text-sm">{alert.type}</span>
                      <span className="text-xs text-slate-500">{timeAgo(alert.time)}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{alert.resident} · Room {alert.room}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin-assigned care tasks — pending only (completed → Task log) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-blue-500" /> My assigned tasks
            </h2>
            {careTaskError && (
              <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {careTaskError}
              </div>
            )}
            {/* Merge medication reminders + scheduled care into this one list */}
            {pendingCareTasks.length === 0 && myPendingMeds.length === 0 ? (
              <div className="text-center py-5 text-slate-400 text-sm">
                {careTasks.length === 0 ? 'No tasks assigned to you.' : 'No pending tasks — check Task log for completed items.'}
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {pendingCareTasks.map((task) => {
                  const Icon = taskIconForText(task.taskType);
                  return (
                  <div key={task.id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-900 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-500" />
                        {task.taskType}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${careTaskPriorityClass(task.priority)}`}>
                          {(task.priority || 'medium').toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCareTaskError('');
                            updateCareTaskCompleted(task.id, true).catch((e: unknown) => {
                              setCareTaskError(e instanceof Error ? e.message : 'Could not update task');
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-green-700 bg-green-600 text-white shadow-sm hover:bg-green-700 active:scale-[0.98] transition-all"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                    <div className="text-slate-600">
                      {task.residents.map((r) => `${r.name} (Room ${r.room})`).join(', ') || 'Residents'}
                    </div>
                    <div className="text-slate-500 flex items-center gap-1 mt-1.5 text-xs">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      {formatPHDateTime(task.scheduleTime)}
                    </div>
                    {task.notes && <div className="text-slate-600 mt-1.5 text-xs">{task.notes}</div>}
                  </div>
                  );
                })}

                {myPendingMeds.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 flex items-center gap-2">
                          <Pill className="w-4 h-4 text-indigo-500" />
                          Medication: {m.medication}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {m.resident} · {m.time}
                        </div>
                      </div>
                      <button
                        onClick={() => updateMedicationGiven(m.id, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-orange-700 bg-orange-600 text-white shadow-sm hover:bg-orange-700 active:scale-[0.98] transition-all flex-shrink-0"
                      >
                        Due
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" /> Task log
              </h2>
              {completedCareTasks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCareTaskError('');
                    clearCompletedTaskLogs().catch((e: unknown) => {
                      setCareTaskError(e instanceof Error ? e.message : 'Could not clear task log');
                    });
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.98] transition-all"
                >
                  Clear logs
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">Tasks you marked Done (same archive admins see in System Management).</p>
            {completedCareTasks.length === 0 && completedMedicationLogs.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-sm">No completed tasks yet.</div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {completedCareTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm opacity-90">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-800">{task.taskType}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCareTaskError('');
                          updateCareTaskCompleted(task.id, false).catch((e: unknown) => {
                            setCareTaskError(e instanceof Error ? e.message : 'Could not update task');
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-400 bg-slate-100 text-slate-700 shadow-sm hover:bg-slate-200 active:scale-[0.98] transition-all flex-shrink-0"
                      >
                        Undo
                      </button>
                    </div>
                    <div className="text-slate-600 text-xs">
                      {task.residents.map((r) => `${r.name} (Room ${r.room})`).join(', ') || 'Residents'}
                    </div>
                    {task.completedAt && (
                      <div className="text-xs text-green-700 mt-1.5">Completed {formatPHDateTime(task.completedAt)}</div>
                    )}
                  </div>
                ))}
                {completedMedicationLogs.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm opacity-90">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-slate-800">Medication: {m.medication}</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Done
                      </span>
                    </div>
                    <div className="text-slate-600 text-xs">
                      {m.resident} · {m.time}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* (Removed) Med Reminders + Scheduled Care — merged into My assigned tasks */}
        </div>
      </div>
    </div>
  );
}

// ─── Relative Dashboard ───────────────────────────────────────────────────────
function RelativeDashboard({ onNavigate, user }: { onNavigate: (p: string) => void; user: User }) {
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const linked = Array.isArray((user as any).residentIds) ? (user as any).residentIds : (user.residentId ? [user.residentId] : []);
  const [familyResidents, setFamilyResidents] = useState<Array<{ id: number; name: string; room: string; status?: string; profile_photo?: string | null }>>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<string>(() => getFamilySelectedResidentId(user.id));
  const [familyAlerts, setFamilyAlerts] = useState<any[]>([]);
  const [familyMeds, setFamilyMeds] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/health');
        if (!cancelled) setBackendHealthy(res.ok);
      } catch {
        if (!cancelled) setBackendHealthy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch('/api/family/residents');
        if (!res.ok) return;
        const rows = await res.json();
        if (cancelled) return;
        setFamilyResidents(Array.isArray(rows) ? rows : []);
      } catch {
        // ignore
      }
    };
    void load();
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    // Ensure we always have a valid selected resident.
    if (linked.length === 0) return;
    const current = selectedResidentId && linked.includes(selectedResidentId) ? selectedResidentId : '';
    const next = current || linked[0];
    if (next !== selectedResidentId) {
      setSelectedResidentId(next);
      setFamilySelectedResidentId(user.id, next);
    }
  }, [linked.join('|')]);

  const selectedRow = useMemo(() => {
    const m = /^RES-(\d+)$/i.exec(String(selectedResidentId).trim());
    const dbId = m ? Number(m[1]) - 1000 : NaN;
    return familyResidents.find((r) => Number(r.id) === dbId) || null;
  }, [selectedResidentId, familyResidents]);

  const vitals = useMemo(() => {
    // Placeholder vitals until device streaming is wired to residents.
    const base = selectedRow ? Number(selectedRow.id) : 0;
    const hr = selectedRow ? 62 + ((base * 7) % 42) : null;
    const battery = selectedRow ? 35 + ((base * 13) % 60) : null;
    return { hr, battery };
  }, [selectedRow]);

  useEffect(() => {
    if (!selectedResidentId) {
      setFamilyAlerts([]);
      setFamilyMeds([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const [alertsRes, medsRes] = await Promise.all([
          apiFetch(`/api/family/alerts?residentId=${encodeURIComponent(selectedResidentId)}`),
          apiFetch(`/api/family/medications?residentId=${encodeURIComponent(selectedResidentId)}`),
        ]);
        if (!cancelled && alertsRes.ok) {
          const a = await alertsRes.json();
          setFamilyAlerts(Array.isArray(a) ? a : []);
        }
        if (!cancelled && medsRes.ok) {
          const m = await medsRes.json();
          setFamilyMeds(Array.isArray(m) ? m : []);
        }
      } catch {
        // ignore live feed errors
      }
    };
    void load();
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [selectedResidentId]);

  const openIncidents = familyAlerts.filter((a) => a.status !== 'resolved');
  const resolvedIncidents = familyAlerts.filter((a) => a.status === 'resolved');
  const pendingMeds = familyMeds.filter((m) => !m.given);
  const givenMeds = familyMeds.filter((m) => Boolean(m.given));
  const latestIncident = [...familyAlerts].sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  )[0];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">Family Portal</div>
          <div className={`text-xs mt-1 ${backendHealthy ? 'text-green-600' : backendHealthy === false ? 'text-red-600' : 'text-slate-400'}`}>
            Backend: {backendHealthy ? 'Connected' : backendHealthy === false ? 'Disconnected' : 'Checking...'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 w-full max-w-md shadow-sm">
          <FamilyResidentSelector
            user={user}
            onChange={(rid) => {
              setSelectedResidentId(rid);
              setFamilySelectedResidentId(user.id, rid);
            }}
          />
        </div>
      </div>

      {linked.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">No linked resident profile yet</h2>
          <p className="text-sm text-slate-500">
            This account is active, but no resident has been linked for family viewing. Please contact facility administration.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-xs text-blue-700">Open incidents</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{openIncidents.length}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs text-emerald-700">Resolved incidents</div>
              <div className="text-2xl font-bold text-emerald-900 mt-1">{resolvedIncidents.length}</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs text-amber-700">Pending medication</div>
              <div className="text-2xl font-bold text-amber-900 mt-1">{pendingMeds.length}</div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="text-xs text-indigo-700">Given medication</div>
              <div className="text-2xl font-bold text-indigo-900 mt-1">{givenMeds.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-gradient-to-br from-blue-50 via-white to-teal-50 rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500">Selected resident</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900 truncate">
                    {selectedRow?.name || selectedResidentId || '—'}
                  </div>
                  <div className="text-sm text-slate-600 mt-1">
                    {selectedRow ? `Room ${selectedRow.room}` : 'Room —'} · {selectedResidentId || '—'}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2">
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      selectedRow?.status === 'needs_attention' ? 'bg-yellow-100 text-yellow-800'
                        : selectedRow?.status === 'offline' ? 'bg-slate-200 text-slate-700'
                          : 'bg-green-100 text-green-700'
                    )}>
                      {selectedRow?.status ? String(selectedRow.status).replace(/_/g, ' ') : 'unknown'}
                    </span>
                    <span className="text-xs text-slate-500">Live updates every 3s</span>
                  </div>
                </div>
                <div className="text-right">
                  <button
                    onClick={() => onNavigate('health-records')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Open Health Records
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Heart rate</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">{vitals.hr ? `${vitals.hr} bpm` : '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Battery</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">{vitals.battery ? `${vitals.battery}%` : '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Sleep</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">
                    {openIncidents.some((a) => /sleep/i.test(String(a.type || ''))) ? 'Alert' : 'Normal'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Incidents (7d)</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">{familyAlerts.length}</div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900 mb-1">Latest activity</div>
                {latestIncident ? (
                  <div className="text-sm text-slate-600">
                    {latestIncident.type} · Room {latestIncident.room} · {timeAgo(new Date(latestIncident.timestamp))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No recent incident activity.</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900">Quick access</div>
              <div className="mt-4 space-y-2">
                <button onClick={() => onNavigate('incident-history')} className="w-full px-4 py-2 rounded-lg border border-slate-200 text-left hover:bg-slate-50 text-sm">
                  Incident History
                </button>
                <button onClick={() => onNavigate('medication-log')} className="w-full px-4 py-2 rounded-lg border border-slate-200 text-left hover:bg-slate-50 text-sm">
                  Medication Log
                </button>
                <button onClick={() => onNavigate('health-records')} className="w-full px-4 py-2 rounded-lg border border-slate-200 text-left hover:bg-slate-50 text-sm">
                  Health Records
                </button>
              </div>
              <div className="mt-4 text-xs text-slate-500">
                Tip: switch residents using the selector above.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, color, badge, onClick }: any) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-left w-full transition-all ${onClick ? 'hover:shadow-md hover:border-blue-200 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {badge && (
          <div className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
            {value}
          </div>
        )}
      </div>
      <div className="font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </button>
  );
}

function ResidentMonitorCard({ resident }: { resident: any }) {
  const hrColor = resident.hr < 55 || resident.hr > 100 ? 'text-red-600' :
    resident.hr < 60 || resident.hr > 90 ? 'text-yellow-600' : 'text-green-600';
  const batteryColor = resident.battery < 20 ? 'text-red-500' : resident.battery < 40 ? 'text-yellow-500' : 'text-green-500';

  return (
    <div className={`p-3 rounded-lg border transition-colors ${
      resident.status === 'offline' ? 'border-slate-200 bg-slate-50' :
      resident.hr > 100 || resident.hr < 55 ? 'border-red-200 bg-red-50' :
      'border-slate-200 bg-white hover:border-blue-200'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
            {resident.profilePhoto ? (
              <img src={resident.profilePhoto} alt={resident.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-600">
                {(resident.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-slate-900 text-sm truncate">{resident.name}</div>
            <div className="text-xs text-slate-500 truncate">{resident.room} · {resident.residentId}</div>
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
          resident.status === 'offline' ? 'bg-slate-400' :
          resident.hr > 100 || resident.hr < 55 ? 'bg-red-500 animate-pulse' :
          'bg-green-500'
        }`} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <Heart className="w-3 h-3 text-red-400" />
          <span className={`font-semibold ${resident.status === 'offline' ? 'text-slate-400' : hrColor}`}>
            {resident.status === 'offline' ? '--' : `${Math.round(resident.hr)} bpm`}
          </span>
        </div>
        <div className={`font-medium ${batteryColor}`}>
          {resident.status === 'offline' ? 'Offline' : `⚡ ${Math.round(resident.battery)}%`}
        </div>
      </div>
    </div>
  );
}

function AlertEntry({ alert, onAck, onResolve }: { alert: any; onAck: (id: string) => void; onResolve: (id: string) => void }) {
  return (
    <div className={`p-3 rounded-lg border-l-4 ${
      alert.severity === 'critical' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-400'
    }`}>
      <div className="flex items-start justify-between mb-1">
        <span className={`text-sm font-semibold ${alert.severity === 'critical' ? 'text-red-800' : 'text-yellow-800'}`}>
          {alert.type}
        </span>
        <span className="text-xs text-slate-500">{timeAgo(alert.time)}</span>
      </div>
      <div className="text-xs text-slate-600 mb-2">{alert.resident} · Room {alert.room}</div>
      <div className="flex gap-2">
        {alert.status === 'unacknowledged' ? (
          <button
            onClick={() => onAck(alert.id)}
            className="px-3 py-1.5 bg-blue-600 border border-blue-700 text-white rounded-lg text-xs hover:bg-blue-700 active:scale-[0.98] transition-all font-semibold shadow-sm"
          >
            Acknowledge
          </button>
        ) : (
          <button
            onClick={() => onResolve(alert.id)}
            className="px-3 py-1.5 bg-green-600 text-white border border-green-700 rounded-lg text-xs hover:bg-green-700 active:scale-[0.98] transition-all font-semibold shadow-sm"
          >
            Resolve
          </button>
        )}
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          alert.status === 'unacknowledged' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {alert.status === 'unacknowledged' ? 'New' : 'Ack\'d'}
        </span>
      </div>
    </div>
  );
}
