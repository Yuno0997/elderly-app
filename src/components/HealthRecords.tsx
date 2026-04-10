import { useEffect, useMemo, useState } from 'react';
import { User } from '../App';
import { Activity, HeartPulse, Moon, TrendingUp } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFamilySelectedResidentId } from '../lib/family';
import { FamilyResidentSelector } from './FamilyResidentSelector';
import { cn } from './ui/utils';

interface HealthRecordsProps {
  user: User;
}

export function HealthRecords({ user }: HealthRecordsProps) {
  const isRelative = user.role === 'relative';
  const selectedResidentId = isRelative ? getFamilySelectedResidentId(user.id) : (user.residentId || '');
  const [rows, setRows] = useState<Array<{ id: number; name: string; room: string; status?: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isRelative) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/family/residents');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRelative]);

  const selectedRow = useMemo(() => {
    const m = /^RES-(\d+)$/i.exec(String(selectedResidentId).trim());
    const dbId = m ? Number(m[1]) - 1000 : NaN;
    return rows.find((r) => Number(r.id) === dbId) || null;
  }, [rows, selectedResidentId]);

  return (
    <div className="p-4 md:p-6 max-w-6xl space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Health Records</h1>
            <p className="text-sm text-slate-500">Summary and trends for the selected resident.</p>
          </div>
          {isRelative && (
            <div className="w-full max-w-md">
              <FamilyResidentSelector user={user} />
            </div>
          )}
        </div>
      </div>

      {!selectedResidentId ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <Activity className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Select a resident</h2>
          <p className="text-sm text-slate-500">Choose a resident from the dropdown to view health summaries.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm text-slate-500">Selected resident</div>
                <div className="mt-1 text-lg font-semibold text-slate-900 truncate">
                  {selectedRow?.name || selectedResidentId}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {selectedRow ? `Room ${selectedRow.room}` : 'Room —'} · {selectedResidentId}
                </div>
              </div>
              <span className={cn(
                'px-2 py-1 rounded-full text-xs font-medium',
                selectedRow?.status === 'needs_attention' ? 'bg-yellow-100 text-yellow-800'
                  : selectedRow?.status === 'offline' ? 'bg-slate-200 text-slate-700'
                    : 'bg-green-100 text-green-700'
              )}>
                {selectedRow?.status ? String(selectedRow.status).replace(/_/g, ' ') : 'unknown'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <HeartPulse className="w-4 h-4" /> Heart rate (avg)
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">—</div>
                <div className="text-xs text-slate-500 mt-1">Last 24 hours</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Moon className="w-4 h-4" /> Sleep quality
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">—</div>
                <div className="text-xs text-slate-500 mt-1">Last night</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <TrendingUp className="w-4 h-4" /> Trend
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">—</div>
                <div className="text-xs text-slate-500 mt-1">7-day overview</div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">Trends</div>
              <div className="text-sm text-slate-500 mt-1">
                Trend charts will appear here once device monitoring data is stored per resident.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="text-sm font-semibold text-slate-900">Notes</div>
            <div className="text-sm text-slate-500 mt-2">
              {loading ? 'Loading resident list…' : 'No clinician notes available yet.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
