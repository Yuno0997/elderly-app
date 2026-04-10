import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, UploadCloud, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { cn } from './ui/utils';
import { CropRotateModal } from './CropRotateModal';
import { formatPHDate } from '../lib/time';

function computeAgeFromDob(dob: string) {
  if (!dob) return null;
  const d = new Date(dob);
  if (!Number.isFinite(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

type StepId = 'basic' | 'location' | 'health' | 'emergency' | 'device' | 'review';

type CaregiverUser = { id: string; name: string; email: string; role: 'caregiver'; active: boolean };

type ResidentFormState = {
  // Basic
  fullName: string;
  dob: string;
  gender: '' | 'female' | 'male' | 'other';
  photoDataUrl: string | null;

  // Location
  roomNumber: string;
  bedNumber: string;
  wardFloor: string;
  assignedCaregiverUserId: string;

  // Health
  status: 'stable' | 'needs_attention' | 'offline';
  conditions: string[];
  conditionDraft: string;
  allergies: string;
  mobility: 'independent' | 'assisted' | 'wheelchair' | 'bedridden' | '';
  fallRisk: 'low' | 'medium' | 'high' | '';

  // Emergency
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  secondaryName: string;
  secondaryRelationship: string;
  secondaryPhone: string;
  tertiaryName: string;
  tertiaryRelationship: string;
  tertiaryPhone: string;

  // Device
  bandId: string;
  deviceStatus: 'unassigned' | 'online' | 'offline' | 'maintenance';
  alertPrefs: { fall: boolean; sleep: boolean; pulse: boolean };
};

const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'location', label: 'Location' },
  { id: 'health', label: 'Health' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'device', label: 'Device' },
  { id: 'review', label: 'Review' },
];

function isValidPhone(s: string) {
  const v = s.trim();
  if (!v) return false;
  // Accept +63..., 09..., (digits, spaces, dashes, parentheses)
  const digits = v.replace(/[^\d+]/g, '');
  return /^\+?\d{10,15}$/.test(digits);
}

function badgeForStatus(status: ResidentFormState['status']) {
  if (status === 'stable') return 'bg-green-100 text-green-700';
  if (status === 'needs_attention') return 'bg-yellow-100 text-yellow-800';
  return 'bg-slate-200 text-slate-700';
}

function labelForStatus(status: ResidentFormState['status']) {
  return status === 'stable' ? 'Stable' : status === 'needs_attention' ? 'Needs Attention' : 'Offline';
}

function Stepper({ activeStep }: { activeStep: StepId }) {
  const activeIdx = STEPS.findIndex((s) => s.id === activeStep);
  return (
    <div className="px-6 pt-5">
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((s, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          return (
            <div key={s.id} className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border',
                    done && 'bg-blue-600 border-blue-600 text-white',
                    active && !done && 'bg-blue-50 border-blue-600 text-blue-700',
                    !active && !done && 'bg-white border-slate-300 text-slate-500'
                  )}
                  aria-hidden="true"
                >
                  {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </div>
                <div className={cn('text-xs truncate', active ? 'text-slate-900 font-semibold' : 'text-slate-500')}>
                  {s.label}
                </div>
              </div>
              <div className={cn('mt-2 h-1 rounded-full', idx <= activeIdx ? 'bg-blue-600' : 'bg-slate-200')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children?: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700 mb-1.5">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, className, ...rest } = props;
  return (
    <>
      <input
        {...rest}
        className={cn(
          'border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 w-full text-sm outline-none transition-all duration-200',
          error && 'border-red-400 focus:ring-red-500',
          className
        )}
      />
      {error && <div className="mt-1 text-sm text-red-500">{error}</div>}
    </>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: string }) {
  const { error, className, children, ...rest } = props;
  return (
    <>
      <select
        {...rest}
        className={cn(
          'border border-gray-300 focus:ring-2 focus:ring-blue-500 rounded-lg px-3 py-2 w-full text-sm outline-none transition-all duration-200 bg-white',
          error && 'border-red-400 focus:ring-red-500',
          className
        )}
      >
        {children}
      </select>
      {error && <div className="mt-1 text-sm text-red-500">{error}</div>}
    </>
  );
}

type TogglePillProps = React.PropsWithChildren<{ active: boolean; onClick: () => void }> & React.Attributes;

function TogglePill({ active, onClick, children }: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 rounded-lg text-sm border transition-all duration-200',
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
      )}
    >
      {children}
    </button>
  );
}

function TagInput({
  tags,
  draft,
  setDraft,
  addTag,
  removeTag,
}: {
  tags: string[];
  draft: string;
  setDraft: (v: string) => void;
  addTag: (v: string) => void;
  removeTag: (t: string) => void;
}) {
  return (
    <div className="border border-slate-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all duration-200">
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 rounded-full px-3 py-1 text-xs">
            {t}
            <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              e.preventDefault();
              addTag(draft);
            }
            if (e.key === 'Backspace' && !draft && tags.length) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          onBlur={() => {
            // If the user typed a condition then clicks next/elsewhere,
            // commit it so it doesn't get "lost".
            if (draft.trim()) addTag(draft);
          }}
          placeholder={tags.length ? '' : 'Type and press Enter…'}
          className="flex-1 min-w-32 text-sm outline-none bg-transparent py-1"
        />
      </div>
    </div>
  );
}

function Dropzone({
  disabled,
  value,
  onPickFile,
  onClear,
}: {
  disabled?: boolean;
  value: string | null;
  onPickFile: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <div
        className={cn(
          'rounded-xl border border-dashed p-4 transition-all duration-200 bg-gray-50',
          dragOver ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-300'
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (disabled) return;
          const f = e.dataTransfer.files?.[0];
          if (f) onPickFile(f);
        }}
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
            {value ? (
              <img src={value} alt="Resident photo preview" className="w-full h-full object-cover" />
            ) : (
              <UploadCloud className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900">Photo (optional)</div>
            <div className="text-xs text-slate-500 mt-0.5">Drag & drop an image, or choose a file.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
              >
                Choose file
              </button>
              {value && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onClear}
                  className="bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onPickFile(f);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

export function ResidentWizardModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (resident: any) => void;
}) {
  const [quickAdd, setQuickAdd] = useState(true);
  const [step, setStep] = useState<StepId>('basic');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [caregivers, setCaregivers] = useState<CaregiverUser[]>([]);
  const [loadingCaregivers, setLoadingCaregivers] = useState(false);

  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [photoEditSrc, setPhotoEditSrc] = useState('');

  const [showSecondaryEmergencyContact, setShowSecondaryEmergencyContact] = useState(false);
  const [showTertiaryEmergencyContact, setShowTertiaryEmergencyContact] = useState(false);

  const [form, setForm] = useState<ResidentFormState>({
    fullName: '',
    dob: '',
    gender: '',
    photoDataUrl: null,

    roomNumber: '',
    bedNumber: '',
    wardFloor: '',
    assignedCaregiverUserId: '',

    status: 'stable',
    conditions: [],
    conditionDraft: '',
    allergies: '',
    mobility: '',
    fallRisk: '',

    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
    secondaryName: '',
    secondaryRelationship: '',
    secondaryPhone: '',
    tertiaryName: '',
    tertiaryRelationship: '',
    tertiaryPhone: '',

    bandId: '',
    deviceStatus: 'unassigned',
    alertPrefs: { fall: true, sleep: true, pulse: true },
  });

  const activeIdx = STEPS.findIndex((s) => s.id === step);
  const isWizard = !quickAdd;

  useEffect(() => {
    if (!open) return;
    // reset per-open
    setSubmitted(false);
    setSubmitting(false);
    setError('');
    setFieldErrors({});
    setQuickAdd(true);
    setStep('basic');
    setShowSecondaryEmergencyContact(false);
    setShowTertiaryEmergencyContact(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingCaregivers(true);
    apiFetch('/api/users')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        const list: CaregiverUser[] = (Array.isArray(data) ? data : []).filter((u: any) => u.role === 'caregiver' && u.active);
        if (!alive) return;
        setCaregivers(list);
        setForm((prev) => ({
          ...prev,
          assignedCaregiverUserId: prev.assignedCaregiverUserId || (list[0]?.id ?? ''),
        }));
      })
      .catch(() => {
        // caregiver selection is optional; keep empty
      })
      .finally(() => {
        if (!alive) return;
        setLoadingCaregivers(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const requiredOkQuickAdd = useMemo(() => {
    return Boolean(form.fullName.trim()) && Boolean(form.roomNumber.trim()) && Boolean(form.status);
  }, [form.fullName, form.roomNumber, form.status]);

  const validateStep = (s: StepId) => {
    const errs: Record<string, string> = {};
    if (s === 'basic') {
      if (!form.fullName.trim()) errs.fullName = 'Full name is required.';
      if (!quickAdd) {
        if (!form.dob) errs.dob = 'Date of birth is required.';
        if (!form.gender) errs.gender = 'Gender is required.';
      }
    }
    if (s === 'location') {
      if (!form.roomNumber.trim()) errs.roomNumber = 'Room number is required.';
    }
    if (s === 'emergency') {
      // Primary contact is required in the wizard.
      if (!form.emergencyName.trim()) errs.emergencyName = 'Contact name is required.';
      if (!form.emergencyRelationship.trim()) errs.emergencyRelationship = 'Relationship is required.';
      if (!isValidPhone(form.emergencyPhone)) errs.emergencyPhone = 'Enter a valid phone number.';

      const anySecondary = Boolean(
        form.secondaryName.trim() || form.secondaryRelationship.trim() || form.secondaryPhone.trim()
      );
      if (anySecondary) {
        if (!form.secondaryName.trim()) errs.secondaryName = 'Contact name is required.';
        if (!form.secondaryRelationship.trim()) errs.secondaryRelationship = 'Relationship is required.';
        if (!isValidPhone(form.secondaryPhone)) errs.secondaryPhone = 'Enter a valid phone number.';
      }
      const anyTertiary = Boolean(
        form.tertiaryName.trim() || form.tertiaryRelationship.trim() || form.tertiaryPhone.trim()
      );
      if (anyTertiary) {
        if (!form.tertiaryName.trim()) errs.tertiaryName = 'Contact name is required.';
        if (!form.tertiaryRelationship.trim()) errs.tertiaryRelationship = 'Relationship is required.';
        if (!isValidPhone(form.tertiaryPhone)) errs.tertiaryPhone = 'Enter a valid phone number.';
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (quickAdd) return;
    const ok = validateStep(step);
    if (!ok) return;
    const next = STEPS[Math.min(activeIdx + 1, STEPS.length - 1)]?.id ?? step;
    setStep(next);
  };

  const goBack = () => {
    if (quickAdd) return;
    const prev = STEPS[Math.max(activeIdx - 1, 0)]?.id ?? step;
    setStep(prev);
  };

  const addCondition = (v: string) => {
    const t = v.trim().replace(/,+$/, '');
    if (!t) return;
    setForm((prev) => {
      const exists = prev.conditions.some((c) => c.toLowerCase() === t.toLowerCase());
      if (exists) return { ...prev, conditionDraft: '' };
      return { ...prev, conditions: [...prev.conditions, t], conditionDraft: '' };
    });
  };

  const removeCondition = (t: string) => setForm((prev) => ({ ...prev, conditions: prev.conditions.filter((c) => c !== t) }));

  const pickPhotoFile = async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 1_500_000) {
      setError('Image is too large. Please use a file under 1.5MB.');
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

  const confirmCroppedPhoto = async (dataUrl: string) => {
    setForm((prev) => ({ ...prev, photoDataUrl: dataUrl }));
    setPhotoEditOpen(false);
    setPhotoEditSrc('');
  };

  const submit = async () => {
    setError('');
    setSubmitted(false);
    setFieldErrors({});

    // Quick add submit
    if (quickAdd) {
      if (!requiredOkQuickAdd) {
        validateStep('basic');
        setFieldErrors((prev) => ({ ...prev, roomNumber: prev.roomNumber ?? (!form.roomNumber.trim() ? 'Room number is required.' : '') }));
        return;
      }
    } else {
      // validate all steps before submit
      const allOk = ['basic', 'location', 'health', 'emergency', 'device', 'review'].every((sid) => validateStep(sid as StepId));
      if (!allOk) return;
    }

    try {
      setSubmitting(true);
      const room = form.roomNumber.trim();
      const res = await apiFetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.fullName.trim(),
          room,
          dateOfBirth: form.dob || null,
          gender: form.gender || null,
          status: form.status,
          medicalConditions: form.conditions,
          allergies: form.allergies.trim() || null,
          deviceId: form.bandId.trim() || null,
          medications: [],
          contacts: {
            primaryName: form.emergencyName.trim() || null,
            primaryRelationship: form.emergencyRelationship.trim() || null,
            primaryPhone: form.emergencyPhone.trim() || null,
            secondaryName: form.secondaryName.trim() || null,
            secondaryRelationship: form.secondaryRelationship.trim() || null,
            secondaryPhone: form.secondaryPhone.trim() || null,
            tertiaryName: form.tertiaryName.trim() || null,
            tertiaryRelationship: form.tertiaryRelationship.trim() || null,
            tertiaryPhone: form.tertiaryPhone.trim() || null,
          },
          caregiverUserId: form.assignedCaregiverUserId || undefined,
          profilePhoto: form.photoDataUrl ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.detail || data?.error || `Failed to add resident (HTTP ${res.status}).`);
        return;
      }

      onCreated({
        id: `res-${data.id}`,
        residentId: `RES-${1000 + data.id}`,
        name: data.name,
        age: computeAgeFromDob(form.dob),
        gender: form.gender ? form.gender[0].toUpperCase() + form.gender.slice(1) : '',
        room: data.room,
        status: data.status,
        section: data.room.startsWith('A-') ? 'Wing A' : 'Wing B',
        condition: '',
        medicalConditions: form.conditions,
        allergies: form.allergies.trim(),
        caregiver: caregivers.find((c) => c.id === form.assignedCaregiverUserId)?.name || 'Unassigned',
        dob: form.dob || '',
        profilePhoto: data.profile_photo ?? form.photoDataUrl ?? null,
        admittedDate: data.created_at ? formatPHDate(data.created_at) : formatPHDate(new Date()),
        emergency: form.emergencyName ? `${form.emergencyName} · ${form.emergencyPhone}` : '',
        heartRate: null,
        battery: null,
        deviceId: form.bandId || '',
        archived: false,
        colorIndex: 0,
        medications: [],
        notes: [],
        recentEvents: [],
      });

      setSubmitted(true);
      setTimeout(() => onClose(), 650);
    } catch (e: any) {
      setError(e?.message || 'Failed to add resident.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const canSubmit = quickAdd ? requiredOkQuickAdd && !submitting : step === 'review' && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && onClose()} />

      <CropRotateModal
        title="Edit resident photo"
        open={photoEditOpen}
        imageSrc={photoEditSrc}
        busy={false}
        onCancel={() => {
          setPhotoEditOpen(false);
          setPhotoEditSrc('');
        }}
        onConfirm={confirmCroppedPhoto}
      />

      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-lg overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">SafeAlert Band</div>
              <h2 className="text-xl font-bold text-slate-900">Add Resident</h2>
              <p className="text-sm text-slate-500 mt-1">Fast entry now, details later. Designed for caregivers.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-60"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Add */}
          <div className="mt-4 flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Quick Add</div>
              <div className="text-xs text-slate-500">Full Name, Room, Status only.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuickAdd((v) => !v)}
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                  quickAdd ? 'bg-blue-600' : 'bg-slate-300'
                )}
                aria-pressed={quickAdd}
                aria-label="Toggle Quick Add"
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                    quickAdd ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
              {!quickAdd && (
                <button
                  type="button"
                  onClick={() => setStep('basic')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Back to wizard
                </button>
              )}
            </div>
          </div>

          {!quickAdd && <Stepper activeStep={step} />}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 bg-gray-50 flex-1 min-h-0">
          {/* Quick Add mode */}
          {quickAdd ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <FieldLabel>Full Name *</FieldLabel>
                  <TextInput
                    value={form.fullName}
                    onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                    placeholder="e.g. Maria Santos"
                    error={fieldErrors.fullName}
                    autoFocus
                  />
                </div>
                <div>
                  <FieldLabel>Room Number *</FieldLabel>
                  <TextInput
                    value={form.roomNumber}
                    onChange={(e) => setForm((p) => ({ ...p, roomNumber: e.target.value }))}
                    placeholder="e.g. 301-A"
                    error={fieldErrors.roomNumber}
                  />
                </div>
                <div>
                  <FieldLabel>Status *</FieldLabel>
                  <Select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}
                  >
                    <option value="stable">Stable</option>
                    <option value="needs_attention">Needs Attention</option>
                    <option value="offline">Offline</option>
                  </Select>
                  <div className="mt-2">
                    <span className={cn('inline-flex text-xs px-2 py-1 rounded-full', badgeForStatus(form.status))}>
                      {labelForStatus(form.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickAdd(false);
                    setStep('basic');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Add More Details
                </button>
              </div>

              {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
              {submitted && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  Resident added successfully.
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Step content */}
              {step === 'basic' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <FieldLabel>Full Name *</FieldLabel>
                      <TextInput
                        value={form.fullName}
                        onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                        placeholder="e.g. Maria Santos"
                        error={fieldErrors.fullName}
                        autoFocus
                      />
                    </div>
                    <div>
                      <FieldLabel>Date of Birth *</FieldLabel>
                      <TextInput
                        type="date"
                        value={form.dob}
                        onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))}
                        error={fieldErrors.dob}
                      />
                    </div>
                    <div>
                      <FieldLabel>Gender *</FieldLabel>
                      <Select
                        value={form.gender}
                        onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value as any }))}
                        error={fieldErrors.gender}
                      >
                        <option value="">Select…</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Dropzone
                        disabled={submitting}
                        value={form.photoDataUrl}
                        onPickFile={pickPhotoFile}
                        onClear={() => setForm((p) => ({ ...p, photoDataUrl: null }))}
                      />
                      {error && <div className="mt-2 text-sm text-red-500">{error}</div>}
                    </div>
                  </div>
                </div>
              )}

              {step === 'location' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Room Number *</FieldLabel>
                      <TextInput
                        value={form.roomNumber}
                        onChange={(e) => setForm((p) => ({ ...p, roomNumber: e.target.value }))}
                        placeholder="e.g. 301-A"
                        error={fieldErrors.roomNumber}
                      />
                    </div>
                    <div>
                      <FieldLabel>Bed Number</FieldLabel>
                      <TextInput
                        value={form.bedNumber}
                        onChange={(e) => setForm((p) => ({ ...p, bedNumber: e.target.value }))}
                        placeholder="e.g. 2"
                      />
                    </div>
                    <div>
                      <FieldLabel>Ward / Floor</FieldLabel>
                      <TextInput
                        value={form.wardFloor}
                        onChange={(e) => setForm((p) => ({ ...p, wardFloor: e.target.value }))}
                        placeholder="e.g. Wing A · 3F"
                      />
                    </div>
                    <div>
                      <FieldLabel>Assigned Caregiver</FieldLabel>
                      <Select
                        value={form.assignedCaregiverUserId}
                        onChange={(e) => setForm((p) => ({ ...p, assignedCaregiverUserId: e.target.value }))}
                        disabled={loadingCaregivers}
                      >
                        <option value="">Unassigned</option>
                        {caregivers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.email})
                          </option>
                        ))}
                      </Select>
                      {loadingCaregivers && <div className="mt-1 text-xs text-slate-400">Loading caregivers…</div>}
                    </div>
                  </div>
                </div>
              )}

              {step === 'health' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Status *</FieldLabel>
                      <Select
                        value={form.status}
                        onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}
                      >
                        <option value="stable">Stable</option>
                        <option value="needs_attention">Needs Attention</option>
                        <option value="offline">Offline</option>
                      </Select>
                      <div className="mt-2">
                        <span className={cn('inline-flex text-xs px-2 py-1 rounded-full', badgeForStatus(form.status))}>
                          {labelForStatus(form.status)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Fall Risk</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {(['low', 'medium', 'high'] as const).map((v) => (
                          <TogglePill key={v} active={form.fallRisk === v} onClick={() => setForm((p) => ({ ...p, fallRisk: v }))}>
                            {v === 'low' ? 'Low' : v === 'medium' ? 'Medium' : 'High'}
                          </TogglePill>
                        ))}
                        <TogglePill active={form.fallRisk === ''} onClick={() => setForm((p) => ({ ...p, fallRisk: '' }))}>
                          Clear
                        </TogglePill>
                      </div>
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Medical Conditions</FieldLabel>
                    <TagInput
                      tags={form.conditions}
                      draft={form.conditionDraft}
                      setDraft={(v) => setForm((p) => ({ ...p, conditionDraft: v }))}
                      addTag={addCondition}
                      removeTag={removeCondition}
                    />
                    <div className="mt-1 text-xs text-slate-400">Examples: Hypertension, Diabetes, Dementia</div>
                  </div>

                  <div>
                    <FieldLabel>Allergies</FieldLabel>
                    <TextInput
                      value={form.allergies}
                      onChange={(e) => setForm((p) => ({ ...p, allergies: e.target.value }))}
                      placeholder="e.g. Penicillin, Peanuts"
                    />
                  </div>

                  <div>
                    <FieldLabel>Mobility</FieldLabel>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {([
                        { id: 'independent', label: 'Independent' },
                        { id: 'assisted', label: 'Assisted' },
                        { id: 'wheelchair', label: 'Wheelchair' },
                        { id: 'bedridden', label: 'Bedridden' },
                      ] as const).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, mobility: m.id }))}
                          className={cn(
                            'px-3 py-2 rounded-lg border text-sm transition-all duration-200',
                            form.mobility === m.id ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 'emergency' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Primary Contact</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Contact Name</FieldLabel>
                      <TextInput
                        value={form.emergencyName}
                        onChange={(e) => setForm((p) => ({ ...p, emergencyName: e.target.value }))}
                        placeholder="e.g. Juan Santos"
                        error={fieldErrors.emergencyName}
                      />
                    </div>
                    <div>
                      <FieldLabel>Relationship</FieldLabel>
                      <TextInput
                        value={form.emergencyRelationship}
                        onChange={(e) => setForm((p) => ({ ...p, emergencyRelationship: e.target.value }))}
                        placeholder="e.g. Son"
                        error={fieldErrors.emergencyRelationship}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FieldLabel>Phone</FieldLabel>
                      <TextInput
                        value={form.emergencyPhone}
                        onChange={(e) => setForm((p) => ({ ...p, emergencyPhone: e.target.value }))}
                        placeholder="e.g. +639171234567 or 09171234567"
                        error={fieldErrors.emergencyPhone}
                        inputMode="tel"
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-100" />

                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Secondary Contact</div>
                    {!showSecondaryEmergencyContact && (
                      <button
                        type="button"
                        onClick={() => setShowSecondaryEmergencyContact(true)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-sm hover:bg-slate-100"
                      >
                        Add
                      </button>
                    )}
                  </div>

                  {showSecondaryEmergencyContact && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel>Contact Name</FieldLabel>
                        <TextInput
                          value={form.secondaryName}
                          onChange={(e) => setForm((p) => ({ ...p, secondaryName: e.target.value }))}
                          placeholder="e.g. Maria Santos"
                          error={fieldErrors.secondaryName}
                        />
                      </div>
                      <div>
                        <FieldLabel>Relationship</FieldLabel>
                        <TextInput
                          value={form.secondaryRelationship}
                          onChange={(e) => setForm((p) => ({ ...p, secondaryRelationship: e.target.value }))}
                          placeholder="e.g. Daughter"
                          error={fieldErrors.secondaryRelationship}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <FieldLabel>Phone</FieldLabel>
                        <TextInput
                          value={form.secondaryPhone}
                          onChange={(e) => setForm((p) => ({ ...p, secondaryPhone: e.target.value }))}
                          placeholder="e.g. +639171234567 or 09171234567"
                          error={fieldErrors.secondaryPhone}
                          inputMode="tel"
                        />
                      </div>
                    </div>
                  )}

                  {showSecondaryEmergencyContact && !showTertiaryEmergencyContact && (
                    <button
                      type="button"
                      onClick={() => setShowTertiaryEmergencyContact(true)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50"
                    >
                      Add
                    </button>
                  )}

                  {showTertiaryEmergencyContact && (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-slate-900">Additional Contact</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <FieldLabel>Contact Name</FieldLabel>
                          <TextInput
                            value={form.tertiaryName}
                            onChange={(e) => setForm((p) => ({ ...p, tertiaryName: e.target.value }))}
                            placeholder="e.g. Pedro Santos"
                            error={fieldErrors.tertiaryName}
                          />
                        </div>
                        <div>
                          <FieldLabel>Relationship</FieldLabel>
                          <TextInput
                            value={form.tertiaryRelationship}
                            onChange={(e) => setForm((p) => ({ ...p, tertiaryRelationship: e.target.value }))}
                            placeholder="e.g. Brother"
                            error={fieldErrors.tertiaryRelationship}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <FieldLabel>Phone</FieldLabel>
                          <TextInput
                            value={form.tertiaryPhone}
                            onChange={(e) => setForm((p) => ({ ...p, tertiaryPhone: e.target.value }))}
                            placeholder="e.g. +639171234567 or 09171234567"
                            error={fieldErrors.tertiaryPhone}
                            inputMode="tel"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 'device' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Band ID</FieldLabel>
                      <TextInput
                        value={form.bandId}
                        onChange={(e) => setForm((p) => ({ ...p, bandId: e.target.value }))}
                        placeholder="e.g. DEV-2048"
                      />
                    </div>
                    <div>
                      <FieldLabel>Device Status</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {(['unassigned', 'online', 'offline', 'maintenance'] as const).map((v) => (
                          <TogglePill key={v} active={form.deviceStatus === v} onClick={() => setForm((p) => ({ ...p, deviceStatus: v }))}>
                            {v === 'unassigned' ? 'Unassigned' : v[0].toUpperCase() + v.slice(1)}
                          </TogglePill>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Alert Preferences</FieldLabel>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {([
                        { id: 'fall', label: 'Fall alerts' },
                        { id: 'sleep', label: 'Sleep alerts' },
                        { id: 'pulse', label: 'Pulse alerts' },
                      ] as const).map((a) => (
                        <label key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <span className="text-sm font-medium text-slate-800">{a.label}</span>
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, alertPrefs: { ...p.alertPrefs, [a.id]: !p.alertPrefs[a.id] } }))}
                            className={cn(
                              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                              form.alertPrefs[a.id] ? 'bg-blue-600' : 'bg-slate-300'
                            )}
                            aria-pressed={form.alertPrefs[a.id]}
                            aria-label={a.label}
                          >
                            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', form.alertPrefs[a.id] ? 'translate-x-6' : 'translate-x-1')} />
                          </button>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 'review' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Review</div>
                      <div className="text-xs text-slate-500 mt-1">Confirm details before submitting.</div>
                    </div>
                    <span className={cn('inline-flex text-xs px-2 py-1 rounded-full', badgeForStatus(form.status))}>
                      {labelForStatus(form.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Resident</div>
                      <div className="mt-2 font-semibold text-slate-900">{form.fullName || '—'}</div>
                      <div className="text-sm text-slate-600 mt-1">DOB: {form.dob || '—'} · Gender: {form.gender || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Location</div>
                      <div className="mt-2 font-semibold text-slate-900">Room {form.roomNumber || '—'} {form.bedNumber ? `· Bed ${form.bedNumber}` : ''}</div>
                      <div className="text-sm text-slate-600 mt-1">Ward/Floor: {form.wardFloor || '—'}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        Caregiver: {caregivers.find((c) => c.id === form.assignedCaregiverUserId)?.name || 'Unassigned'}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Health</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Conditions: {form.conditions.length ? form.conditions.join(', ') : '—'}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">Allergies: {form.allergies || '—'}</div>
                    <div className="mt-1 text-sm text-slate-700">
                      Mobility: {form.mobility ? form.mobility[0].toUpperCase() + form.mobility.slice(1) : '—'} · Fall risk: {form.fallRisk || '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Emergency</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Primary: {form.emergencyName ? `${form.emergencyName} (${form.emergencyRelationship}) · ${form.emergencyPhone}` : '—'}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      Secondary: {form.secondaryName ? `${form.secondaryName} (${form.secondaryRelationship}) · ${form.secondaryPhone}` : '—'}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">
                      Additional: {form.tertiaryName ? `${form.tertiaryName} (${form.tertiaryRelationship}) · ${form.tertiaryPhone}` : '—'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">Device</div>
                    <div className="mt-2 text-sm text-slate-700">Band ID: {form.bandId || '—'}</div>
                    <div className="mt-1 text-sm text-slate-700">Status: {form.deviceStatus}</div>
                    <div className="mt-1 text-sm text-slate-700">
                      Alerts: {Object.entries(form.alertPrefs).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None'}
                    </div>
                  </div>
                </div>
              )}

              {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
              {submitted && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  Resident added successfully.
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className="bg-white border-t border-slate-100 p-6 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="text-xs text-slate-500">
              {quickAdd ? 'Quick Add mode' : `Step ${activeIdx + 1} of ${STEPS.length}`}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {!quickAdd && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={activeIdx === 0 || submitting}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-all duration-200 text-sm font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              {!quickAdd && step !== 'review' && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {(quickAdd || step === 'review') && (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ResidentFormState };

