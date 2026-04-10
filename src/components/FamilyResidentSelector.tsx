import { useEffect, useMemo, useState } from 'react';
import { User } from '../App';
import { apiFetch } from '../lib/api';
import { getFamilySelectedResidentId, setFamilySelectedResidentId } from '../lib/family';
import { cn } from './ui/utils';

type FamilyResidentRow = {
  id: number;
  name: string;
  room: string;
  status?: string;
  profile_photo?: string | null;
};

function linkedResidentIds(user: User): string[] {
  const ids = Array.isArray((user as any).residentIds) ? (user as any).residentIds : (user.residentId ? [user.residentId] : []);
  return (ids || []).map((s: any) => String(s).trim()).filter(Boolean);
}

export function FamilyResidentSelector({
  user,
  className,
  onChange,
}: {
  user: User;
  className?: string;
  onChange?: (residentId: string) => void;
}) {
  const linked = useMemo(() => linkedResidentIds(user), [user.id, (user as any).residentIds, user.residentId]);
  const [rows, setRows] = useState<FamilyResidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState<string>(() => getFamilySelectedResidentId(user.id));
  const validOptions = useMemo(() => {
    return linked
      .map((rid) => {
        const m = /^RES-(\d+)$/i.exec(String(rid).trim());
        const dbId = m ? Number(m[1]) - 1000 : NaN;
        const match = rows.find((r) => Number(r.id) === dbId);
        if (!match) return null;
        return {
          rid,
          label: `${match.name} (Room ${match.room}) · ${rid}`,
        };
      })
      .filter(Boolean) as Array<{ rid: string; label: string }>;
  }, [linked, rows]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/family/residents');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
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
  }, []);

  useEffect(() => {
    if (!validOptions.length) return;
    const allowed = validOptions.map((o) => o.rid);
    const current = selectedResidentId && allowed.includes(selectedResidentId) ? selectedResidentId : '';
    const next = current || allowed[0];
    if (next !== selectedResidentId) {
      setSelectedResidentId(next);
      setFamilySelectedResidentId(user.id, next);
      onChange?.(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validOptions.map((o) => o.rid).join('|')]);

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="text-sm text-slate-600">Select resident</div>
      <select
        value={selectedResidentId}
        onChange={(e) => {
          const v = e.target.value;
          setSelectedResidentId(v);
          setFamilySelectedResidentId(user.id, v);
          onChange?.(v);
        }}
        disabled={!validOptions.length || loading}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-50"
      >
        {validOptions.length === 0 && <option value="">No linked residents</option>}
        {validOptions.map((opt) => (
          <option key={opt.rid} value={opt.rid}>
            {opt.label}
          </option>
        ))}
      </select>
      {loading && <div className="text-xs text-slate-400">Loading residents…</div>}
    </div>
  );
}

