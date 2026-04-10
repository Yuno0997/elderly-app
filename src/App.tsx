import { useState, useEffect, useRef } from 'react';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Residents } from './components/Residents';
import { Devices } from './components/Devices';
import { Users } from './components/Users';
import { Reports } from './components/Reports';
import { SystemManagement } from './components/SystemManagement';
import { AuditLog } from './components/AuditLog';
import { HealthRecords } from './components/HealthRecords';
import { IncidentHistory } from './components/IncidentHistory';
import { MedicationLog } from './components/MedicationLog';
import { AlertSimulation } from './components/AlertSimulation';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { CriticalFallModal } from './components/CriticalFallModal';
import { ConnectionBanner } from './components/ConnectionBanner';
import { SleepAnomalyModal } from './components/SleepAnomalyModal';
import { UnusualPulseModal } from './components/UnusualPulseModal';
import { SecurityModal } from './components/SecurityModal';
import { ProfileModal } from './components/ProfileModal';
import { apiFetch, clearAuthToken, getAuthToken } from './lib/api';
import { formatPHDateTime } from './lib/time';

export type UserRole = 'admin' | 'caregiver' | 'relative';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profilePhoto?: string | null;
  role: UserRole;
  residentId?: string;
  residentIds?: string[];
  mustChangePassword?: boolean;
}

