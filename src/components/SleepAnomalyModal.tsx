import { X, Moon, User, Clock, AlertTriangle } from 'lucide-react';

interface SleepAnomalyModalProps {
  resident: {
    name: string;
    id: string;
    room: string;
    photo?: string | null;
    caregiver: string;
  };
  anomaly: {
    type: string;
    timestamp: string;
    status: string;
    recommendation: string;
  };
  onViewDetails: () => void;
  onAcknowledge: () => void;
  onAssignFollowUp: () => void;
  onClose: () => void;
}

export function SleepAnomalyModal({
  resident,
  anomaly,
  onViewDetails,
  onAcknowledge,
  onAssignFollowUp,
  onClose
}: SleepAnomalyModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Moon className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Sleep Anomaly Detected</h3>
              <p className="text-sm text-slate-500 mt-0.5">Unusual sleep pattern identified</p>
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
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
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
                <span>{anomaly.timestamp}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-blue-600 font-medium">{resident.caregiver}</span>
              </div>
            </div>
          </div>

          {/* Anomaly Details */}
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Detected Anomaly
              </div>
              <div className="text-sm text-slate-900">{anomaly.type}</div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Current Status
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                  {anomaly.status}
                </span>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-indigo-900 mb-1">Recommended Action</div>
                  <div className="text-sm text-indigo-800">{anomaly.recommendation}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button
            onClick={onViewDetails}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
          >
            View Resident Details
          </button>
          <button
            onClick={onAcknowledge}
            className="flex-1 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium text-sm"
          >
            Acknowledge
          </button>
          <button
            onClick={onAssignFollowUp}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
          >
            Assign Follow-Up
          </button>
        </div>
      </div>
    </div>
  );
}
