import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Heart, Battery, MapPin } from 'lucide-react';
import { formatPHDate, formatPHTime } from '../lib/time';

interface CriticalFallModalProps {
  alert: any;
  onAcknowledge: (id: string) => void;
}

export function CriticalFallModal({ alert, onAcknowledge }: CriticalFallModalProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const triggeredAt = alert?.triggeredAt ? new Date(alert.triggeredAt) : new Date();

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isUnattended = elapsedSeconds > 180; // 3 minutes

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        {/* Critical Header */}
        <div className="bg-red-600 text-white p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-10 h-10" />
            <div>
              <h2 className="text-2xl font-bold">CRITICAL FALL DETECTED</h2>
              <p className="text-red-100">Immediate attention required</p>
            </div>
          </div>
        </div>

        {/* Alert Details */}
        <div className="p-6 space-y-6">
          {/* Resident Info */}
          <div className="bg-slate-50 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-3xl">
                {alert?.residentPhoto ? (
                  <img src={alert.residentPhoto} alt={alert?.residentName || 'Resident'} className="w-full h-full rounded-full object-cover" />
                ) : (
                  '👤'
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900">{alert?.residentName || 'Resident'}</h3>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="flex items-center gap-2 text-slate-700">
                    <MapPin className="w-4 h-4" />
                    <span>Room {alert?.room || 'N/A'}</span>
                  </div>
                  <div className="text-slate-600">
                    ID: <span className="font-mono">{alert?.residentId || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Time & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-800 mb-2">
                <Clock className="w-5 h-5" />
                <span className="font-semibold">Unacknowledged Time</span>
              </div>
              <div className="text-3xl font-bold text-yellow-900">{formatTime(elapsedSeconds)}</div>
              {isUnattended && (
                <div className="mt-2 text-sm font-semibold text-red-600">
                  ⚠️ UNATTENDED CRITICAL
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-600 mb-1">Triggered At</div>
              <div className="text-xl font-semibold text-slate-900">
                {formatPHTime(triggeredAt)}
              </div>
              <div className="text-sm text-slate-500 mt-1">
                {formatPHDate(triggeredAt)}
              </div>
            </div>
          </div>

          {/* Device Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 mb-1">
                <Heart className="w-4 h-4" />
                <span className="text-sm font-medium">Last Heart Rate</span>
              </div>
              <div className="text-2xl font-bold text-green-900">72 bpm</div>
              <div className="text-xs text-green-600 mt-1">2 min ago</div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-700 mb-1">
                <Battery className="w-4 h-4" />
                <span className="text-sm font-medium">Battery Level</span>
              </div>
              <div className="text-2xl font-bold text-blue-900">78%</div>
              <div className="text-xs text-blue-600 mt-1">Good</div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-sm text-slate-600 mb-1">Device Last Seen</div>
              <div className="text-2xl font-bold text-slate-900">Just now</div>
              <div className="text-xs text-slate-500 mt-1">Online</div>
            </div>
          </div>

          {/* Escalation Warning */}
          {elapsedSeconds > 120 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <span className="font-semibold">Escalation Protocol:</span> If unacknowledged for 5 minutes, 
                this alert will be escalated to the supervisor and emergency contacts.
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold py-5 rounded-lg transition-colors"
          >
            ACKNOWLEDGE ALERT
          </button>

          <p className="text-center text-sm text-slate-500">
            Click acknowledge to proceed to resident assistance
          </p>
        </div>
      </div>
    </div>
  );
}
