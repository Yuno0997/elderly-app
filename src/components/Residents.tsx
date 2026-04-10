import React, { useEffect, useState } from 'react';
import { UserRole } from '../App';
import { Search, Plus, ArrowUpDown, X, Heart, Activity, Moon, Bell, Phone, User as UserIcon, Archive, Undo2, Pill, ClipboardList, FileText, Pencil, Save, PlusCircle, Trash2 } from 'lucide-react';
import { ResidentReport } from './ResidentReport';
import { apiFetch } from '../lib/api';
import { CropRotateModal } from './CropRotateModal';
import { ResidentWizardModal } from './ResidentWizardModal';
import { formatPHDate, formatPHDateTime } from '../lib/time';

interface ResidentsProps {
  userRole: UserRole;
}

type BackendResident = {
  id: number;
  name: string;
  room: string;
  date_of_birth?: string | null;
  gender?: string | null;
  status: string;
  medical_conditions?: string | null;
  allergies?: string | null;
  device_id?: string | null;
  medications?: string | null;
  contacts?: string | null;
  profile_photo?: string | null;
  profilePhoto?: string | null;
  caregiver_user_id?: string | null;
  caregiver_name?: string | null;
  archived?: number | boolean;
  created_at?: string | null;
};

function toBackendResidentId(residentId: string) {
  return Number(residentId.replace('res-', ''));
}

