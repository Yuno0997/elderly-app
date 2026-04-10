import { X, Heart, User, Clock, TrendingUp, AlertTriangle } from 'lucide-react';

interface UnusualPulseModalProps {
  resident: {
    name: string;
    id: string;
    room: string;
    photo?: string | null;
    caregiver: string;
  };
  pulseData: {
    current: number;
    normalRange: string;
    timestamp: string;
    status: 'elevated' | 'low';
    recommendation: string;
  };
  onViewMonitoring: () => void;
  onAcknowledge: () => void;
  onMarkFollowUp: () => void;
  onClose: () => void;
}

export function UnusualPulseModal({
  resident,
  pulseData,
  onViewMonitoring,
  onAcknowledge,
  onMarkFollowUp,
  onClose
}: UnusualPulseModalProps) {
  const isElevated = pulseData.status === 'elevated';
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              isElevated ? 'bg-red-100' : 'bg-orange-100'
            }`}>
              <Heart className={`w-6 h-6 ${isElevated ? 'text-red-600' : 'text-orange-600'}`} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Unusual Pulse Rate Detected</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {isElevated ? 'Heart rate elevated' : 'Heart rate below normal'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Resident Info */}
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br ${
                isElevated ? 'from-red-400 to-red-600' : 'from-orange-400 to-orange-600'
              }`}>
                {resident.photo ? (
                  <img src={resident.photo} alt={resident.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  resident.name.split(' ').map(n => n[0]).join('').slice(0, 2)
                )}
              </div>
              <div>
                <div className="font-semibold text-slate-900">{resident.name}</div>
                <div className="text-xs text-slate-500">
                  {resident.id} · Room {resident.room}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{pulseData.timestamp}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-blue-600 font-medium">{resident.caregiver}</span>
              </div>
            </div>
          </div>

          {/* Pulse Data */}
          <div className={`rounded-lg p-4 ${isElevated ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Current Pulse Rate
                </div>
                <div className={`text-3xl font-bold ${isElevated ? 'text-red-700' : 'text-orange-700'}`}>
                  {pulseData.current} <span className="text-lg">bpm</span>
                </div>
              </div>
              <div className={`p-3 rounded-full ${isElevated ? 'bg-red-200' : 'bg-orange-200'}`}>
                <TrendingUp className={`w-6 h-6 ${isElevated ? 'text-red-700' : 'text-orange-700'} ${!isElevated ? 'rotate-180' : ''}`} />
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
                Normal Range
              </div>
              <div className="text-sm text-slate-700 font-medium">{pulseData.normalRange}</div>
            </div>
          </div>

          {/* Recommendation */}
          <div className={`border rounded-lg p-3 ${isElevated ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isElevated ? 'text-red-600' : 'text-orange-600'}`} />
              <div>
                <div className={`text-xs font-semibold mb-1 ${isElevated ? 'text-red-900' : 'text-orange-900'}`}>
                  Suggested Next Action
                </div>
                <div className={`text-sm ${isElevated ? 'text-red-800' : 'text-orange-800'}`}>
                  {pulseData.recommendation}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button
            onClick={onViewMonitoring}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
          >
            View Monitoring Data
          </button>
          <button
            onClick={onAcknowledge}
            className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm"
          >
            Acknowledge
          </button>
          <button
            onClick={onMarkFollowUp}
            className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors font-medium text-sm ${
              isElevated ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            Mark for Follow-Up
          </button>
        </div>
      </div>
    </div>
  );
}
