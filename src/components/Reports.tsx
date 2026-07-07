import { useEffect, useMemo, useState } from 'react';
import { UserRole, User } from '../App';
import { Download, FileText, Activity, AlertTriangle, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie, Legend
} from 'recharts';

interface ReportsProps {
  userRole: UserRole;
  user: User;
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6'];
const STATUS_COLORS: Record<string, string> = {
  stable: '#10b981',
  warning: '#f59e0b',
  needs_attention: '#ef4444',
  offline: '#94a3b8'
};

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

  const alertsByType = useMemo(() => {
    const counts = alerts.reduce((acc, a) => {
      const type = a.type || 'Unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [alerts]);

  const residentsByStatus = useMemo(() => {
    const counts = residents.reduce((acc, r) => {
      const s = r.status || 'stable';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [residents]);

  const alertsTimeline = useMemo(() => {
    const dates = alerts.reduce((acc, a) => {
      if (!a.timestamp) return acc;
      const d = new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(dates).slice(-14).map(([date, count]) => ({ date, count })); // last 14 unique dates
  }, [alerts]);

  const handleExport = () => {
    const csv = [
      'Alert ID,Resident,Room,Type,Severity,Status,Date',
      ...alerts.map(a =>
        `${a.id},${a.resident || ''},${a.room || ''},${a.type || ''},${a.severity || ''},${a.status || ''},${new Date(a.timestamp).toLocaleString()}`
      ),
    ].join('n');
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={Users} label="Residents Monitored" value={residents.length} color="text-blue-600" bg="bg-blue-50" />
        <SummaryCard icon={AlertTriangle} label="Total Alerts" value={alerts.length} color="text-red-600" bg="bg-red-50" />
        <SummaryCard icon={Activity} label="Open Alerts" value={openAlerts} color="text-amber-600" bg="bg-amber-50" />
        <SummaryCard label="Resolved Alerts" value={alerts.length - openAlerts} color="text-green-600" bg="bg-green-50" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Loading analytics...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Incident Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 col-span-1 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Incident Timeline</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={alertsTimeline.length ? alertsTimeline : [{ date: 'No Data', count: 0 }]} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="count" name="Incidents" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Incidents by Type */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Incidents by Type</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={alertsByType.length ? alertsByType : [{ name: 'No Alerts', value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {alertsByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                    {!alertsByType.length && <Cell fill="#cbd5e1" />}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Resident Status */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Resident Health Status</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={residentsByStatus.length ? residentsByStatus : [{ name: 'No Residents', value: 0 }]} margin={{ top: 5, right: 20, left: -20, bottom: 5 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={true} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#64748b' }} width={100} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="value" name="Residents" radius={[0, 4, 4, 0]} barSize={30}>
                    {residentsByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, bg }: { label: string; value: number, icon?: any, color: string, bg: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${bg}`}>
        {Icon ? <Icon className={`w-6 h-6 ${color}`} /> : <FileText className={`w-6 h-6 ${color}`} />}
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500 font-medium">{label}</div>
      </div>
    </div>
  );
}
