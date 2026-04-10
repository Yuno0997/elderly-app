import { UserRole } from '../App';
import { LayoutDashboard, Users, Cpu, BarChart3, Settings, Activity, AlertTriangle, Pill, User as UserIcon, FileText, MoreHorizontal, Syringe } from 'lucide-react';
import { useState } from 'react';

interface BottomNavProps {
  currentPage: string;
  userRole: UserRole;
  onNavigate: (page: string) => void;
}

function getItems(role: UserRole) {
  if (role === 'admin') {
    return {
      main: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'residents', label: 'Residents', icon: Users },
        { id: 'devices', label: 'Devices', icon: Cpu },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'more', label: 'More', icon: MoreHorizontal },
      ],
      more: [
        { id: 'users', label: 'Users', icon: UserIcon },
        { id: 'system-management', label: 'System Mgmt', icon: Settings },
        { id: 'alert-simulation', label: 'Alert Sim', icon: Syringe },
        { id: 'audit', label: 'Audit Log', icon: FileText },
      ],
    };
  }
  if (role === 'caregiver') {
    return {
      main: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'residents', label: 'Residents', icon: Users },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ],
      more: [],
    };
  }
  // relative
  return {
    main: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'health-records', label: 'Health', icon: Activity },
      { id: 'incident-history', label: 'Incidents', icon: AlertTriangle },
      { id: 'medication-log', label: 'Meds', icon: Pill },
    ],
    more: [],
  };
}

export function BottomNav({ currentPage, userRole, onNavigate }: BottomNavProps) {
  const [showMore, setShowMore] = useState(false);
  const { main, more } = getItems(userRole);

  const handleNavClick = (id: string) => {
    if (id === 'more') {
      setShowMore(!showMore);
    } else {
      onNavigate(id);
      setShowMore(false);
    }
  };

  return (
    <>
      {showMore && more.length > 0 && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg">
            <div className="grid grid-cols-3 gap-2">
              {more.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <Icon className="w-6 h-6 text-slate-600" />
                    <span className="text-xs text-slate-700">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
        <div className={`grid`} style={{ gridTemplateColumns: `repeat(${main.length}, 1fr)` }}>
          {main.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'more' ? showMore : currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`flex flex-col items-center gap-1 py-2.5 transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
                {isActive && item.id !== 'more' && (
                  <div className="absolute bottom-0 w-6 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
