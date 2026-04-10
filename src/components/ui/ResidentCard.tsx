import { Heart, Battery, Clock, Eye, FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface ResidentCardProps {
  resident: {
    id: string;
    name: string;
    residentId: string;
    room: string;
    heartRate: number;
    battery: number;
    lastSeen: number;
    status: 'online' | 'warning' | 'critical' | 'offline';
    trend?: 'up' | 'down';
    photo?: string | null;
  };
  onViewProfile: () => void;
  onAddNote: () => void;
}

export function ResidentCard({ resident, onViewProfile, onAddNote }: ResidentCardProps) {
  const borderColors = {
    online: 'border-green-500',
    warning: 'border-yellow-500',
    critical: 'border-red-500',
    offline: 'border-slate-300',
  };

  const formatLastSeen = (minutes: number) => {
    if (minutes === 0) return 'Just now';
    if (minutes === 1) return '1 min ago';
    return `${minutes} mins ago`;
  };

  return (
    <div className={`bg-white border-l-4 ${borderColors[resident.status]} rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center text-xl">
            {resident.photo ? (
              <img src={resident.photo} alt={resident.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{resident.name}</h3>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-mono">{resident.residentId}</span>
              <span>•</span>
              <span>{resident.room}</span>
            </div>
          </div>
        </div>
        <StatusBadge status={resident.status} size="sm" />
      </div>

      {/* Vitals */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-slate-50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
            <Heart className="w-3 h-3" />
            <span>HR</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-slate-900">{Math.round(resident.heartRate)}</span>
            <span className="text-xs text-slate-600">bpm</span>
            {resident.trend === 'up' && <TrendingUp className="w-3 h-3 text-red-500" />}
            {resident.trend === 'down' && <TrendingDown className="w-3 h-3 text-blue-500" />}
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
            <Battery className="w-3 h-3" />
            <span>Battery</span>
          </div>
          <div className="font-semibold text-slate-900">{Math.round(resident.battery)}%</div>
        </div>

        <div className="bg-slate-50 rounded-lg p-2">
          <div className="flex items-center gap-1 text-xs text-slate-600 mb-1">
            <Clock className="w-3 h-3" />
            <span>Seen</span>
          </div>
          <div className="text-xs font-medium text-slate-900">{formatLastSeen(resident.lastSeen)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onViewProfile}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
        >
          <Eye className="w-4 h-4" />
          <span>View Profile</span>
        </button>
        <button
          onClick={onAddNote}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden md:inline">Note</span>
        </button>
      </div>
    </div>
  );
}
