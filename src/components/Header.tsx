import { ReactNode, useEffect, useRef, useState } from 'react';
import { User } from '../App';
import { Bell, LogOut, Heart, UserCircle2, Settings, ChevronDown, Camera } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { CropRotateModal } from './CropRotateModal';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onOpenProfile?: () => void;
  onProfileUpdated?: (user: User) => void;
  onOpenSecurity: () => void;
  onOpenNotifications?: () => void;
  criticalCount?: number;
}

const roleDisplay: Record<string, { label: string; badge: string }> = {
  admin: { label: 'Administrator', badge: 'bg-purple-100 text-purple-800' },
  caregiver: { label: 'Caregiver', badge: 'bg-blue-100 text-blue-800' },
  relative: { label: 'Family Member', badge: 'bg-teal-100 text-teal-800' },
};

export function Header({ user, onLogout, onOpenProfile, onProfileUpdated, onOpenSecurity, onOpenNotifications, criticalCount = 0 }: HeaderProps) {
  const { label, badge } = roleDisplay[user.role] ?? { label: user.role, badge: 'bg-slate-100 text-slate-800' };
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [photoEditSrc, setPhotoEditSrc] = useState<string>('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadProfilePhoto = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 1_500_000) return;
    const reader = new FileReader();
    const photoDataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
    setPhotoEditSrc(photoDataUrl);
    setPhotoEditOpen(true);
  };

  const handleConfirmCroppedPhoto = async (dataUrl: string) => {
    try {
      setPhotoBusy(true);
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profilePhoto: dataUrl }),
      });
      if (!res.ok) return;
      const data = await res.json();
      onProfileUpdated?.(data);
      setPhotoEditOpen(false);
      setPhotoEditSrc('');
    } finally {
      setPhotoBusy(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  return (
    <header className="bg-white/95 backdrop-blur border-b border-slate-200/80 h-16 flex items-center justify-between px-4 md:px-6 z-50 shrink-0">
      <CropRotateModal
        title="Edit profile photo"
        open={photoEditOpen}
        imageSrc={photoEditSrc}
        busy={photoBusy}
        onCancel={() => {
          if (photoBusy) return;
          setPhotoEditOpen(false);
          setPhotoEditSrc('');
        }}
        onConfirm={handleConfirmCroppedPhoto}
      />
      {/* Logo */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-sky-500 rounded-xl flex items-center justify-center shadow-sm ring-1 ring-blue-200/60">
          <Heart className="w-4 h-4 text-white" />
        </div>
        <div className="hidden sm:block min-w-0">
          <span className="block font-semibold tracking-tight text-slate-900 text-sm">SafeAlert Band</span>
          <div className="text-xs text-slate-500">Elderly Care Monitoring</div>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Bell — only for admin/caregiver */}
        {user.role !== 'relative' && (
          <button
            onClick={onOpenNotifications}
            className="relative p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors"
            aria-label="Open notifications"
          >
            <Bell className="w-4 h-4" />
            {criticalCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 shadow-sm">
                {criticalCount}
              </span>
            )}
          </button>
        )}

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            ref={triggerRef}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-2 pr-2.5 py-1.5 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-colors shadow-sm"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="user-menu"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-slate-700 to-slate-500 rounded-full flex items-center justify-center shadow-sm overflow-hidden">
              {user.profilePhoto ? (
                <img src={user.profilePhoto} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xs font-semibold">{initials}</span>
              )}
            </div>
            <div className="hidden md:block text-left leading-tight">
              <div className="text-sm font-semibold text-slate-900 truncate max-w-[160px]">{user.name}</div>
              <div className={`text-[11px] px-2 py-0.5 mt-0.5 rounded-full inline-flex ${badge}`}>
                {label}
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          <div
            id="user-menu"
            role="menu"
            aria-hidden={!menuOpen}
            className={`absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200/90 bg-white shadow-xl ring-1 ring-slate-100 z-[70]
              transition-all duration-150 ease-out origin-top-right
              ${menuOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-1 scale-[0.98] pointer-events-none'}`}
          >
            <div className="p-3">
              {/* User Header */}
              <div className="flex items-center gap-3 rounded-xl bg-slate-50/70 border border-slate-100 p-3">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-500 flex items-center justify-center shadow-sm text-white font-semibold text-sm overflow-hidden">
                    {user.profilePhoto ? (
                      <img src={user.profilePhoto} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                    className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    title="Upload profile photo"
                    aria-label="Upload profile photo"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleUploadProfilePhoto(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{user.name}</div>
                  <div className="text-xs text-slate-500 truncate">{user.email}</div>
                  <div className={`inline-flex mt-1 text-[10px] px-1.5 py-0.5 rounded-full ${badge}`}>
                    {label}
                  </div>
                </div>
              </div>

              {/* Account Section */}
              <div className="mt-3 border-t border-slate-100 pt-2">
                <MenuItem
                  icon={<UserCircle2 className="w-4 h-4 text-slate-500" />}
                  label="Profile"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenProfile?.();
                  }}
                />
                <MenuItem
                  icon={<Settings className="w-4 h-4 text-slate-500" />}
                  label="Settings"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSecurity();
                  }}
                />
              </div>

              {/* Logout */}
              <div className="mt-2 border-t border-slate-100 pt-2">
                <MenuItem
                  icon={<LogOut className="w-4 h-4 text-rose-600" />}
                  label="Logout"
                  destructive
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors
      focus:outline-none focus:ring-2 ${destructive ? 'text-rose-700 hover:bg-rose-50 focus:ring-rose-500/30' : 'text-slate-700 hover:bg-slate-50 focus:ring-blue-500/30'}`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}
