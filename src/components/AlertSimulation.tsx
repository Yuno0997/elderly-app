import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Moon, HeartPulse, Send, Trash2, Users, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

type AppUser = { id: string; name: string; email: string; role: 'admin' | 'caregiver' | 'relative'; active: boolean };

type Scenario = 'fall' | 'sleep' | 'pulse';
type Target = 'admin' | 'caregiver' | 'all';

const SCENARIOS: Array<{
  id: Scenario;
  title: string;
  description: string;
  icon: React.ElementType;
  badge: string;
}> = [
  { id: 'fall', title: 'Fall Detected', description: 'Critical fall alert for rapid response.', icon: AlertTriangle, badge: 'bg-red-100 text-red-700' },
  { id: 'sleep', title: 'Sleep Anomaly', description: 'Sleep pattern anomaly for monitoring.', icon: Moon, badge: 'bg-yellow-100 text-yellow-800' },
  { id: 'pulse', title: 'Unusual Pulse', description: 'Elevated/irregular pulse for vitals check.', icon: HeartPulse, badge: 'bg-rose-100 text-rose-700' },
];

export function AlertSimulation({ currentUserId }: { currentUserId: string }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [target, setTarget] = useState<Target>('caregiver');
  const [selectedCaregiverIds, setSelectedCaregiverIds] = useState<string[]>([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch('/api/users');
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        if (!alive) return;
        setUsers(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Failed to load users');
      }
    })();
    return () => { alive = false; };
  }, []);

  const caregivers = useMemo(() => {
    return users.filter((u) => u.role === 'caregiver' && u.active);
  }, [users]);
  const admins = useMemo(() => {
    return users.filter((u) => u.role === 'admin' && u.active);
  }, [users]);
  const caregiverMap = useMemo(
    () => new Map(caregivers.map((u) => [u.id, u])),
    [caregivers]
  );
  const adminMap = useMemo(
    () => new Map(admins.map((u) => [u.id, u])),
    [admins]
  );

  useEffect(() => {
    if (caregivers.length === 0) {
      setSelectedCaregiverIds([]);
      return;
    }
    setSelectedCaregiverIds((prev) => prev.filter((id) => caregivers.some((c) => c.id === id)));
  }, [caregivers]);

  useEffect(() => {
    if (admins.length === 0) {
      setSelectedAdminIds([]);
      return;
    }
    setSelectedAdminIds((prev) => {
      const filtered = prev.filter((id) => admins.some((a) => a.id === id));
      if (filtered.length > 0) return filtered;
      return admins.some((a) => a.id === currentUserId) ? [currentUserId] : [admins[0].id];
    });
  }, [admins, currentUserId]);

  const toggleMulti = (kind: 'caregiver' | 'admin', id: string) => {
    const setter = kind === 'caregiver' ? setSelectedCaregiverIds : setSelectedAdminIds;
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };

  const playAlertSound = () => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const gain = ctx.createGain();

      o1.type = 'sawtooth';
      o2.type = 'square';
      o1.frequency.setValueAtTime(880, now);
      o2.frequency.setValueAtTime(660, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

      o1.connect(gain);
      o2.connect(gain);
      gain.connect(ctx.destination);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.66);
      o2.stop(now + 0.66);
      setTimeout(() => {
        void ctx.close();
      }, 800);
    } catch {
      // best-effort only
    }
  };

  const simulate = async () => {
    setError('');
    if (scenarios.length === 0) {
      setError('Please select at least one alert.');
      return;
    }
    if (target === 'caregiver' && selectedCaregiverIds.length === 0) {
      setError('Select at least one caregiver first.');
      return;
    }
    if (target === 'admin' && selectedAdminIds.length === 0) {
      setError('Select at least one admin first.');
      return;
    }
    setBusy(true);
    let totalCreated = 0;
    let totalSkipped = 0;
    try {
      for (const scenario of scenarios) {
        const res = await apiFetch('/api/admin/alert-simulation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenario,
            target,
            caregiverUserIds: target === 'caregiver' ? selectedCaregiverIds : undefined,
            adminUserIds: target === 'admin' ? selectedAdminIds : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.detail || data?.error || `Failed on ${scenario} (HTTP ${res.status}).`);
          return;
        }
        totalCreated += typeof data?.created === 'number' ? data.created : 0;
        totalSkipped += typeof data?.skipped === 'number' ? data.skipped : 0;
      }
      
      if (totalCreated > 0 && totalSkipped > 0) {
        playAlertSound();
        showToast(`Simulation sent (${totalCreated}) · skipped ${totalSkipped} caregiver(s) with no residents`);
      } else if (totalCreated > 0) {
        playAlertSound();
        showToast(`Simulation sent (${totalCreated} alert${totalCreated === 1 ? '' : 's'})`);
      } else {
        showToast('Already sent recently. Wait 5 seconds, then try again.');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to simulate alerts.');
    } finally {
      setBusy(false);
    }
  };

  const clearSimulations = async () => {
    setError('');
    if (target === 'caregiver' && selectedCaregiverIds.length === 0) {
      setError('Select at least one caregiver first.');
      return;
    }
    if (target === 'admin' && selectedAdminIds.length === 0) {
      setError('Select at least one admin first.');
      return;
    }
    setBusy(true);
    let totalDeleted = 0;
    try {
      const activeScenarios = scenarios.length > 0 ? scenarios : ['fall', 'sleep', 'pulse'];
      for (const scenario of activeScenarios) {
        const res = await apiFetch('/api/admin/alert-simulation/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenario,
            target,
            caregiverUserIds: target === 'caregiver' ? selectedCaregiverIds : undefined,
            adminUserIds: target === 'admin' ? selectedAdminIds : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.detail || data?.error || `Failed (HTTP ${res.status}).`);
          return;
        }
        totalDeleted += typeof data?.deleted === 'number' ? data.deleted : 0;
      }
      showToast(totalDeleted > 0 ? `Cleared ${totalDeleted} simulation alert${totalDeleted === 1 ? '' : 's'}` : 'No simulation alerts to clear');
    } catch (e: any) {
      setError(e?.message || 'Failed to clear simulation alerts.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alert Simulation</h1>
          <p className="text-sm text-slate-500 mt-1">Create test alerts for selected caregiver(s) using real resident assignments.</p>
        </div>
        <div className="text-xs text-slate-400">Admin: {currentUserId}</div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">1) Choose alert type</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const active = scenarios.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScenarios(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  active ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/40' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 text-sm">{s.title}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.badge}`}>Test</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Icon className="w-4 h-4 text-slate-500" />
                  {s.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-900">2) Choose who to alert</div>

        <div className="flex flex-wrap gap-2">
          {([
            { id: 'caregiver', label: 'Caregiver' },
            { id: 'admin', label: 'Admin' },
            { id: 'all', label: 'All' },
          ] as Array<{ id: Target; label: string }>).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTarget(t.id)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                target === t.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {target === 'caregiver' && (
          <div className="space-y-2">
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              Caregiver recipients
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCaregiverIds(caregivers.map((c) => c.id))}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedCaregiverIds([])}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              >
                None
              </button>
            </div>
            {selectedCaregiverIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCaregiverIds.map((id) => {
                  const c = caregiverMap.get(id);
                  if (!c) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                      {c.name}
                      <button
                        type="button"
                        onClick={() => toggleMulti('caregiver', id)}
                        className="rounded-full p-0.5 hover:bg-blue-100"
                        aria-label={`Remove ${c.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                toggleMulti('caregiver', id);
                e.currentTarget.value = '';
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select caregiver(s)</option>
              {caregivers.map((c) => (
                <option key={c.id} value={c.id}>
                  {selectedCaregiverIds.includes(c.id) ? '✓ ' : ''}{c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {target === 'admin' && (
          <div className="space-y-2">
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              Admin recipients
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedAdminIds(admins.map((a) => a.id))}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSelectedAdminIds([])}
                className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50"
              >
                None
              </button>
            </div>
            {selectedAdminIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedAdminIds.map((id) => {
                  const a = adminMap.get(id);
                  if (!a) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-violet-50 text-violet-700 border border-violet-200">
                      {a.name}
                      <button
                        type="button"
                        onClick={() => toggleMulti('admin', id)}
                        className="rounded-full p-0.5 hover:bg-violet-100"
                        aria-label={`Remove ${a.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                toggleMulti('admin', id);
                e.currentTarget.value = '';
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select admin(s)</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {selectedAdminIds.includes(a.id) ? '✓ ' : ''}{a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pt-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={simulate}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-60 text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              {busy ? 'Sending…' : 'Trigger Selected Alerts'}
            </button>
            <button
              type="button"
              onClick={clearSimulations}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200 disabled:opacity-60 text-sm font-medium"
              title="Removes simulation alerts created by this tool"
            >
              <Trash2 className="w-4 h-4" />
              Clear simulations
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-xl text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

