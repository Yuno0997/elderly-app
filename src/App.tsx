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
import { AlertToastStack } from './components/AlertToastStack';
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
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const notificationsInitializedRef = useRef(false);
  const viewedNotifIdsRef = useRef<Set<string>>(new Set());
  const [unseenNotifCount, setUnseenNotifCount] = useState(0);
  const [appToast, setAppToast] = useState('');

  const showAppToast = (msg: string) => {
    setAppToast(msg);
    setTimeout(() => setAppToast(''), 3000);
  };
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

  // ── Global 401 auto-logout ────────────────────────────────────────────────
  // apiFetch dispatches 'auth:unauthorized' the moment any protected API call
  // returns 401. We listen here so polling loops don't keep firing after the
  // token has expired or been revoked.
  useEffect(() => {
    const onUnauthorized = () => {
      setCurrentUser(null);
      setCurrentPage('dashboard');
      setCriticalAlerts([]);
      setSelectedAlertId(null);
      stopContinuousAlertSound();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  // ── Proactive session heartbeat (every 5 min) ─────────────────────────────
  // Quietly checks whether the JWT is still valid. If the server says 401,
  // apiFetch will fire 'auth:unauthorized' above, triggering a clean logout
  // before the 3-second polling loops start producing a 401 flood.
  useEffect(() => {
    if (!currentUser) return;
    const check = async () => {
      try {
        await apiFetch('/api/auth/session');
        // 401 is handled globally by the auth:unauthorized listener above.
      } catch {
        // network error — ignore, keep user logged in
      }
    };
    const iv = setInterval(check, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(iv);
  }, [currentUser]);


  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Keep online banner tied to actual backend health.
  // Ping /api/health every 30s; show banner if backend is unreachable.
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        setIsConnected(res.ok);
      } catch {
        setIsConnected(false);
      }
    };
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
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
    // Caregiver auto-pop modal effect removed in favor of stacked toasts
    if (!currentUser || currentUser.role !== 'caregiver') {
      setSelectedAlertId(null);
      return;
    }
  }, [currentUser]);

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

    // Update unseen badge count — only alerts not yet viewed by opening the panel
    const unseen = [...activeAlertIds].filter((id) => !viewedNotifIdsRef.current.has(id)).length;
    setUnseenNotifCount(unseen);
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
        /(fall|sleep|restless|spo2|apnea|hr|pulse|tachycardia|bradycardia|heart|critical)/i.test(String(n.type || '') + ' ' + String(n.severity || ''))
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
    setSelectedAlertId(null);
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

  const selectedAlert = selectedAlertId 
    ? notifications.find((n: any) => n.id === selectedAlertId && n.status === 'unacknowledged') ?? null
    : null;

  const activeCaregiverAlert = currentUser?.role === 'caregiver' ? selectedAlert : null;
  const activeAdminAlert = currentUser?.role === 'admin' ? selectedAlert : null;

  const activeAdminAlertType = String(activeAdminAlert?.type || '').toLowerCase();
  const activeCaregiverAlertType = String(activeCaregiverAlert?.type || '').toLowerCase();
  
  const closeCaregiverAlert = () => setSelectedAlertId(null);
  const acknowledgeCaregiverAlert = async () => {
    if (!activeCaregiverAlert?.id) return;
    await acknowledgeNotification(activeCaregiverAlert.id);
    setSelectedAlertId(null);
  };
  const acknowledgeAdminAlert = async () => {
    if (!activeAdminAlert?.id) return;
    await acknowledgeNotification(activeAdminAlert.id);
    setSelectedAlertId(null);
  };

  // ── Pulse modal button helpers ────────────────────────────────────────────────
  const handleViewMonitoring = async (alert: any, closeModal: () => void) => {
    if (alert?.id) await acknowledgeNotification(alert.id);
    closeModal();
    handleNavigate('incident-history');
  };

  const handleMarkFollowUp = async (alert: any, closeModal: () => void) => {
    if (!alert?.id) return;
    // 1. Acknowledge the alert
    await acknowledgeNotification(alert.id);

    // 2. Auto-create a follow-up care task 30 min from now
    try {
      // Resolve assigned caregiver for this resident
      const residentsRes = await apiFetch('/api/residents');
      const residents: any[] = residentsRes.ok ? await residentsRes.json() : [];
      const match = residents.find(
        (r: any) => String(r.name || '').trim().toLowerCase() === String(alert.resident || '').trim().toLowerCase()
      );
      const caregiverUserId = match?.caregiver_user_id ?? null;
      const residentId = match?.id ?? null;

      const scheduleTime = new Date(Date.now() + 30 * 60 * 1000)
        .toISOString()
        .slice(0, 16); // datetime-local format

      if (caregiverUserId && residentId) {
        await apiFetch('/api/care-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caregiverUserId,
            residentIds: [residentId],
            taskType: 'Pulse Follow-Up Check',
            scheduleTime,
            priority: 'high',
            notes: `Auto-created follow-up for pulse anomaly alert (${alert.type || 'Unusual Pulse Rate'}) detected at ${alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'unknown time'}.`,
          }),
        });
        showAppToast(`Follow-up task created for ${alert.resident} — scheduled in 30 min`);
      } else {
        showAppToast('Alert marked for follow-up (no caregiver assigned to auto-create task)');
      }
    } catch {
      showAppToast('Alert acknowledged — could not auto-create follow-up task');
    }

    closeModal();
    handleNavigate('residents');
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
    <div className="h-screen flex flex-col bg-slate-50 print:h-auto print:block print:bg-white">
      {!isConnected && <ConnectionBanner />}

      {currentUser.role !== 'relative' && (
        <AlertToastStack
          notifications={notifications}
          onViewDetails={(alert) => {
            setSelectedAlertId(alert.id);
          }}
        />
      )}

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

      {currentUser.role === 'admin' && activeAdminAlert && /(sleep|restless|spo2|apnea)/i.test(activeAdminAlertType) && (
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

      {currentUser.role === 'admin' && activeAdminAlert && /(hr|pulse|tachycardia|bradycardia|heart)/i.test(activeAdminAlertType) && (
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
          onViewMonitoring={() => { void handleViewMonitoring(activeAdminAlert, () => {}); }}
          onAcknowledge={() => {
            void acknowledgeAdminAlert();
          }}
          onMarkFollowUp={() => { void handleMarkFollowUp(activeAdminAlert, () => {}); }}
          onClose={() => { void acknowledgeAdminAlert(); }}
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

      {activeCaregiverAlert && /(sleep|restless|spo2|apnea)/i.test(activeCaregiverAlertType) && (
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

      {activeCaregiverAlert && /(hr|pulse|tachycardia|bradycardia|heart)/i.test(activeCaregiverAlertType) && (
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
          onViewMonitoring={() => { void handleViewMonitoring(activeCaregiverAlert, closeCaregiverAlert); }}
          onAcknowledge={() => {
            void acknowledgeCaregiverAlert();
          }}
          onMarkFollowUp={() => { void handleMarkFollowUp(activeCaregiverAlert, closeCaregiverAlert); }}
          onClose={closeCaregiverAlert}
        />
      )}

      <div className="print:hidden">
        <Header
          user={currentUser}
          onLogout={handleLogout}
          onOpenProfile={() => setShowProfileModal(true)}
          onProfileUpdated={(updatedUser) => setCurrentUser(updatedUser)}
          onOpenSecurity={() => setShowSecurityModal(true)}
          onOpenNotifications={() => {
            const opening = !showNotifications;
            setShowNotifications((prev) => !prev);
            if (opening) {
              // Mark all currently unacknowledged as viewed → badge resets to 0
              notifications
                .filter((n: any) => n.status === 'unacknowledged')
                .forEach((n: any) => viewedNotifIdsRef.current.add(String(n.id)));
              setUnseenNotifCount(0);
            }
          }}
          criticalCount={unseenNotifCount}
        />
      </div>
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
          onLogout={handleLogout}
        />
      )}

      <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
        {!isMobile && (
          <div className="print:hidden">
            <Sidebar
              currentPage={currentPage}
              userRole={currentUser.role}
              onNavigate={handleNavigate}
            />
          </div>
        )}

        <main className="flex-1 overflow-auto pb-20 md:pb-0 print:block print:overflow-visible print:pb-0 h-full">
          {renderPage()}
        </main>
      </div>

      {isMobile && (
        <div className="print:hidden">
          <BottomNav
            currentPage={currentPage}
            userRole={currentUser.role}
            onNavigate={handleNavigate}
          />
        </div>
      )}

      {appToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-[100] text-sm font-medium">
          ✓ {appToast}
        </div>
      )}
    </div>
  );
}

export default App;