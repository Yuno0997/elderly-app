import { useEffect, useMemo, useState } from 'react';
import { User } from '../App';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFamilySelectedResidentId } from '../lib/family';
import { formatPHDateTime } from '../lib/time';
import { FamilyResidentSelector } from './FamilyResidentSelector';

interface IncidentHistoryProps {
  user: User;
}

export function IncidentHistory({ user }: IncidentHistoryProps) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'resolved' | 'open'>('all');
  const selectedResidentId = user.role === 'relative' ? getFamilySelectedResidentId(user.id) : '';

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = user.role === 'relative'
          ? await apiFetch(`/api/family/alerts?residentId=${encodeURIComponent(selectedResidentId || user.residentId || '')}`)
          : await apiFetch('/api/alerts');
        if (!res.ok) return;
        setIncidents(await res.json());
      } finally {
        setLoading(false);
      }
    };
    void load();
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

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return incidents;
    if (statusFilter === 'resolved') return incidents.filter((i) => i.status === 'resolved');
    return incidents.filter((i) => i.status !== 'resolved');
  }, [incidents, statusFilter]);

  return (
    <div className="p-4 md:p-6 min-h-full flex flex-col">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Incident History</h1>
            {user.role === 'relative' && (
              <div className="text-xs text-slate-500 mt-1">Selected: {selectedResidentId || user.residentId || '—'}</div>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        {user.role === 'relative' && (
          <div className="mb-4">
            <FamilyResidentSelector user={user} />
          </div>
        )}
        {loading ? (
          <p className="text-sm text-slate-500">Loading incidents...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No incidents found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((i) => (
              <div key={i.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  {i.resident_profile_photo ? (
                    <img src={i.resident_profile_photo} alt={i.resident || 'Resident'} className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold border border-slate-200">
                      {String(i.resident || 'R').trim().slice(0, 1).toUpperCase() || 'R'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{i.type}</div>
                    <div className="text-xs text-slate-500">
                      {i.resident} · Room {i.room} · {formatPHDateTime(i.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="text-xs mt-1">
                  <span className={`px-2 py-0.5 rounded ${
                    i.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {i.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
