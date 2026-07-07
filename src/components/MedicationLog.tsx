import { useEffect, useMemo, useRef, useState } from 'react';
import { User } from '../App';
import { CheckCircle2, Clock3, LayoutGrid, Pill, Plus, Search, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { getFamilySelectedResidentId } from '../lib/family';
import { formatPHDateTime } from '../lib/time';
import { FamilyResidentSelector } from './FamilyResidentSelector';

// ── Verified elderly medication suggestions ──────────────────────────────────
const ELDERLY_MEDICATIONS: { name: string; category: string }[] = [
  // Cardiovascular
  { name: 'Amlodipine 5mg', category: 'Cardiovascular' },
  { name: 'Amlodipine 10mg', category: 'Cardiovascular' },
  { name: 'Atenolol 25mg', category: 'Cardiovascular' },
  { name: 'Atenolol 50mg', category: 'Cardiovascular' },
  { name: 'Carvedilol 6.25mg', category: 'Cardiovascular' },
  { name: 'Carvedilol 12.5mg', category: 'Cardiovascular' },
  { name: 'Lisinopril 5mg', category: 'Cardiovascular' },
  { name: 'Lisinopril 10mg', category: 'Cardiovascular' },
  { name: 'Losartan 50mg', category: 'Cardiovascular' },
  { name: 'Losartan 100mg', category: 'Cardiovascular' },
  { name: 'Furosemide 20mg', category: 'Cardiovascular' },
  { name: 'Furosemide 40mg', category: 'Cardiovascular' },
  { name: 'Digoxin 0.125mg', category: 'Cardiovascular' },
  { name: 'Digoxin 0.25mg', category: 'Cardiovascular' },
  { name: 'Spironolactone 25mg', category: 'Cardiovascular' },
  { name: 'Isosorbide Mononitrate 30mg', category: 'Cardiovascular' },
  { name: 'Bisoprolol 5mg', category: 'Cardiovascular' },
  { name: 'Metoprolol 25mg', category: 'Cardiovascular' },
  { name: 'Metoprolol 50mg', category: 'Cardiovascular' },
  // Blood Thinners
  { name: 'Aspirin 81mg', category: 'Blood Thinner' },
  { name: 'Clopidogrel 75mg', category: 'Blood Thinner' },
  { name: 'Warfarin 2mg', category: 'Blood Thinner' },
  { name: 'Warfarin 5mg', category: 'Blood Thinner' },
  { name: 'Rivaroxaban 10mg', category: 'Blood Thinner' },
  { name: 'Rivaroxaban 20mg', category: 'Blood Thinner' },
  { name: 'Apixaban 2.5mg', category: 'Blood Thinner' },
  { name: 'Apixaban 5mg', category: 'Blood Thinner' },
  // Diabetes
  { name: 'Metformin 500mg', category: 'Diabetes' },
  { name: 'Metformin 850mg', category: 'Diabetes' },
  { name: 'Metformin 1000mg', category: 'Diabetes' },
  { name: 'Glimepiride 1mg', category: 'Diabetes' },
  { name: 'Glimepiride 2mg', category: 'Diabetes' },
  { name: 'Glipizide 5mg', category: 'Diabetes' },
  { name: 'Sitagliptin 100mg', category: 'Diabetes' },
  { name: 'Insulin Glargine (Lantus)', category: 'Diabetes' },
  { name: 'Insulin Regular', category: 'Diabetes' },
  // Cholesterol
  { name: 'Atorvastatin 10mg', category: 'Cholesterol' },
  { name: 'Atorvastatin 20mg', category: 'Cholesterol' },
  { name: 'Atorvastatin 40mg', category: 'Cholesterol' },
  { name: 'Simvastatin 20mg', category: 'Cholesterol' },
  { name: 'Simvastatin 40mg', category: 'Cholesterol' },
  { name: 'Rosuvastatin 10mg', category: 'Cholesterol' },
  { name: 'Rosuvastatin 20mg', category: 'Cholesterol' },
  // Pain / Anti-inflammatory
  { name: 'Paracetamol 500mg', category: 'Pain Relief' },
  { name: 'Paracetamol 650mg', category: 'Pain Relief' },
  { name: 'Tramadol 50mg', category: 'Pain Relief' },
  { name: 'Celecoxib 100mg', category: 'Pain Relief' },
  { name: 'Celecoxib 200mg', category: 'Pain Relief' },
  { name: 'Pregabalin 75mg', category: 'Pain Relief' },
  { name: 'Pregabalin 150mg', category: 'Pain Relief' },
  // Vitamins & Supplements
  { name: 'Calcium Carbonate 500mg', category: 'Supplement' },
  { name: 'Calcium + Vitamin D3', category: 'Supplement' },
  { name: 'Vitamin D3 1000IU', category: 'Supplement' },
  { name: 'Vitamin B12 500mcg', category: 'Supplement' },
  { name: 'Ferrous Sulfate 325mg', category: 'Supplement' },
  { name: 'Folic Acid 5mg', category: 'Supplement' },
  { name: 'Multivitamins', category: 'Supplement' },
  // Respiratory
  { name: 'Salbutamol 2mg', category: 'Respiratory' },
  { name: 'Salbutamol Inhaler', category: 'Respiratory' },
  { name: 'Tiotropium Inhaler', category: 'Respiratory' },
  { name: 'Budesonide Inhaler', category: 'Respiratory' },
  { name: 'Montelukast 10mg', category: 'Respiratory' },
  // Neurological / Mental Health
  { name: 'Donepezil 5mg', category: 'Neurological' },
  { name: 'Donepezil 10mg', category: 'Neurological' },
  { name: 'Memantine 10mg', category: 'Neurological' },
  { name: 'Sertraline 50mg', category: 'Neurological' },
  { name: 'Citalopram 20mg', category: 'Neurological' },
  { name: 'Lorazepam 0.5mg', category: 'Neurological' },
  { name: 'Quetiapine 25mg', category: 'Neurological' },
  { name: 'Levodopa/Carbidopa 100/25mg', category: 'Neurological' },
  // Bone Health
  { name: 'Alendronate 70mg', category: 'Bone Health' },
  { name: 'Risendronate 35mg', category: 'Bone Health' },
  // GI / Digestion
  { name: 'Omeprazole 20mg', category: 'Gastrointestinal' },
  { name: 'Omeprazole 40mg', category: 'Gastrointestinal' },
  { name: 'Pantoprazole 40mg', category: 'Gastrointestinal' },
  { name: 'Ranitidine 150mg', category: 'Gastrointestinal' },
  { name: 'Lactulose Syrup', category: 'Gastrointestinal' },
  { name: 'Domperidone 10mg', category: 'Gastrointestinal' },
  { name: 'Loperamide 2mg', category: 'Gastrointestinal' },
  // Thyroid
  { name: 'Levothyroxine 25mcg', category: 'Thyroid' },
  { name: 'Levothyroxine 50mcg', category: 'Thyroid' },
  { name: 'Levothyroxine 75mcg', category: 'Thyroid' },
  { name: 'Levothyroxine 100mcg', category: 'Thyroid' },
];

const QUICK_PICKS = [
  'Paracetamol 500mg',
  'Aspirin 81mg',
  'Amlodipine 5mg',
  'Metformin 500mg',
  'Atorvastatin 20mg',
  'Omeprazole 20mg',
  'Calcium + Vitamin D3',
  'Vitamin B12 500mcg',
  'Losartan 50mg',
  'Furosemide 40mg',
];

const CATEGORY_COLORS: Record<string, string> = {
  Cardiovascular:    'bg-rose-50 text-rose-700 border-rose-200',
  'Blood Thinner':   'bg-red-50 text-red-700 border-red-200',
  Diabetes:          'bg-amber-50 text-amber-700 border-amber-200',
  Cholesterol:       'bg-orange-50 text-orange-700 border-orange-200',
  'Pain Relief':     'bg-blue-50 text-blue-700 border-blue-200',
  Supplement:        'bg-green-50 text-green-700 border-green-200',
  Respiratory:       'bg-cyan-50 text-cyan-700 border-cyan-200',
  Neurological:      'bg-purple-50 text-purple-700 border-purple-200',
  'Bone Health':     'bg-indigo-50 text-indigo-700 border-indigo-200',
  Gastrointestinal:  'bg-teal-50 text-teal-700 border-teal-200',
  Thyroid:           'bg-pink-50 text-pink-700 border-pink-200',
};

const CATEGORY_ACTIVE_COLORS: Record<string, string> = {
  Cardiovascular:    'bg-rose-600 text-white border-rose-600',
  'Blood Thinner':   'bg-red-600 text-white border-red-600',
  Diabetes:          'bg-amber-500 text-white border-amber-500',
  Cholesterol:       'bg-orange-500 text-white border-orange-500',
  'Pain Relief':     'bg-blue-600 text-white border-blue-600',
  Supplement:        'bg-green-600 text-white border-green-600',
  Respiratory:       'bg-cyan-600 text-white border-cyan-600',
  Neurological:      'bg-purple-600 text-white border-purple-600',
  'Bone Health':     'bg-indigo-600 text-white border-indigo-600',
  Gastrointestinal:  'bg-teal-600 text-white border-teal-600',
  Thyroid:           'bg-pink-600 text-white border-pink-600',
};

const ALL_CATEGORIES = ['All', ...Array.from(new Set(ELDERLY_MEDICATIONS.map((m) => m.category)))];

interface MedicationLogProps {
  user: User;
}

type ResidentOption = {
  id: number;
  name: string;
  room: string;
};

type SelectionMode = 'autocomplete' | 'multiple-choice';

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

  // ── Multiple-choice mode state ──
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('autocomplete');
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [mcSearch, setMcSearch] = useState('');

  const canManage = user.role === 'admin' || user.role === 'caregiver';
  const selectedResidentId = user.role === 'relative' ? getFamilySelectedResidentId(user.id) : '';

  // ── Filtered list for multiple-choice panel ──
  const mcFiltered = useMemo(() => {
    let list = ELDERLY_MEDICATIONS;
    if (categoryFilter !== 'All') {
      list = list.filter((m) => m.category === categoryFilter);
    }
    if (mcSearch.trim()) {
      const q = mcSearch.trim().toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [categoryFilter, mcSearch]);

  // ── Group filtered list by category for rendering ──
  const mcGroups = useMemo(() => {
    const groups: Record<string, typeof ELDERLY_MEDICATIONS> = {};
    mcFiltered.forEach((m) => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    });
    return Object.entries(groups);
  }, [mcFiltered]);

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
        if (sa !== sb) return sa - sb;
        return String(a.resident || '').localeCompare(String(b.resident || ''));
      });
      return list;
    }
    if (sortBy === 'medication_az') {
      list.sort((a, b) => String(a.medication || '').localeCompare(String(b.medication || '')));
      return list;
    }
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

  // ── Build time string shared between both modes ──
  const buildTimeString = (): string | null => {
    const formatClock = (clock: string) => {
      const m = /^(\d{2}):(\d{2})$/.exec(clock);
      if (!m) return clock;
      const hh = Number(m[1]);
      const mm = m[2];
      const suffix = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh % 12 || 12;
      return `${h12}:${mm} ${suffix}`;
    };
    if (scheduleType === 'custom') {
      if (!customDateTime.trim()) return null;
      return formatPHDateTime(new Date(customDateTime), {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return `${scheduleType === 'today' ? 'Today' : 'Tomorrow'}, ${formatClock(scheduleClock)}`;
  };

  // ── Single-medication submit (autocomplete mode) ──
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const time = buildTimeString();
    if (!residentId.trim() || !medication.trim() || !time) return;
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

  // ── Multi-medication submit (multiple-choice mode) ──
  const handleAddMultiple = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMedications.length === 0 || !residentId.trim()) return;
    const time = buildTimeString();
    if (!time) return;
    try {
      setSubmitting(true);
      const results = await Promise.all(
        selectedMedications.map((med) =>
          apiFetch('/api/medications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ residentId: Number(residentId), medication: med, time: time.trim() }),
          }).then((r) => (r.ok ? r.json() : null))
        )
      );
      const created = results.filter(Boolean);
      setMedications((prev) => [...created.reverse(), ...prev]);
      setSelectedMedications([]);
      setMcSearch('');
      setCategoryFilter('All');
      setScheduleType('today');
      setScheduleClock('08:00');
      setCustomDateTime('');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMed = (name: string) => {
    setSelectedMedications((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const clearMedicationLogs = async () => {
    const res = await apiFetch('/api/medications/logs', { method: 'DELETE' });
    if (!res.ok) return;
    setMedications((prev) => prev.filter((m) => !m.given));
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
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
        <form
          onSubmit={selectionMode === 'multiple-choice' ? handleAddMultiple : handleAdd}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5"
        >
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-500" />
            Add Medication Schedule
          </h2>

          {/* ── Mode toggle tabs ── */}
          <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-lg w-fit">
            <button
              type="button"
              id="med-mode-autocomplete"
              onClick={() => setSelectionMode('autocomplete')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectionMode === 'autocomplete'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Search / Type Custom
            </button>
            <button
              type="button"
              id="med-mode-multiple-choice"
              onClick={() => setSelectionMode('multiple-choice')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectionMode === 'multiple-choice'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Select Verified (Multiple)
            </button>
          </div>

          {/* ── Shared top row: resident + schedule ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
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

          {/* ─────────────────────────────────────────────────────────────────
              MODE A: Autocomplete / search
          ───────────────────────────────────────────────────────────────── */}
          {selectionMode === 'autocomplete' && (
            <>
              <div className="relative mb-4" id="medication-autocomplete-wrapper">
                <MedicationAutocomplete value={medication} onChange={setMedication} />
              </div>

              {/* Quick-pick chips */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-slate-500">Quick pick common medications</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PICKS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setMedication(name)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:shadow-sm active:scale-95 ${
                        medication === name
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                      }`}
                    >
                      <Pill className="w-3 h-3" />
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !medication.trim() || !residentId.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Adding...' : 'Add Medication'}
              </button>
            </>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              MODE B: Multiple-choice verified medications
          ───────────────────────────────────────────────────────────────── */}
          {selectionMode === 'multiple-choice' && (
            <div className="space-y-4">
              {/* Selected medications summary */}
              {Array.isArray(selectedMedications) && selectedMedications.length > 0 && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 box-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {selectedMedications.length} medication{selectedMedications.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedMedications([])}
                      className="text-xs text-blue-500 hover:text-blue-700 hover:underline font-medium"
                    >
                      Clear all
                    </button>
                  </div>
                  {/* Tags area: capped height + scroll so it never expands the page */}
                  <div
                    className="flex flex-wrap gap-1.5"
                    style={{ maxHeight: '96px', overflowY: 'auto', boxSizing: 'border-box' }}
                  >
                    {selectedMedications.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-blue-600 text-white rounded-full text-xs font-medium shadow-sm flex-shrink-0"
                      >
                        <Pill className="w-3 h-3 opacity-80 flex-shrink-0" />
                        <span className="max-w-[140px] truncate">{name}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleMed(name); }}
                          className="ml-0.5 rounded-full hover:bg-blue-500 p-0.5 transition-colors flex-shrink-0"
                          aria-label={`Remove ${name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={mcSearch}
                  onChange={(e) => setMcSearch(e.target.value)}
                  placeholder="Search verified medications..."
                  className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoComplete="off"
                />
                {mcSearch && (
                  <button
                    type="button"
                    onClick={() => setMcSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category filter chips */}
              <div className="flex flex-wrap gap-1.5">
                {ALL_CATEGORIES.map((cat) => {
                  const isActive = categoryFilter === cat;
                  const colorClass = cat === 'All'
                    ? isActive
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-100'
                    : isActive
                      ? (CATEGORY_ACTIVE_COLORS[cat] || 'bg-blue-600 text-white border-blue-600')
                      : `${CATEGORY_COLORS[cat] || 'bg-slate-50 text-slate-600 border-slate-200'} hover:opacity-80`;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all active:scale-95 ${colorClass}`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Medication checkbox list — fixed height, scrolls internally, no page overflow */}
              <div
                className="border border-slate-200 rounded-xl"
                style={{ maxHeight: '320px', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}
              >
                {!Array.isArray(mcGroups) || mcGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                    <Pill className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No medications match your search.</p>
                  </div>
                ) : (
                  mcGroups.map(([cat, meds]) => {
                    if (!Array.isArray(meds) || meds.length === 0) return null;
                    const catNames = meds.map((m) => m.name);
                    const allInCatSelected = catNames.length > 0 && catNames.every((n) => selectedMedications.includes(n));
                    return (
                      <div key={cat}>
                        {/* Category header — NOT sticky (sticky inside overflow:auto causes height-leak bugs) */}
                        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              CATEGORY_COLORS[cat] || 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {cat}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">{meds.length} medication{meds.length !== 1 ? 's' : ''}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              if (allInCatSelected) {
                                setSelectedMedications((prev) =>
                                  Array.isArray(prev) ? prev.filter((n) => !catNames.includes(n)) : []
                                );
                              } else {
                                setSelectedMedications((prev) => {
                                  const safe = Array.isArray(prev) ? prev : [];
                                  return [...safe, ...catNames.filter((n) => !safe.includes(n))];
                                });
                              }
                            }}
                            className="ml-auto text-[10px] font-semibold text-blue-500 hover:text-blue-700 hover:underline"
                          >
                            {allInCatSelected ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>

                        {/* Medication rows — onClick only, no htmlFor+hidden-input to avoid double-toggle */}
                        <div className="divide-y divide-slate-100">
                          {meds.map((m) => {
                            if (!m || !m.name) return null;
                            const checked = Array.isArray(selectedMedications) && selectedMedications.includes(m.name);
                            return (
                              <div
                                key={m.name}
                                role="checkbox"
                                aria-checked={checked}
                                tabIndex={0}
                                onClick={() => toggleMed(m.name)}
                                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleMed(m.name); } }}
                                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors select-none ${
                                  checked ? 'bg-blue-50' : 'hover:bg-slate-50'
                                }`}
                              >
                                {/* Custom visual checkbox */}
                                <div
                                  className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all pointer-events-none ${
                                    checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                                  }`}
                                >
                                  {checked && (
                                    <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2">
                                      <path
                                        d="M1 4l3 3 5-6"
                                        stroke="white"
                                        strokeWidth="1.6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <Pill className={`w-3.5 h-3.5 flex-shrink-0 pointer-events-none ${
                                  checked ? 'text-blue-500' : 'text-slate-400'
                                }`} />
                                <span className={`text-sm flex-1 truncate pointer-events-none ${
                                  checked ? 'text-blue-700 font-medium' : 'text-slate-800'
                                }`}>
                                  {m.name}
                                </span>
                                {checked && (
                                  <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0 pointer-events-none" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={submitting || selectedMedications.length === 0 || !residentId.trim()}
                className="w-full sm:w-auto px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scheduling {selectedMedications.length} medication{selectedMedications.length > 1 ? 's' : ''}...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    {selectedMedications.length === 0
                      ? 'Select medications above'
                      : `Schedule ${selectedMedications.length} medication${selectedMedications.length > 1 ? 's' : ''}`}
                  </>
                )}
              </button>
            </div>
          )}
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

// ── Medication Autocomplete Component ────────────────────────────────────────
function MedicationAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return ELDERLY_MEDICATIONS.slice(0, 20);
    return ELDERLY_MEDICATIONS.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative flex items-center">
        <Pill className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search or type medication..."
          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(true); }}
            className="absolute right-2.5 p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
             style={{ maxHeight: '280px', overflowY: 'auto' }}>
          {/* Group by category */}
          {(() => {
            const groups: Record<string, typeof ELDERLY_MEDICATIONS> = {};
            filtered.forEach((m) => {
              if (!groups[m.category]) groups[m.category] = [];
              groups[m.category].push(m);
            });
            return Object.entries(groups).map(([cat, meds]) => (
              <div key={cat}>
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                    CATEGORY_COLORS[cat] || 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {cat}
                  </span>
                </div>
                {meds.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(m.name);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between gap-3 transition-colors ${
                      value === m.name ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Pill className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
                      {m.name}
                    </span>
                    {value === m.name && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
