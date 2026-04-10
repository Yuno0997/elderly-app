import { useEffect, useMemo, useState } from 'react';
import { User } from '../App';
import { CheckCircle2, Clock3, Pill, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFamilySelectedResidentId } from '../lib/family';
import { formatPHDateTime } from '../lib/time';
import { FamilyResidentSelector } from './FamilyResidentSelector';

interface MedicationLogProps {
  user: User;
}

type ResidentOption = {
  id: number;
  name: string;
  room: string;
};

export function MedicationLog({ user }: MedicationLogProps) {
  const [medications, setMedications] = useState<any[]>([]);
  const [residentOptions, setResidentOptions] = useState<ResidentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [residentId, setResidentId] = useState('');
  const [medication, setMedication] = useState('');
  const [scheduleType, setScheduleType] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [scheduleClock, setScheduleClock] = useState('08:00');
  const [customDateTime, setCustomDateTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sortBy, setSortBy] = useState<'recent' | 'resident_az' | 'resident_za' | 'status' | 'medication_az'>('recent');
  const canManage = user.role === 'admin' || user.role === 'caregiver';
  const selectedResidentId = user.role === 'relative' ? getFamilySelectedResidentId(user.id) : '';

  const sortedMedications = useMemo(() => {
    const list = [...medications];
    if (sortBy === 'resident_az') {
      list.sort((a, b) => String(a.resident || '').localeCompare(String(b.resident || '')));
      return list;
    }
    if (sortBy === 'resident_za') {
      list.sort((a, b) => String(b.resident || '').localeCompare(String(a.resident || '')));
      return list;
    }
    if (sortBy === 'status') {
      list.sort((a, b) => {
        const sa = a.given ? 1 : 0;
        const sb = b.given ? 1 : 0;
        if (sa !== sb) return sa - sb; // Pending first
        return String(a.resident || '').localeCompare(String(b.resident || ''));
      });
      return list;
    }
    if (sortBy === 'medication_az') {
      list.sort((a, b) => String(a.medication || '').localeCompare(String(b.medication || '')));
      return list;
    }
    // recent (default): latest event/update first, fallback to id
    list.sort((a, b) => {
      const ta = new Date(a.lastEventAt || 0).getTime();
      const tb = new Date(b.lastEventAt || 0).getTime();
      if (tb !== ta) return tb - ta;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
    return list;
  }, [medications, sortBy]);
  const hasCompletedLogs = useMemo(() => medications.some((m) => Boolean(m.given)), [medications]);

  const load = async () => {
    try {
      setLoading(true);
      const res = user.role === 'relative'
        ? await apiFetch(`/api/family/medications?residentId=${encodeURIComponent(selectedResidentId || user.residentId || '')}`)
        : await apiFetch('/api/medications');
      if (!res.ok) return;
      const data = await res.json();
      setMedications(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user.role, user.id, user.residentId, selectedResidentId]);

  useEffect(() => {
    if (!canManage) return;
    let stopped = false;
    (async () => {
      try {
        const res = await apiFetch('/api/residents');
        if (!res.ok) return;
        const rows = await res.json();
        if (stopped) return;
        const list = Array.isArray(rows)
          ? rows.map((r: any) => ({
              id: Number(r.id),
              name: String(r.name || ''),
              room: String(r.room || ''),
            }))
          : [];
        setResidentOptions(list);
        setResidentId((prev) => (prev ? prev : String(list[0]?.id || '')));
      } catch {
        // ignore
      }
    })();
    return () => {
      stopped = true;
    };
  }, [canManage, user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'relative') return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      await load();
    };
    const iv = setInterval(() => {
      void tick();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user.role, user.id, user.residentId, selectedResidentId]);

  const toggleGiven = async (id: string, next: boolean) => {
    const res = await apiFetch(`/api/medications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ given: next }),
    });
    if (!res.ok) return;
    setMedications((prev) => prev.map((m) => (m.id === id ? { ...m, given: next } : m)));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatClock = (clock: string) => {
      const m = /^(\d{2}):(\d{2})$/.exec(clock);
      if (!m) return clock;
      const hh = Number(m[1]);
      const mm = m[2];
      const suffix = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh % 12 || 12;
      return `${h12}:${mm} ${suffix}`;
    };
    let time = '';
    if (scheduleType === 'custom') {
      if (!customDateTime.trim()) return;
      time = formatPHDateTime(new Date(customDateTime), {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } else {
      time = `${scheduleType === 'today' ? 'Today' : 'Tomorrow'}, ${formatClock(scheduleClock)}`;
    }
    if (!residentId.trim() || !medication.trim() || !time.trim()) return;
    try {
      setSubmitting(true);
      const res = await apiFetch('/api/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId: Number(residentId), medication: medication.trim(), time: time.trim() }),
      });
      if (!res.ok) return;
      const created = await res.json();
      setMedications((prev) => [created, ...prev]);
      setResidentId((prev) => prev || String(residentOptions[0]?.id || ''));
      setMedication('');
      setScheduleType('today');
      setScheduleClock('08:00');
      setCustomDateTime('');
    } finally {
      setSubmitting(false);
    }
  };

  const clearMedicationLogs = async () => {
    const res = await apiFetch('/api/medications/logs', { method: 'DELETE' });
    if (!res.ok) return;
    setMedications((prev) => prev.filter((m) => !m.given));
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Medication Log</h1>
        <p className="text-sm text-slate-500">Live medication schedule and administration tracking.</p>
        {user.role === 'relative' && (
          <div className="mt-4">
            <FamilyResidentSelector user={user} />
          </div>
        )}
      </div>

      {canManage && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-500" />
            Add Medication Schedule
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select resident</option>
              {residentOptions.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name} (Room {r.room})
                </option>
              ))}
            </select>
            <input
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              placeholder="Medication"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <select
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as 'today' | 'tomorrow' | 'custom')}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="custom">Custom</option>
            </select>
            {scheduleType === 'custom' ? (
              <input
                type="datetime-local"
                value={customDateTime}
                onChange={(e) => setCustomDateTime(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            ) : (
              <input
                type="time"
                value={scheduleClock}
                onChange={(e) => setScheduleClock(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? 'Adding...' : 'Add Medication'}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="text-sm font-semibold text-slate-900">Medication Entries</div>
          <div className="flex items-center gap-2">
            {canManage && hasCompletedLogs && (
              <button
                type="button"
                onClick={() => {
                  void clearMedicationLogs();
                }}
                className="px-2.5 py-1.5 border border-red-200 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100"
              >
                Clear logs
              </button>
            )}
            <label className="text-xs text-slate-500">Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
            >
              <option value="recent">Latest update</option>
              <option value="status">Status (Pending first)</option>
              <option value="resident_az">Resident (A-Z)</option>
              <option value="resident_za">Resident (Z-A)</option>
              <option value="medication_az">Medication (A-Z)</option>
            </select>
          </div>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading medications...</p>
        ) : medications.length === 0 ? (
          <div className="text-center py-8">
            <Pill className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No medication schedules yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMedications.map((m) => (
              <div key={m.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900">{m.resident}</div>
                  <div className="text-xs text-slate-500">{m.medication} · {m.time}</div>
                  {m.lastEventAt && (
                    <div className="text-[11px] text-slate-400 mt-1">
                      {String(m.lastEventAction || 'updated').toUpperCase()} · {formatPHDateTime(m.lastEventAt)}
                      {m.lastEventActor ? ` · by ${m.lastEventActor}` : ''}
                    </div>
                  )}
                </div>
                {canManage ? (
                  <button
                    onClick={() => toggleGiven(m.id, !m.given)}
                    className={`min-w-24 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border shadow-sm transition-all active:scale-[0.98] ${
                      m.given
                        ? 'bg-green-600 text-white border-green-700 hover:bg-green-700'
                        : 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                    }`}
                  >
                    {m.given ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                    {m.given ? 'Given' : 'Pending'}
                  </button>
                ) : (
                  <span className={`min-w-24 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border ${
                    m.given
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {m.given ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                    {m.given ? 'Given' : 'Pending'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
