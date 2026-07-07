import { useEffect, useMemo, useState } from 'react';
import { User } from '../App';
import { Activity, HeartPulse, Moon, TrendingUp, User as UserIcon, Phone } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFamilySelectedResidentId } from '../lib/family';
import { FamilyResidentSelector } from './FamilyResidentSelector';
import { cn } from './ui/utils';

interface HealthRecordsProps {
  user: User;
}

interface ResidentInfo {
  id: number;
  name: string;
  room: string;
  status?: string;
  profile_photo?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  condition?: string | null;
  caregiver_name?: string | null;
  caregiver_photo?: string | null;
  caregiver_email?: string | null;
  caregiver_phone?: string | null;
}

export function HealthRecords({ user }: HealthRecordsProps) {
  const isRelative = user.role === 'relative';
  const selectedResidentId = isRelative ? getFamilySelectedResidentId(user.id) : (user.residentId || '');
  const [rows, setRows] = useState<Array<{ id: number; name: string; room: string; status?: string }>>([]);
  const [residentInfo, setResidentInfo] = useState<ResidentInfo | null>(null);
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
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRelative]);

  // Fetch detailed resident + caregiver info when a resident is selected
  useEffect(() => {
    if (!isRelative || !selectedResidentId) { setResidentInfo(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`/api/family/resident-info?residentId=${encodeURIComponent(selectedResidentId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setResidentInfo(data ?? null);
      } catch { /* ignore */ }
    };
    void load();
    return () => { cancelled = true; };
  }, [isRelative, selectedResidentId]);

  const selectedRow = useMemo(() => {
    const m = /^RES-(\d+)$/i.exec(String(selectedResidentId).trim());
    const dbId = m ? Number(m[1]) - 1000 : NaN;
    return rows.find((r) => Number(r.id) === dbId) || null;
  }, [rows, selectedResidentId]);

  const info = residentInfo;

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-full">
      {/* Header */}
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
          {/* ── Left: Health Data ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Vitals Summary */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
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
                  'px-2 py-1 rounded-full text-xs font-medium flex-shrink-0',
                  selectedRow?.status === 'needs_attention' ? 'bg-yellow-100 text-yellow-800'
                    : selectedRow?.status === 'offline' ? 'bg-slate-200 text-slate-700'
                      : 'bg-green-100 text-green-700'
                )}>
                  {selectedRow?.status ? String(selectedRow.status).replace(/_/g, ' ') : 'unknown'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          </div>

          {/* ── Right: Personal Info + Caregiver ── */}
          <div className="space-y-4">
            {/* Elder Personal Information */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Elder Information</div>

              {/* Profile Photo */}
              <div className="flex flex-col items-center mb-4">
                <div className="w-20 h-20 rounded-full bg-slate-200 overflow-hidden border-2 border-slate-100 shadow">
                  {info?.profile_photo ? (
                    <img src={info.profile_photo} alt={info.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-500">
                      {(info?.name || selectedRow?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="mt-2 text-base font-semibold text-slate-900 text-center">
                  {info?.name || selectedRow?.name || '—'}
                </div>
                <span className={cn(
                  'mt-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  (info?.status || selectedRow?.status) === 'needs_attention' ? 'bg-yellow-100 text-yellow-800'
                    : (info?.status || selectedRow?.status) === 'offline' ? 'bg-slate-200 text-slate-700'
                      : 'bg-green-100 text-green-700'
                )}>
                  {((info?.status || selectedRow?.status) ?? 'unknown').replace(/_/g, ' ')}
                </span>
              </div>

              {/* Personal Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Room</span>
                  <span className="font-medium text-slate-900">{info?.room || selectedRow?.room || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Resident ID</span>
                  <span className="font-medium text-slate-900">{selectedResidentId}</span>
                </div>
                {info?.gender && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gender</span>
                    <span className="font-medium text-slate-900">{info.gender}</span>
                  </div>
                )}
                {info?.date_of_birth && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date of Birth</span>
                    <span className="font-medium text-slate-900">
                      {new Date(info.date_of_birth).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {info?.condition && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Condition</span>
                    <span className="font-medium text-slate-900 text-right max-w-[60%]">{info.condition}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Caregiver */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900 mb-4">Assigned Caregiver</div>

              {loading ? (
                <div className="text-sm text-slate-400">Loading...</div>
              ) : info?.caregiver_name ? (
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border border-slate-100">
                    {info.caregiver_photo ? (
                      <img src={info.caregiver_photo} alt={info.caregiver_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-500">
                        {info.caregiver_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 text-sm">{info.caregiver_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Assigned Caregiver</div>
                    {info.caregiver_email && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-600">
                        <UserIcon className="w-3 h-3" />
                        <span className="truncate">{info.caregiver_email}</span>
                      </div>
                    )}
                    {info.caregiver_phone && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-600">
                        <Phone className="w-3 h-3" />
                        <span>{info.caregiver_phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400 text-center py-4">
                  No caregiver assigned yet.
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-sm font-semibold text-slate-900">Notes</div>
              <div className="text-sm text-slate-500 mt-2">
                {loading ? 'Loading…' : 'No clinician notes available yet.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
