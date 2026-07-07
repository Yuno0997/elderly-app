import { useEffect, useState } from 'react';
import { Search, FileText, Settings as SettingsIcon, Cpu, CheckCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPHDateTime } from '../lib/time';

export function AuditLog() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/audit-logs');
        if (!res.ok) return;
        const data = await res.json();
        setLogs(data.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (log.user_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         log.details.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-4 md:p-6 min-h-full flex flex-col">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Audit Log</h1>
          <p className="text-sm text-slate-600 mb-4">
            Immutable record of all system actions and changes
          </p>

          {/* Search & Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="incident">Incidents</option>
              <option value="device">Device Management</option>
              <option value="settings">Settings Changes</option>
              <option value="user">User Management</option>
            </select>
          </div>
        </div>

        {/* Desktop Table */}
        {loading ? (
          <div className="p-4 text-sm text-slate-500">Loading audit logs...</div>
        ) : (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Timestamp</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Action</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">User</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-900">{formatPHDateTime(log.timestamp)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(log.category)}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(log.category)}`}>
                        {log.category}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{log.action}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.user_name || 'System'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-600">{log.details}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-200">
          {filteredLogs.map((log) => (
            <LogMobileCard key={log.id} log={log} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LogMobileCard({ log }: any) {
  return (
    <div className="p-4">
      <div className="flex items-start gap-3 mb-2">
        <div className="p-2 bg-slate-100 rounded-lg">
          {getCategoryIcon(log.category)}
        </div>
        <div className="flex-1">
          <div className="font-medium text-slate-900 mb-1">{log.action}</div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(log.category)}`}>
              {log.category}
            </span>
          </div>
          <div className="text-sm text-slate-600 mb-1">{log.details}</div>
          <div className="text-xs text-slate-500">
            {log.user_name || 'System'} • {formatPHDateTime(log.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
}

function getCategoryIcon(category: string) {
  switch (category) {
    case 'incident':
      return <FileText className="w-4 h-4 text-blue-600" />;
    case 'device':
      return <Cpu className="w-4 h-4 text-green-600" />;
    case 'settings':
      return <SettingsIcon className="w-4 h-4 text-purple-600" />;
    case 'user':
      return <CheckCircle className="w-4 h-4 text-orange-600" />;
    default:
      return <FileText className="w-4 h-4 text-slate-600" />;
  }
}

function getCategoryColor(category: string) {
  switch (category) {
    case 'incident':
      return 'bg-blue-100 text-blue-700';
    case 'device':
      return 'bg-green-100 text-green-700';
    case 'settings':
      return 'bg-purple-100 text-purple-700';
    case 'user':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