const CHIME_NOTES_HZ = [523.25, 659.25];

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [isMobile, setIsMobile] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [criticalAlerts, setCriticalAlerts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeCaregiverAlertId, setActiveCaregiverAlertId] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const notificationsInitializedRef = useRef(false);
  const alertAudioCtxRef = useRef<AudioContext | null>(null);
  const alertAudioNodesRef = useRef<{
    o1: OscillatorNode;
    o2: OscillatorNode;
    gain: GainNode;
    modTimer: number;
  } | null>(null);

  const playIncomingAlertSound = () => {
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      o1.frequency.setValueAtTime(980, now);
      o2.frequency.setValueAtTime(740, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
      o1.connect(gain);
      o2.connect(gain);
      gain.connect(ctx.destination);
      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.76);
      o2.stop(now + 0.76);
      setTimeout(() => {
        void ctx.close();
      }, 900);
    } catch {
      // best-effort notification sound
    }
  };

  const startContinuousAlertSound = () => {
    if (alertAudioNodesRef.current) return;
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();

      // Gentle "dididing" chime pattern.
      o1.type = 'sine';
      o2.type = 'sine';
      o1.frequency.setValueAtTime(CHIME_NOTES_HZ[0], now);
      o2.frequency.setValueAtTime(CHIME_NOTES_HZ[1], now);
      gain.gain.setValueAtTime(0.0001, now);

      o1.connect(gain);
      o2.connect(gain);
      gain.connect(ctx.destination);
      o1.start(now);
      o2.start(now);

      let flip = false;
      const modTimer = window.setInterval(() => {
        const t = ctx.currentTime;
        const a = flip ? CHIME_NOTES_HZ[0] : CHIME_NOTES_HZ[1];
        const b = flip ? CHIME_NOTES_HZ[1] : CHIME_NOTES_HZ[0];
        flip = !flip;
        o1.frequency.setValueAtTime(a, t);
        o2.frequency.setValueAtTime(b, t);
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.03, t + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      }, 700);

      alertAudioCtxRef.current = ctx;
      alertAudioNodesRef.current = { o1, o2, gain, modTimer };
    } catch {
      // best-effort
    }
  };

  const stopContinuousAlertSound = () => {
    const nodes = alertAudioNodesRef.current;
    if (!nodes) return;
    window.clearInterval(nodes.modTimer);
    try {
      nodes.o1.stop();
      nodes.o2.stop();
    } catch {
      // ignore
    }
    alertAudioNodesRef.current = null;
    const ctx = alertAudioCtxRef.current;
    alertAudioCtxRef.current = null;
    if (ctx) void ctx.close();
  };

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = getAuthToken();
      if (!token) {
        setAuthChecking(false);
        return;
      }
      try {
        const res = await apiFetch('/api/auth/me');
        if (!res.ok) throw new Error('Session expired');
        const user = await res.json();
        setCurrentUser(user);
      } catch {
        clearAuthToken();
      } finally {
        setAuthChecking(false);
      }
    };
    bootstrapAuth();
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Keep online banner tied to actual backend polling behavior.
  useEffect(() => {
    setIsConnected(true);
  }, []);

  // Backend-driven notification polling for admin/caregiver
  useEffect(() => {
    if (!currentUser || currentUser.role === 'relative') return;
    let stopped = false;
    const poll = async () => {
      try {
        const [alertsRes, tasksRes] = await Promise.allSettled([
          apiFetch('/api/alerts'),
          currentUser.role === 'caregiver' ? apiFetch('/api/care-tasks') : Promise.resolve(null as any),
        ]);

        let unresolved: any[] = [];
        if (alertsRes.status === 'fulfilled' && alertsRes.value?.ok) {
          const data = await alertsRes.value.json();
          unresolved = (Array.isArray(data) ? data : []).filter((a: any) => a.status !== 'resolved');
        }

        let taskNotifications: any[] = [];
        if (currentUser.role === 'caregiver' && tasksRes.status === 'fulfilled' && tasksRes.value?.ok) {
          const tasks = await tasksRes.value.json();
          const pendingTasks = (Array.isArray(tasks) ? tasks : []).filter((t: any) => !t.completed);
          taskNotifications = pendingTasks.map((t: any) => ({
            id: `task-${t.id}`,
            type: `Care Task: ${t.taskType || 'Assigned task'}`,
            severity: 'info',
            resident: Array.isArray(t.residents) && t.residents.length
              ? t.residents.map((r: any) => r.name).join(', ')
              : 'Assigned residents',
            room: Array.isArray(t.residents) && t.residents.length
              ? t.residents.map((r: any) => r.room).join(', ')
              : 'N/A',
            timestamp: t.createdAt || t.scheduleTime || new Date().toISOString(),
            status: 'unacknowledged',
            isTaskNotification: true,
          }));
        }

        if (stopped) return;
        setNotifications([...unresolved, ...taskNotifications]);
        // Header badge keeps tracking critical fall alerts for continuity with existing UI.
        const critical = unresolved
          .filter(
            (a: any) =>
              a.severity === 'critical' &&
              a.status === 'unacknowledged' &&
              /fall/i.test(String(a.type || ''))
          )
          .map((a: any) => ({
            id: a.id,
            residentName: a.resident,
            residentId: 'N/A',
            room: a.room,
            type: a.type,
            triggeredAt: new Date(a.timestamp),
          }));
        setCriticalAlerts(critical);
      } catch {
        // keep current notification state
      }
    };
    poll();
    // Faster polling for demo responsiveness.
    const iv = setInterval(poll, 3000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [currentUser]);

  useEffect(() => {
    // Caregiver flow: show exactly one modal for the newest unacknowledged alert.
    if (!currentUser || currentUser.role !== 'caregiver') {
      setActiveCaregiverAlertId(null);
      return;
    }
    const newestSupported = [...notifications]
      .filter((n: any) => n.status === 'unacknowledged' && /(fall|sleep|hr|pulse)/i.test(String(n.type || '')))
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    setActiveCaregiverAlertId(newestSupported?.id ?? null);
  }, [notifications, currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'relative') return;
    const activeAlertIds = new Set(
      notifications
        .filter((n: any) => !n.isTaskNotification && n.status === 'unacknowledged')
        .map((n: any) => String(n.id))
    );

    if (!notificationsInitializedRef.current) {
      seenAlertIdsRef.current = activeAlertIds;
      notificationsInitializedRef.current = true;
      return;
    }

    const hasNewAlert = [...activeAlertIds].some((id) => !seenAlertIdsRef.current.has(id));
    if (hasNewAlert) playIncomingAlertSound();
    seenAlertIdsRef.current = activeAlertIds;
  }, [notifications, currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'relative') {
      stopContinuousAlertSound();
      return;
    }
    const hasUnackEmergency = notifications.some(
      (n: any) =>
        !n.isTaskNotification &&
        n.status === 'unacknowledged' &&
        /(fall|sleep|hr|pulse|critical)/i.test(String(n.type || '') + ' ' + String(n.severity || ''))
    );

    if (!hasUnackEmergency) {
      stopContinuousAlertSound();
      return;
    }
    startContinuousAlertSound();
  }, [notifications, currentUser]);

  useEffect(() => {
    return () => {
      stopContinuousAlertSound();
    };
  }, []);

  const acknowledgeNotification = async (alertId: string) => {
    await apiFetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    setNotifications((prev) => prev.map((n) => (n.id === alertId ? { ...n, status: 'acknowledged' } : n)));
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentPage('dashboard');
    if (user.mustChangePassword) {
      setShowSecurityModal(true);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setCurrentPage('dashboard');
    setCriticalAlerts([]);
    setActiveCaregiverAlertId(null);
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
  };

  const handleAcknowledgeCritical = async (alertId: string) => {
    await apiFetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    setCriticalAlerts(prev => prev.filter(a => a.id !== alertId));
    setNotifications(prev => prev.map(n => n.id === alertId ? { ...n, status: 'acknowledged' } : n));
  };

  const activeCaregiverAlert =
    currentUser?.role === 'caregiver'
      ? notifications.find((n: any) => n.id === activeCaregiverAlertId && n.status === 'unacknowledged') ?? null
      : null;
  const activeAdminAlert =
    currentUser?.role === 'admin'
      ? [...notifications]
          .filter((n: any) => n.status === 'unacknowledged' && /(fall|sleep|hr|pulse)/i.test(String(n.type || '')))
          .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] ?? null
      : null;
  const activeAdminAlertType = String(activeAdminAlert?.type || '').toLowerCase();
  const activeCaregiverAlertType = String(activeCaregiverAlert?.type || '').toLowerCase();
  const closeCaregiverAlert = () => setActiveCaregiverAlertId(null);
  const acknowledgeCaregiverAlert = async () => {
    if (!activeCaregiverAlert?.id) return;
    await acknowledgeNotification(activeCaregiverAlert.id);
    setActiveCaregiverAlertId(null);
  };
  const acknowledgeAdminAlert = async () => {
    if (!activeAdminAlert?.id) return;
    await acknowledgeNotification(activeAdminAlert.id);
  };

  if (authChecking) {
    return <div className="h-screen flex items-center justify-center text-slate-500">Loading session...</div>;
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    if (!currentUser) return null;

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'residents':
        return (currentUser.role !== 'relative')
          ? <Residents userRole={currentUser.role} />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'devices':
        return (currentUser.role === 'admin')
          ? <Devices userRole={currentUser.role} />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'users':
        return (currentUser.role === 'admin')
          ? <Users />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'reports':
        return <Reports userRole={currentUser.role} user={currentUser} />;

      case 'system-management':
        return (currentUser.role === 'admin')
          ? <SystemManagement />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'audit':
        return (currentUser.role === 'admin')
          ? <AuditLog />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'alert-simulation':
        return (currentUser.role === 'admin')
          ? <AlertSimulation currentUserId={currentUser.id} />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'health-records':
        return (currentUser.role === 'relative')
          ? <HealthRecords user={currentUser} />
          : <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;

      case 'incident-history':
        return <IncidentHistory user={currentUser} />;

      case 'medication-log':
        return <MedicationLog user={currentUser} />;

      default:
        return <Dashboard userRole={currentUser.role} onNavigate={handleNavigate} user={currentUser} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {!isConnected && <ConnectionBanner />}

      {currentUser.role === 'admin' && activeAdminAlert && /fall/i.test(activeAdminAlertType) && (
        <CriticalFallModal
          alert={{
            id: activeAdminAlert.id,
            residentName: activeAdminAlert.resident,
            residentId: 'N/A',
            room: activeAdminAlert.room,
            residentPhoto: activeAdminAlert.resident_profile_photo || null,
            type: activeAdminAlert.type,
            triggeredAt: new Date(activeAdminAlert.timestamp),
          }}
          onAcknowledge={() => {
            void acknowledgeAdminAlert();
          }}
        />
      )}

      {currentUser.role === 'admin' && activeAdminAlert && /sleep/i.test(activeAdminAlertType) && (
        <SleepAnomalyModal
          resident={{
            name: activeAdminAlert.resident || 'Unknown Resident',
            id: activeAdminAlert.id || 'N/A',
            room: activeAdminAlert.room || 'N/A',
            photo: activeAdminAlert.resident_profile_photo || null,
            caregiver: 'Assigned caregiver'
          }}
          anomaly={{
            type: activeAdminAlert.type || 'Sleep anomaly',
            timestamp: formatPHDateTime(activeAdminAlert.timestamp || Date.now()),
            status: 'Monitoring Required',
            recommendation: 'Review resident and follow your facility sleep-monitoring protocol.'
          }}
          onViewDetails={() => {}}
          onAcknowledge={() => {
            void acknowledgeAdminAlert();
          }}
          onAssignFollowUp={() => {}}
          onClose={() => {}}
        />
      )}

      {currentUser.role === 'admin' && activeAdminAlert && /(hr|pulse)/i.test(activeAdminAlertType) && (
        <UnusualPulseModal
          resident={{
            name: activeAdminAlert.resident || 'Unknown Resident',
            id: activeAdminAlert.id || 'N/A',
            room: activeAdminAlert.room || 'N/A',
            photo: activeAdminAlert.resident_profile_photo || null,
            caregiver: 'Assigned caregiver'
          }}
          pulseData={{
            current: activeAdminAlert.severity === 'critical' ? 120 : 105,
            normalRange: '60-100 bpm',
            timestamp: formatPHDateTime(activeAdminAlert.timestamp || Date.now()),
            status: 'elevated',
            recommendation: 'Check vitals and follow your facility pulse-alert response protocol.'
          }}
          onViewMonitoring={() => {}}
          onAcknowledge={() => {
            void acknowledgeAdminAlert();
          }}
          onMarkFollowUp={() => {}}
          onClose={() => {}}
        />
      )}

      {activeCaregiverAlert && /fall/i.test(activeCaregiverAlertType) && (
        <CriticalFallModal
          alert={{
            id: activeCaregiverAlert.id,
            residentName: activeCaregiverAlert.resident,
            residentId: 'N/A',
            room: activeCaregiverAlert.room,
            residentPhoto: activeCaregiverAlert.resident_profile_photo || null,
            type: activeCaregiverAlert.type,
            triggeredAt: new Date(activeCaregiverAlert.timestamp),
          }}
          onAcknowledge={() => {
            void acknowledgeCaregiverAlert();
          }}
        />
      )}

      {activeCaregiverAlert && /sleep/i.test(activeCaregiverAlertType) && (
        <SleepAnomalyModal
          resident={{
            name: activeCaregiverAlert.resident || 'Unknown Resident',
            id: activeCaregiverAlert.id || 'N/A',
            room: activeCaregiverAlert.room || 'N/A',
            photo: activeCaregiverAlert.resident_profile_photo || null,
            caregiver: 'Assigned caregiver'
          }}
          anomaly={{
            type: activeCaregiverAlert.type || 'Sleep anomaly',
            timestamp: formatPHDateTime(activeCaregiverAlert.timestamp || Date.now()),
            status: 'Monitoring Required',
            recommendation: 'Review resident and follow your facility sleep-monitoring protocol.'
          }}
          onViewDetails={closeCaregiverAlert}
          onAcknowledge={() => {
            void acknowledgeCaregiverAlert();
          }}
          onAssignFollowUp={closeCaregiverAlert}
          onClose={closeCaregiverAlert}
        />
      )}

      {activeCaregiverAlert && /(hr|pulse)/i.test(activeCaregiverAlertType) && (
        <UnusualPulseModal
          resident={{
            name: activeCaregiverAlert.resident || 'Unknown Resident',
            id: activeCaregiverAlert.id || 'N/A',
            room: activeCaregiverAlert.room || 'N/A',
            photo: activeCaregiverAlert.resident_profile_photo || null,
            caregiver: 'Assigned caregiver'
          }}
          pulseData={{
            current: activeCaregiverAlert.severity === 'critical' ? 120 : 105,
            normalRange: '60-100 bpm',
            timestamp: formatPHDateTime(activeCaregiverAlert.timestamp || Date.now()),
            status: 'elevated',
            recommendation: 'Check vitals and follow your facility pulse-alert response protocol.'
          }}
          onViewMonitoring={closeCaregiverAlert}
          onAcknowledge={() => {
            void acknowledgeCaregiverAlert();
          }}
          onMarkFollowUp={closeCaregiverAlert}
          onClose={closeCaregiverAlert}
        />
      )}

      <Header
        user={currentUser}
        onLogout={handleLogout}
        onOpenProfile={() => setShowProfileModal(true)}
        onProfileUpdated={(updatedUser) => setCurrentUser(updatedUser)}
        onOpenSecurity={() => setShowSecurityModal(true)}
        onOpenNotifications={() => setShowNotifications((prev) => !prev)}
        criticalCount={notifications.filter((n: any) => n.status === 'unacknowledged').length}
      />
      {showNotifications && currentUser.role !== 'relative' && (
        <div className="absolute right-4 top-16 z-40 w-96 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-900">Notifications</div>
          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">No active notifications.</div>
            ) : notifications.map((n) => (
              <div key={n.id} className="p-4 border-b border-slate-100 last:border-b-0">
                <div className="flex items-start gap-3">
                  {!n.isTaskNotification && n.resident_profile_photo ? (
                    <img src={n.resident_profile_photo} alt={n.resident || 'Resident'} className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold border border-slate-200">
                      {String(n.resident || 'R').trim().slice(0, 1).toUpperCase() || 'R'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{n.type}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {n.isTaskNotification ? `${n.resident} · Rooms ${n.room}` : `${n.resident} · Room ${n.room}`}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{formatPHDateTime(n.timestamp)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showSecurityModal && (
        <SecurityModal
          forceChange={Boolean(currentUser.mustChangePassword)}
          onPasswordChanged={() => setCurrentUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev))}
          onSessionsRevoked={handleLogout}
          onClose={() => setShowSecurityModal(false)}
        />
      )}
      {showProfileModal && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onSaved={(updatedUser) => setCurrentUser(updatedUser)}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        {!isMobile && (
          <Sidebar
            currentPage={currentPage}
            userRole={currentUser.role}
            onNavigate={handleNavigate}
          />
        )}

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {renderPage()}
        </main>
      </div>

      {isMobile && (
        <BottomNav
          currentPage={currentPage}
          userRole={currentUser.role}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

export default App;