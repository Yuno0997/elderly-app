import { AlertTriangle, Heart, WifiOff, Clock, Eye } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface AlertCardProps {
  alert: {
    id: string;
    type: string;
    severity: 'warning' | 'critical';
    residentName: string;
    residentId: string;
    room: string;
    triggeredAt: Date;
    status: 'unacknowledged' | 'acknowledged' | 'resolved';
  };
}

export function AlertCard({ alert }: AlertCardProps) {
  const getIcon = () => {
    if (alert.type === 'Fall') return AlertTriangle;
    if (alert.type.includes('HR')) return Heart;
    if (alert.type === 'Offline') return WifiOff;
    return AlertTriangle;
  };

  const Icon = getIcon();

  const severityColors = {
    critical: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes === 0) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  return (
    <div className={`border rounded-lg p-3 ${severityColors[alert.severity]}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${alert.severity === 'critical' ? 'bg-red-200 text-red-700' : 'bg-yellow-200 text-yellow-700'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-semibold text-slate-900">{alert.type}</div>
            <StatusBadge status={alert.status} size="sm" />
          </div>
          <div className="text-sm text-slate-700 mb-1">{alert.residentName}</div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>{alert.room}</span>
            <span>•</span>
            <span className="font-mono">{alert.residentId}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
            <Clock className="w-3 h-3" />
            <span>{formatTime(alert.triggeredAt)}</span>
          </div>
        </div>
      </div>
      
      {alert.status === 'unacknowledged' && (
        <div className="mt-3 flex gap-2">
          <button className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Acknowledge
          </button>
          <button className="px-3 py-2 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm border border-slate-300">
            <Eye className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
