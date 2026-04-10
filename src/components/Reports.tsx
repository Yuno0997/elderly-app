import { useEffect, useMemo, useState } from 'react';
import { UserRole, User } from '../App';
import { Download, FileText } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ReportsProps {
  userRole: UserRole;
  user: User;
}

export function Reports({ userRole, user }: ReportsProps) {
  const [dateRange, setDateRange] = useState('30d');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [residents, setResidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [alertsRes, residentsRes] = await Promise.all([
          apiFetch('/api/alerts'),
          apiFetch('/api/residents'),
        ]);
        if (alertsRes.ok) setAlerts(await alertsRes.json());
        if (residentsRes.ok) setResidents(await residentsRes.json());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openAlerts = useMemo(() => alerts.filter(a => a.status !== 'resolved').length, [alerts]);

  const handleExport = () => {
    const csv = [
      'Alert ID,Resident,Room,Type,Severity,Status',
      ...alerts.map(a =>
        `${a.id},${a.resident || ''},${a.room || ''},${a.type || ''},${a.severity || ''},${a.status || ''}`
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safealert-incidents-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Operational reporting for your facility</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Residents Monitored" value={residents.length} />
        <SummaryCard label="Total Alerts" value={alerts.length} />
        <SummaryCard label="Open Alerts" value={openAlerts} />
        <SummaryCard label="Resolved Alerts" value={alerts.length - openAlerts} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        {loading ? (
          <p className="text-sm text-slate-500">Loading report data...</p>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">
              Reports now start from live facility data only. As records are added, analytics and trends will appear here.
            </p>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export Current Data
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
