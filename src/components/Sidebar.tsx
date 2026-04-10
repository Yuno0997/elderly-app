import { UserRole } from '../App';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Cpu, BarChart3, Settings, FileText,
  User, Activity, AlertTriangle, Pill, Heart, Syringe
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface SidebarProps {
  currentPage: string;
  userRole: UserRole;
  onNavigate: (page: string) => void;
}

type NavItem = { id: string; label: string; icon: React.ElementType };

function getNavConfig(role: UserRole): { main: NavItem[]; admin?: NavItem[] } {
  if (role === 'admin') {
    return {
      main: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'residents', label: 'Residents', icon: Users },
        { id: 'devices', label: 'Devices', icon: Cpu },
        { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
      ],
      admin: [
        { id: 'users', label: 'Users', icon: User },
        { id: 'system-management', label: 'System Management', icon: Settings },
        { id: 'medication-log', label: 'Medication Log', icon: Pill },
        { id: 'alert-simulation', label: 'Alert Simulation', icon: Syringe },
        { id: 'audit', label: 'Audit Log', icon: FileText },
      ],
    };
  }
  if (role === 'caregiver') {
    return {
      main: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'residents', label: 'Assigned Residents', icon: Users },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ],
    };
  }
  // relative
  return {
    main: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'health-records', label: 'Health Records', icon: Activity },
      { id: 'incident-history', label: 'Incident History', icon: AlertTriangle },
      { id: 'medication-log', label: 'Medication Log', icon: Pill },
    ],
  };
}

const roleMeta: Record<UserRole, { label: string; color: string; bg: string; accent: string }> = {
  admin: { label: 'Administration', color: 'text-purple-700', bg: 'bg-purple-50', accent: 'bg-purple-500' },
  caregiver: { label: 'Care Team', color: 'text-blue-700', bg: 'bg-blue-50', accent: 'bg-blue-500' },
  relative: { label: 'Family Portal', color: 'text-teal-700', bg: 'bg-teal-50', accent: 'bg-teal-500' },
};

export function Sidebar({ currentPage, userRole, onNavigate }: SidebarProps) {
  const { main, admin } = getNavConfig(userRole);
  const meta = roleMeta[userRole];
  const [facilityName, setFacilityName] = useState('Sunrise Senior Care');
  const [facilityId, setFacilityId] = useState('SCF-2024');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch('/api/settings/facility');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setFacilityName(String(data?.facilityName || 'Sunrise Senior Care'));
        setFacilityId(String(data?.facilityId || 'SCF-2024'));
      } catch {
        // ignore and keep defaults
      }
    };
    void load();
    const iv = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const NavBtn = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const active = currentPage === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onNavigate(item.id)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-left ${
          active
            ? `${meta.bg} ${meta.color} font-semibold`
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        {active && <div className={`w-1 h-5 ${meta.accent} rounded-full absolute left-2`} />}
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
      {/* Role badge */}
      <div className={`mx-3 mt-4 mb-2 px-3 py-2 rounded-lg ${meta.bg}`}>
        <div className="flex items-center gap-2">
          <Heart className={`w-4 h-4 ${meta.color}`} />
          <span className={`text-xs font-semibold ${meta.color} uppercase tracking-wide`}>
            {meta.label}
          </span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 relative">
        {main.map(item => <NavBtn key={item.id} item={item} />)}

        {admin && (
          <>
            <div className="pt-4 pb-1 px-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Admin Tools
              </div>
            </div>
            {admin.map(item => <NavBtn key={item.id} item={item} />)}
          </>
        )}
      </nav>

      {/* Bottom facility name */}
      <div className="p-4 border-t border-slate-100">
        <div className="text-xs text-slate-400 leading-tight">
          <div className="font-medium text-slate-600">{facilityName}</div>
          <div>Facility ID: {facilityId}</div>
        </div>
      </div>
    </aside>
  );
}