function getInitials(name: unknown) {
  const s = String(name || '').trim();
  if (!s) return '??';
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function safeToLocaleString(v: any) {
  try {
    if (!v) return '';
    if (v instanceof Date) return formatPHDateTime(v);
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return String(v);
    return formatPHDateTime(d);
  } catch {
    return '';
  }
}

function formatDateOnly(v: unknown) {
  if (!v) return '';
  const d = new Date(String(v));
  if (!Number.isFinite(d.getTime())) return String(v);
  return formatPHDate(d);
}

function computeAgeFromDob(dob: unknown) {
  if (!dob) return null;
  const d = new Date(String(dob));
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function parseMedicalConditions(raw?: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

function parseJsonArray(raw?: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

function parseContacts(raw?: string | null) {
  if (!raw) return null as any;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeResident(input: any) {
  const r = input ?? {};
  const name = typeof r.name === 'string' ? r.name : String(r.name ?? '');
  const room = typeof r.room === 'string' ? r.room : String(r.room ?? '');
  const gender = typeof r.gender === 'string' ? r.gender : String(r.gender ?? '');
  const residentId = typeof r.residentId === 'string' ? r.residentId : String(r.residentId ?? '');
  const meds = Array.isArray(r.medications) ? r.medications : [];
  const notes = Array.isArray(r.notes) ? r.notes : [];
  const recentEvents = Array.isArray(r.recentEvents) ? r.recentEvents : [];
  const medicalConditions = Array.isArray(r.medicalConditions) ? r.medicalConditions : [];
  const contacts = r.contacts && typeof r.contacts === 'object' ? r.contacts : {};
  const computedAge = computeAgeFromDob(r.dob);
  return {
    ...r,
    name,
    room,
    gender,
    residentId,
    dob: typeof r.dob === 'string' ? r.dob : '',
    age: computedAge ?? (Number.isFinite(r.age) ? r.age : null),
    medications: meds,
    notes,
    recentEvents,
    medicalConditions,
    allergies: typeof r.allergies === 'string' ? r.allergies : String(r.allergies ?? ''),
    contacts,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : String(r.deviceId ?? ''),
    colorIndex: Number.isFinite(r.colorIndex) ? r.colorIndex : 0,
  };
}

class ResidentProfileErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err || 'Unknown error') };
  }
  componentDidCatch(err: any) {
    // Intentionally noop; prevents a white screen for unexpected resident payloads.
    // eslint-disable-next-line no-console
    console.error('[ResidentProfile] render error', err);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">Something went wrong</div>
              <div className="text-sm text-slate-600 mt-1">
                The resident profile couldn’t be displayed due to unexpected data.
              </div>
            </div>
            <button type="button" onClick={this.props.onClose} className="p-2 rounded-lg hover:bg-slate-100">
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="mt-3 text-xs text-slate-500 break-words border border-slate-200 bg-slate-50 rounded-lg p-3">
            {this.state.message}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={this.props.onClose}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const AVATAR_COLORS = [
  'from-blue-400 to-blue-600',
  'from-teal-400 to-teal-600',
  'from-purple-400 to-purple-600',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-amber-600',
  'from-green-400 to-green-600',
  'from-indigo-400 to-indigo-600',
  'from-pink-400 to-pink-600',
];

export function Residents({ userRole }: ResidentsProps) {
  const [residents, setResidents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAZ, setSortAZ] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedResident, setSelectedResident] = useState<any>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [lastArchived, setLastArchived] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<any>(null);
  const [residentToRestore, setResidentToRestore] = useState<any>(null);
  const [residentToPermanentDelete, setResidentToPermanentDelete] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await apiFetch('/api/health');
        setBackendHealthy(res.ok);
      } catch (_e) {
        setBackendHealthy(false);
      }
    };

    const loadResidents = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const res = await apiFetch('/api/residents?includeArchived=true');
        if (!res.ok) {
          throw new Error('Failed to fetch residents');
        }
        const data: BackendResident[] = await res.json();
        const mapped = data.map((r, i) => normalizeResident({
          id: `res-${r.id}`,
          residentId: `RES-${1000 + Number(r.id)}`,
          name: r.name,
          age: computeAgeFromDob(r.date_of_birth),
          gender: String(r.gender || '').trim()
            ? String(r.gender).trim().slice(0, 1).toUpperCase() + String(r.gender).trim().slice(1)
            : '',
          room: r.room,
          dob: r.date_of_birth || '',
          status: r.status,
          section: r.room.startsWith('A-') ? 'Wing A' : 'Wing B',
          condition: '',
          medicalConditions: parseMedicalConditions(r.medical_conditions),
          allergies: r.allergies || '',
          caregiver: r.caregiver_name || 'Unassigned',
          profilePhoto: r.profile_photo ?? r.profilePhoto ?? null,
          admittedDate: formatDateOnly(r.created_at) || formatPHDate(new Date()),
          contacts: parseContacts(r.contacts),
          heartRate: null,
          battery: null,
          deviceId: r.device_id || '',
          archived: Boolean(r.archived),
          colorIndex: i % AVATAR_COLORS.length,
          medications: parseJsonArray(r.medications),
          notes: [
            { author: 'System', time: new Date(), content: 'Loaded from backend API.' },
          ],
          recentEvents: [],
        }));
        setResidents(mapped);
      } catch (_e) {
        setLoadError('Could not load residents from backend.');
      } finally {
        setIsLoading(false);
      }
    };

    checkHealth();
    loadResidents();
  }, []);

  const filteredResidents = residents
    .filter(r => r.archived === showArchived)
    .filter(r => {
      const q = searchQuery.toLowerCase();
      return r.name.toLowerCase().includes(q) ||
        r.residentId.toLowerCase().includes(q) ||
        r.room.toLowerCase().includes(q) ||
        r.section.toLowerCase().includes(q);
    })
    .sort((a, b) => sortAZ ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

  const handleArchive = async (id: string) => {
    const r = residents.find((resident) => resident.id === id);
    if (!r) return;
    const backendId = toBackendResidentId(id);
    const res = await apiFetch(`/api/residents/${backendId}`, { method: 'DELETE' });
    if (!res.ok) {
      setLoadError('Failed to archive resident.');
      return;
    }
    setResidents(prev => prev.map(resident => resident.id === id ? { ...resident, archived: true } : resident));
    setLastArchived(r);
    setShowUndo(true);
    if (selectedResident?.id === id) setSelectedResident(null);
    setConfirmArchive(null);
    setTimeout(() => setShowUndo(false), 5000);
  };

  const handleRestore = async (id: string) => {
    const backendId = toBackendResidentId(id);
    const res = await apiFetch(`/api/residents/${backendId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    if (!res.ok) {
      setLoadError('Failed to restore resident.');
      return;
    }
    setResidents(prev => prev.map(r => r.id === id ? { ...r, archived: false } : r));
    setResidentToRestore(null);
  };

  const handleUndo = async () => {
    if (!lastArchived) return;
    await handleRestore(lastArchived.id);
    setShowUndo(false);
  };

  const handlePermanentDelete = async (id: string) => {
    const backendId = toBackendResidentId(id);
    const res = await apiFetch(`/api/residents/${backendId}/permanent`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      setLoadError('Failed to permanently delete resident.');
      return;
    }
    setResidents((prev) => prev.filter((r) => r.id !== id));
    if (selectedResident?.id === id) setSelectedResident(null);
    setResidentToPermanentDelete(null);
  };

  const handleUpdateResident = (residentId: string, patch: Record<string, unknown>) => {
    setResidents((prev) =>
      prev.map((resident) => (resident.id === residentId ? normalizeResident({ ...resident, ...patch }) : resident))
    );
    setSelectedResident((prev: any) => (prev?.id === residentId ? normalizeResident({ ...prev, ...patch }) : prev));
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {userRole === 'caregiver' ? 'Assigned Residents' : 'Residents'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{filteredResidents.length} residents</p>
          <div className="mt-1 text-xs">
            <span className={backendHealthy ? 'text-green-600' : backendHealthy === false ? 'text-red-600' : 'text-slate-400'}>
              Backend: {backendHealthy ? 'Connected' : backendHealthy === false ? 'Disconnected' : 'Checking...'}
            </span>
          </div>
        </div>
        {userRole === 'admin' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Resident</span>
          </button>
        )}
      </div>

      {/* Search & Sort */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, ID, room, section..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
        <button
          onClick={() => setSortAZ(!sortAZ)}
          className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition-colors"
        >
          <ArrowUpDown className="w-4 h-4" />
          <span>{sortAZ ? 'A–Z' : 'Z–A'}</span>
        </button>
        {userRole === 'admin' && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showArchived ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? 'Archived' : 'Archive'}
          </button>
        )}
      </div>

      {/* Profile Card Grid */}
      {isLoading && (
        <div className="mb-4 text-sm text-slate-500">Loading residents from backend...</div>
      )}
      {loadError && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {loadError}
        </div>
      )}
      {filteredResidents.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <UserIcon className="w-16 h-16 mx-auto mb-4 text-slate-200" />
          <p>No residents found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredResidents.map((resident) => (
            <ProfileCard
              key={resident.id}
              resident={resident}
              userRole={userRole}
              onClick={() => setSelectedResident(normalizeResident(resident))}
              onDeleteClick={userRole === 'admin' && !resident.archived ? () => setConfirmArchive(resident) : undefined}
            />
          ))}
        </div>
      )}

      {/* Detail Side Panel */}
      {selectedResident && (
        <ResidentProfileErrorBoundary onClose={() => setSelectedResident(null)}>
          <ResidentDetailPanel
            resident={normalizeResident(selectedResident)}
            userRole={userRole}
            onClose={() => setSelectedResident(null)}
            onArchive={handleArchive}
            onUpdateResident={handleUpdateResident}
            setConfirmArchive={setConfirmArchive}
            setResidentToRestore={setResidentToRestore}
            setResidentToPermanentDelete={setResidentToPermanentDelete}
          />
        </ResidentProfileErrorBoundary>
      )}

      {/* Add Resident Modal */}
      {showAddModal && (
        <ResidentWizardModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onCreated={(resident) => {
            setResidents((prev) => [resident, ...prev]);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Archive Confirmation Dialog */}
      {confirmArchive && (
        <ArchiveConfirmDialog
          resident={confirmArchive}
          onConfirm={() => handleArchive(confirmArchive.id)}
          onCancel={() => setConfirmArchive(null)}
        />
      )}

      {/* Restore Confirmation Dialog */}
      {residentToRestore && (
        <RestoreConfirmDialog
          resident={residentToRestore}
          onConfirm={() => handleRestore(residentToRestore.id)}
          onCancel={() => setResidentToRestore(null)}
        />
      )}

      {residentToPermanentDelete && (
        <PermanentDeleteConfirmDialog
          resident={residentToPermanentDelete}
          onConfirm={() => handlePermanentDelete(residentToPermanentDelete.id)}
          onCancel={() => setResidentToPermanentDelete(null)}
        />
      )}

      {/* Undo snackbar */}
      {showUndo && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-4 z-50">
          <span className="text-sm">Resident archived</span>
          <button
            onClick={handleUndo}
            className="flex items-center gap-1.5 px-3 py-1 bg-white text-slate-900 rounded-md text-sm font-medium hover:bg-slate-100"
          >
            <Undo2 className="w-4 h-4" />
            Undo
          </button>
        </div>
      )}

      {/* Individual Resident Report Full-Screen Modal */}
      {showReport && (
        <ResidentReport
          resident={selectedResident}
          userRole={userRole}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

// ─── Profile Card (trash icon for admin only) ────────────────────────────────
function ProfileCard({
  resident,
  userRole,
  onClick,
  onDeleteClick,
}: {
  resident: any;
  userRole: UserRole;
  onClick: () => void;
  onDeleteClick?: () => void;
}) {
  return (
    <div className="relative">
      {userRole === 'admin' && onDeleteClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick();
          }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 shadow-sm transition-colors"
          title="Delete (archive) resident"
          aria-label={`Delete ${resident.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="w-full bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left group p-4 flex flex-col items-center text-center"
      >
        {/* Avatar */}
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${AVATAR_COLORS[resident.colorIndex]} flex items-center justify-center text-xl font-bold text-white shadow-md mb-3 group-hover:scale-105 transition-transform overflow-hidden`}>
          {resident.profilePhoto ? (
            <img src={resident.profilePhoto} alt={resident.name} className="h-full w-full object-cover" />
          ) : (
            getInitials(resident.name)
          )}
        </div>
        {/* Info */}
        <div className="font-semibold text-slate-900 text-sm leading-tight">{resident.name}</div>
        <div className="text-xs text-slate-500 mt-1">
        {(Number.isFinite(resident.age) ? `${resident.age} yrs` : '—')} · {String(resident.gender || '').slice(0, 1) || '—'}
      </div>
        <div className="text-xs text-slate-400 mt-0.5">{resident.room} · {resident.section}</div>
        <div className="mt-2 text-xs text-blue-600 font-mono">{resident.residentId}</div>
      </button>
    </div>
  );
}

// ─── Resident Detail Panel ────────────────────────────────────────────────────
function ResidentDetailPanel({
  resident,
  userRole,
  onClose,
  onArchive,
  onUpdateResident,
  setConfirmArchive,
  setResidentToRestore,
  setResidentToPermanentDelete,
}: any) {
  const [activeTab, setActiveTab] = useState('info');
  const [showReport, setShowReport] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [photoEditSrc, setPhotoEditSrc] = useState('');
  const canEdit = userRole === 'admin';
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [draftName, setDraftName] = useState(resident?.name || '');
  const [draftRoom, setDraftRoom] = useState(resident?.room || '');
  const [draftDob, setDraftDob] = useState(resident?.dob || '');
  const [draftGender, setDraftGender] = useState<'female' | 'male' | 'other' | ''>(() => {
    const g = String(resident?.gender || '').toLowerCase();
    return g === 'female' || g === 'male' || g === 'other' ? (g as 'female' | 'male' | 'other') : '';
  });
  const [draftStatus, setDraftStatus] = useState<'stable' | 'needs_attention' | 'offline'>(
    resident?.status === 'needs_attention' || resident?.status === 'offline' ? resident.status : 'stable'
  );
  const [draftAllergies, setDraftAllergies] = useState(resident?.allergies || '');
  const [draftConditions, setDraftConditions] = useState((resident?.medicalConditions || []).join(', '));
  const [editingMonitoring, setEditingMonitoring] = useState(false);
  const [draftDeviceId, setDraftDeviceId] = useState(resident?.deviceId || '');
  const [editingMeds, setEditingMeds] = useState(false);
  const [draftMeds, setDraftMeds] = useState<string[]>(resident?.medications || []);
  const [medDraft, setMedDraft] = useState('');
  const [editingContacts, setEditingContacts] = useState(false);
  const [draftContacts, setDraftContacts] = useState<any>(resident?.contacts || {});
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => {
    setEditingInfo(false);
    setEditingMonitoring(false);
    setEditingMeds(false);
    setEditingContacts(false);
    setInfoError('');
    setSavingInfo(false);
    setDraftName(resident?.name || '');
    setDraftRoom(resident?.room || '');
    setDraftDob(resident?.dob || '');
    {
      const g = String(resident?.gender || '').toLowerCase();
      setDraftGender(g === 'female' || g === 'male' || g === 'other' ? (g as 'female' | 'male' | 'other') : '');
    }
    setDraftStatus(resident?.status === 'needs_attention' || resident?.status === 'offline' ? resident.status : 'stable');
    setDraftAllergies(resident?.allergies || '');
    setDraftConditions((resident?.medicalConditions || []).join(', '));
    setDraftDeviceId(resident?.deviceId || '');
    setDraftMeds(resident?.medications || []);
    setMedDraft('');
    setDraftContacts(resident?.contacts || {});
  }, [resident?.id]);

  const patchResident = async (payload: Record<string, unknown>) => {
    const backendId = toBackendResidentId(resident.id);
    const res = await apiFetch(`/api/residents/${backendId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const savePersonalInfo = async () => {
    setInfoError('');
    const nextName = String(draftName || '').trim();
    const nextRoom = String(draftRoom || '').trim();
    if (nextName.length < 2) {
      setInfoError('Name must be at least 2 characters.');
      return;
    }
    if (nextRoom.length < 2) {
      setInfoError('Room must be at least 2 characters.');
      return;
    }
    const nextConditions = String(draftConditions || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
    const nextAllergies = String(draftAllergies || '').trim();

    try {
      setSavingInfo(true);
      const { res, data } = await patchResident({
        name: nextName,
        room: nextRoom,
        dateOfBirth: draftDob || null,
        gender: draftGender || null,
        status: draftStatus,
        medicalConditions: nextConditions,
        allergies: nextAllergies || null,
      });
      if (!res.ok) {
        setInfoError(data?.detail || data?.error || `Save failed (HTTP ${res.status}).`);
        return;
      }
      const updated = {
        name: data.name ?? nextName,
        room: data.room ?? nextRoom,
        dob: data.date_of_birth ?? draftDob,
        gender: String(data.gender || draftGender || '').trim()
          ? String(data.gender || draftGender).trim().slice(0, 1).toUpperCase() +
            String(data.gender || draftGender).trim().slice(1)
          : '',
        status: data.status ?? draftStatus,
        age: computeAgeFromDob(data.date_of_birth ?? draftDob),
        section: (data.room ?? nextRoom).startsWith('A-') ? 'Wing A' : 'Wing B',
        condition:
          (data.status ?? draftStatus) === 'needs_attention'
            ? 'Requires closer monitoring'
            : (data.status ?? draftStatus) === 'offline'
              ? 'Offline'
              : '',
        medicalConditions: nextConditions,
        allergies: nextAllergies,
      };
      onUpdateResident(resident.id, updated);
      setEditingInfo(false);
    } catch {
      setInfoError('Failed to save changes.');
    } finally {
      setSavingInfo(false);
    }
  };

  const startEditForTab = (tabId: string) => {
    if (!canEdit) return;
    setActiveTab(tabId);
    setInfoError('');
    setEditingInfo(false);
    setEditingMonitoring(false);
    setEditingMeds(false);
    setEditingContacts(false);
    if (tabId === 'info') setEditingInfo(true);
    if (tabId === 'monitoring') setEditingMonitoring(true);
    if (tabId === 'medications') setEditingMeds(true);
    if (tabId === 'contacts') setEditingContacts(true);
  };

  const saveMonitoring = async () => {
    setInfoError('');
    try {
      setSavingInfo(true);
      const nextDeviceId = String(draftDeviceId || '').trim();
      const { res, data } = await patchResident({ deviceId: nextDeviceId || null });
      if (!res.ok) {
        setInfoError(data?.detail || data?.error || `Save failed (HTTP ${res.status}).`);
        return;
      }
      onUpdateResident(resident.id, { deviceId: data.device_id ?? nextDeviceId });
      setEditingMonitoring(false);
    } catch {
      setInfoError('Failed to save changes.');
    } finally {
      setSavingInfo(false);
    }
  };

  const addMedication = () => {
    const v = medDraft.trim();
    if (!v) return;
    setDraftMeds((prev) => [...prev, v]);
    setMedDraft('');
  };

  const saveMedications = async () => {
    setInfoError('');
    try {
      setSavingInfo(true);
      const meds = (draftMeds || []).map((m) => String(m).trim()).filter(Boolean).slice(0, 100);
      const { res, data } = await patchResident({ medications: meds });
      if (!res.ok) {
        setInfoError(data?.detail || data?.error || `Save failed (HTTP ${res.status}).`);
        return;
      }
      onUpdateResident(resident.id, { medications: meds });
      setEditingMeds(false);
    } catch {
      setInfoError('Failed to save changes.');
    } finally {
      setSavingInfo(false);
    }
  };

  const saveContacts = async () => {
    setInfoError('');
    try {
      setSavingInfo(true);
      const payload = {
        primaryName: String(draftContacts?.primaryName || '').trim() || null,
        primaryRelationship: String(draftContacts?.primaryRelationship || '').trim() || null,
        primaryPhone: String(draftContacts?.primaryPhone || '').trim() || null,
        secondaryName: String(draftContacts?.secondaryName || '').trim() || null,
        secondaryRelationship: String(draftContacts?.secondaryRelationship || '').trim() || null,
        secondaryPhone: String(draftContacts?.secondaryPhone || '').trim() || null,
        tertiaryName: String(draftContacts?.tertiaryName || '').trim() || null,
        tertiaryRelationship: String(draftContacts?.tertiaryRelationship || '').trim() || null,
        tertiaryPhone: String(draftContacts?.tertiaryPhone || '').trim() || null,
      };
      const { res, data } = await patchResident({ contacts: payload });
      if (!res.ok) {
        setInfoError(data?.detail || data?.error || `Save failed (HTTP ${res.status}).`);
        return;
      }
      onUpdateResident(resident.id, { contacts: payload });
      setEditingContacts(false);
    } catch {
      setInfoError('Failed to save changes.');
    } finally {
      setSavingInfo(false);
    }
  };

  const handlePhotoUpload = async (file: File | null) => {
    if (!file) return;
    setPhotoError('');
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select an image file.');
      return;
    }
    if (file.size > 1_500_000) {
      setPhotoError('Image is too large. Please use a file under 1.5MB.');
      return;
    }
    const reader = new FileReader();
    const photoDataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
    setPhotoEditSrc(photoDataUrl);
    setPhotoEditOpen(true);
  };

  const handleConfirmResidentPhoto = async (dataUrl: string) => {
    setPhotoError('');
    setPhotoBusy(true);
    try {
      const backendId = toBackendResidentId(resident.id);
      const res = await apiFetch(`/api/residents/${backendId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profilePhoto: dataUrl }),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Some backend/proxy errors return non-JSON; keep fallback messaging below.
      }
      if (!res.ok) {
        if (res.status === 413) {
          setPhotoError('Image payload is too large. Please choose a smaller photo.');
          return;
        }
        setPhotoError(data?.detail || data?.error || `Upload failed (HTTP ${res.status}).`);
        return;
      }
      onUpdateResident(resident.id, { profilePhoto: data.profile_photo ?? null });
      setPhotoEditOpen(false);
      setPhotoEditSrc('');
    } catch {
      setPhotoError('Failed to upload profile photo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const tabs = [
    { id: 'info', label: 'Personal Info', icon: UserIcon },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'medications', label: 'Medications', icon: Pill },
    { id: 'events', label: 'Incidents', icon: Bell },
    { id: 'notes', label: 'Notes', icon: ClipboardList },
    { id: 'contacts', label: 'Contacts', icon: Phone },
    { id: 'report', label: 'Report', icon: FileText },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <CropRotateModal
        title="Edit resident photo"
        open={photoEditOpen}
        imageSrc={photoEditSrc}
        busy={photoBusy}
        onCancel={() => {
          if (photoBusy) return;
          setPhotoEditOpen(false);
          setPhotoEditSrc('');
        }}
        onConfirm={handleConfirmResidentPhoto}
      />
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div className="relative ml-auto h-full w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Panel Header */}
        <div className={`p-5 bg-gradient-to-r ${AVATAR_COLORS[resident.colorIndex]} text-white flex-shrink-0`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0 overflow-hidden">
                {resident.profilePhoto ? (
                  <img src={resident.profilePhoto} alt={resident.name} className="h-full w-full object-cover" />
                ) : (
                  getInitials(resident.name)
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold">{resident.name}</h2>
                <p className="text-white/80 text-sm">
                  {Number.isFinite(resident.age) ? resident.age : '—'} · {resident.gender || '—'} · Room {resident.room}
                </p>
                <p className="text-white/70 text-xs font-mono mt-0.5">{resident.residentId}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => startEditForTab(activeTab)}
                  className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil className="w-5 h-5" />
                </button>
              )}
              <button type="button" onClick={onClose} className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 overflow-x-auto flex-shrink-0">
          <div className="flex min-w-max">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 border-b-2 text-sm transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {editingInfo && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingInfo(false);
                      setInfoError('');
                      setDraftName(resident?.name || '');
                      setDraftRoom(resident?.room || '');
                      setDraftDob(resident?.dob || '');
                      {
                        const g = String(resident?.gender || '').toLowerCase();
                        setDraftGender(g === 'female' || g === 'male' || g === 'other' ? (g as 'female' | 'male' | 'other') : '');
                      }
                      setDraftStatus(
                        resident?.status === 'needs_attention' || resident?.status === 'offline' ? resident.status : 'stable'
                      );
                      setDraftAllergies(resident?.allergies || '');
                      setDraftConditions((resident?.medicalConditions || []).join(', '));
                    }}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={savePersonalInfo}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {savingInfo ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}

              {infoError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {infoError}
                </div>
              )}

              {editingInfo ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Full Name</div>
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Room</div>
                    <input
                      value={draftRoom}
                      onChange={(e) => setDraftRoom(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Date of Birth</div>
                    <input
                      type="date"
                      value={draftDob}
                      onChange={(e) => setDraftDob(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Status</div>
                    <select
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value as 'stable' | 'needs_attention' | 'offline')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="stable">Stable</option>
                      <option value="needs_attention">Needs Attention</option>
                      <option value="offline">Offline</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Gender</div>
                    <select
                      value={draftGender}
                      onChange={(e) => setDraftGender(e.target.value as 'female' | 'male' | 'other' | '')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Not set</option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Medical Conditions</div>
                    <input
                      value={draftConditions}
                      onChange={(e) => setDraftConditions(e.target.value)}
                      placeholder="Comma-separated, e.g. Hypertension, Diabetes"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Allergies</div>
                    <input
                      value={draftAllergies}
                      onChange={(e) => setDraftAllergies(e.target.value)}
                      placeholder="e.g. Penicillin, Peanuts"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoBlock label="Full Name" value={resident.name} />
                  <InfoBlock label="Room / Section" value={`${resident.room} · ${resident.section}`} />
                  <InfoBlock
                    label="Medical Conditions"
                    value={resident.medicalConditions?.length ? resident.medicalConditions.join(', ') : 'None listed'}
                  />
                  <InfoBlock label="Allergies" value={resident.allergies || 'None listed'} />
                </>
              )}
              <InfoBlock label="Age" value={Number.isFinite(resident.age) ? `${resident.age} years old` : '—'} />
              <InfoBlock label="Date of Birth" value={resident.dob || 'Not set'} />
              <InfoBlock label="Gender" value={resident.gender || '—'} />
              <InfoBlock label="Resident ID" value={resident.residentId} mono />
              <InfoBlock label="Admitted" value={resident.admittedDate} />
              <InfoBlock label="Primary Condition(s)" value={resident.condition} />
              <InfoBlock label="Assigned Caregiver" value={resident.caregiver} />
              {userRole === 'admin' && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">
                    Resident Profile Photo
                  </div>
                  <label className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 cursor-pointer">
                    <Plus className="w-4 h-4" />
                    {photoBusy ? 'Uploading...' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={photoBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        void handlePhotoUpload(file);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {photoError && <div className="text-xs text-red-600 mt-2">{photoError}</div>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className="space-y-4">
              {editingMonitoring && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMonitoring(false);
                      setInfoError('');
                      setDraftDeviceId(resident?.deviceId || '');
                    }}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveMonitoring}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {savingInfo ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 rounded-xl p-4 text-center">
                  <Heart className="w-6 h-6 text-red-400 mx-auto mb-1" />
                  <div className="font-bold text-slate-900">
                    {Number.isFinite(resident.heartRate) ? `${Math.round(resident.heartRate)} bpm` : '—'}
                  </div>
                  <div className="text-xs text-slate-500">Heart Rate</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">⚡</div>
                  <div className="font-bold text-slate-900">
                    {Number.isFinite(resident.battery) ? `${Math.round(resident.battery)}%` : '—'}
                  </div>
                  <div className="text-xs text-slate-500">Device Battery</div>
                </div>
              </div>
              {editingMonitoring ? (
                <div>
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Device ID</div>
                  <input
                    value={draftDeviceId}
                    onChange={(e) => setDraftDeviceId(e.target.value)}
                    placeholder="e.g. DEV-2048"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              ) : (
                <InfoBlock label="Device ID" value={resident.deviceId || 'Unassigned'} mono />
              )}
              <InfoBlock label="Device Status" value="Connected & Verified" />
              <InfoBlock label="Last Sync" value="Just now" />
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                ✓ SmartBand actively transmitting data — All systems normal
              </div>
            </div>
          )}

          {activeTab === 'medications' && (
            <div className="space-y-3">
              {editingMeds && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMeds(false);
                      setInfoError('');
                      setDraftMeds(resident?.medications || []);
                      setMedDraft('');
                    }}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveMedications}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {savingInfo ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
              <div className="text-sm text-slate-500 mb-3">Active prescriptions for {resident.name}</div>
              {editingMeds && (
                <div className="flex gap-2">
                  <input
                    value={medDraft}
                    onChange={(e) => setMedDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addMedication();
                      }
                    }}
                    placeholder="Add medication (press Enter)"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={addMedication}
                    className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
              {(editingMeds ? draftMeds : (resident.medications ?? [])).map((med: string, i: number) => (
                <div key={`${med}-${i}`} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <Pill className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span className="text-sm text-slate-900 truncate">{med}</span>
                  </div>
                  {editingMeds && (
                    <button
                      type="button"
                      onClick={() => setDraftMeds((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-white"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {((resident.medications?.length ?? 0) === 0) && (
                <div className="text-center py-8 text-slate-400 text-sm">No medications on record</div>
              )}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-3">
              {((resident.recentEvents?.length ?? 0) === 0) ? (
                <div className="text-center py-8 text-slate-400 text-sm">No incidents on record</div>
              ) : (
                (resident.recentEvents ?? []).map((ev: any, i: number) => (
                  <div key={i} className={`p-3 rounded-lg border-l-4 ${
                    ev.severity === 'critical' ? 'bg-red-50 border-red-400' : 'bg-yellow-50 border-yellow-400'
                  }`}>
                    <div className="font-medium text-slate-900 text-sm">{ev.type}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{ev.date} · Outcome: {ev.outcome}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-3">
              {userRole !== 'relative' && (
                <button className="w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
                  + Add Care Note
                </button>
              )}
              {(resident.notes ?? []).map((note: any, i: number) => (
                <div key={i} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex justify-between mb-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{note.author}</span>
                    <span>{safeToLocaleString(note.time)}</span>
                  </div>
                  <p className="text-sm text-slate-800">{note.content}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'contacts' && (
            <div className="space-y-4">
              {editingContacts && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingContacts(false);
                      setInfoError('');
                      setDraftContacts(resident?.contacts || {});
                    }}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveContacts}
                    disabled={savingInfo}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    {savingInfo ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}

              <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="text-xs font-semibold text-slate-500 uppercase">Emergency Contact (Primary)</div>
                {editingContacts ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={draftContacts?.primaryName || ''}
                      onChange={(e) => setDraftContacts((p: any) => ({ ...(p || {}), primaryName: e.target.value }))}
                      placeholder="Name"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      value={draftContacts?.primaryRelationship || ''}
                      onChange={(e) => setDraftContacts((p: any) => ({ ...(p || {}), primaryRelationship: e.target.value }))}
                      placeholder="Relationship"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      value={draftContacts?.primaryPhone || ''}
                      onChange={(e) => setDraftContacts((p: any) => ({ ...(p || {}), primaryPhone: e.target.value }))}
                      placeholder="Phone"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm md:col-span-2"
                    />
                  </div>
                ) : (
                  <div className="text-sm text-slate-700">
                    {(resident.contacts?.primaryName || '—')}{resident.contacts?.primaryRelationship ? ` (${resident.contacts.primaryRelationship})` : ''}{resident.contacts?.primaryPhone ? ` · ${resident.contacts.primaryPhone}` : ''}
                  </div>
                )}
              </div>
              <div className="p-4 border border-slate-200 rounded-xl">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Assigned Caregiver</div>
                <div className="text-sm font-medium text-slate-900">{resident.caregiver}</div>
                <div className="text-sm text-slate-600 mt-0.5">—</div>
              </div>
              <div className="p-4 border border-slate-200 rounded-xl">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Attending Physician</div>
                <div className="text-sm font-medium text-slate-900">—</div>
                <div className="text-sm text-slate-600 mt-0.5">—</div>
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
                <FileText className="w-7 h-7 text-blue-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 mb-1">Individual Resident Report</div>
                <p className="text-xs text-slate-500 max-w-xs">
                  Generate, preview, export, and print a comprehensive health, monitoring, medication, and incident report for {resident.name}.
                </p>
              </div>
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
              >
                <FileText className="w-4 h-4" />
                Open Full Report
              </button>
              <div className="text-xs text-slate-400 mt-1">
                {userRole === 'relative' ? 'Read-only · Download & Print allowed' :
                 userRole === 'caregiver' ? 'Generate & Print access' :
                 'Full access — Generate, Export, Print'}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {userRole === 'admin' && resident.archived && (
          <div className="border-t border-slate-100 p-4 flex-shrink-0 space-y-2">
            <button
              onClick={() => {
                onClose();
                setResidentToRestore(resident);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
            >
              <Undo2 className="w-4 h-4" />
              Restore Resident
            </button>
            <button
              onClick={() => {
                onClose();
                setResidentToPermanentDelete(resident);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Delete Permanently
            </button>
          </div>
        )}
      </div>

      {/* Individual Resident Report Full-Screen Modal */}
      {showReport && (
        <ResidentReport
          resident={resident}
          userRole={userRole}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

// ─── Archive Confirmation Dialog ──────────────────────────────────────────────
function ArchiveConfirmDialog({ resident, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-5">
          <h3 className="font-bold text-slate-900 text-lg mb-2">Remove resident?</h3>
          <p className="text-sm text-slate-600 mb-1">
            This archives the profile (hidden from the main list). You can restore it from the Archive view.
          </p>
          <div className="mt-3 p-3 bg-slate-50 rounded-lg">
            <div className="font-semibold text-slate-900 text-sm">{resident.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{resident.residentId} · Room {resident.room}</div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Restore Confirmation Dialog ──────────────────────────────────────────────
function RestoreConfirmDialog({ resident, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-5">
          <h3 className="font-bold text-slate-900 text-lg mb-2">Restore Resident?</h3>
          <p className="text-sm text-slate-600 mb-1">
            This will restore the resident profile to active status.
          </p>
          <div className="mt-3 p-3 bg-slate-50 rounded-lg">
            <div className="font-semibold text-slate-900 text-sm">{resident.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{resident.residentId} · Room {resident.room}</div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
          >
            Restore
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PermanentDeleteConfirmDialog({ resident, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-5">
          <h3 className="font-bold text-slate-900 text-lg mb-2">Permanently delete resident?</h3>
          <p className="text-sm text-slate-600 mb-1">
            This cannot be undone. All related resident data will be removed.
          </p>
          <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <div className="font-semibold text-slate-900 text-sm">{resident.name}</div>
            <div className="text-xs text-slate-500 mt-0.5">{resident.residentId} · Room {resident.room}</div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-slate-100">
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
          >
            Delete Permanently
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}