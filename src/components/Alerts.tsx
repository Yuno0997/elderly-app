import { useEffect, useState } from 'react';
import { UserRole } from '../App';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AlertsProps {
  userRole: UserRole;
}

export function Alerts({ userRole }: AlertsProps) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/alerts');
        if (!res.ok) return;
        const data = await res.json();
        setAlerts(data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleAcknowledge = async (alertId: string) => {
    const res = await apiFetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    if (!res.ok) return;
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'acknowledged' } : a));
  };

  const handleResolve = async (alertId: string) => {
    const res = await apiFetch(`/api/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    if (!res.ok) return;
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'resolved' } : a));
  };

  return (
    <div className="p-4 md:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Alerts & Incidents</h1>
        {loading ? (
          <div className="text-sm text-slate-500">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
            <p>No alerts yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{alert.type}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{alert.resident} · Room {alert.room}</div>
                </div>
                <div className="flex items-center gap-2">
                  {alert.status === 'unacknowledged' && (
                    <button onClick={() => handleAcknowledge(alert.id)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs">Acknowledge</button>
                  )}
                  {alert.status !== 'resolved' && (
                    <button onClick={() => handleResolve(alert.id)} className="px-3 py-1.5 bg-green-600 text-white rounded text-xs">Resolve</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
