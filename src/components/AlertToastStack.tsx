import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, Info, X, ChevronRight } from 'lucide-react';

export interface ToastAlert {
  id: string;
  type: string;
  severity: string;
  resident: string;
  room?: string;
  timestamp: string;
  message?: string;
  status: string;
  isTaskNotification?: boolean;
}

interface AlertToastProps {
  alert: ToastAlert;
  onDismiss: () => void;
  onView: () => void;
}

function AlertToast({ alert, onDismiss, onView }: AlertToastProps) {
  const isCritical = alert.severity === 'critical' || /fall/i.test(alert.type || '');
  const isWarning = alert.severity === 'warning' || /(sleep|restless|apnea)/i.test(alert.type || '');
  const isInfo = !isCritical && !isWarning;

  let bgClass = '';
  let iconClass = '';
  let Icon = Info;

  if (isCritical) {
    bgClass = 'bg-red-50 border-red-200';
    iconClass = 'text-red-600';
    Icon = AlertCircle;
  } else if (isWarning) {
    bgClass = 'bg-orange-50 border-orange-200';
    iconClass = 'text-orange-600';
    Icon = AlertTriangle;
  } else {
    bgClass = 'bg-blue-50 border-blue-200';
    iconClass = 'text-blue-600';
    Icon = Info;
  }

  const shortMessage = alert.isTaskNotification 
    ? alert.type 
    : `Status: ${alert.severity || 'Unknown'}`;

  return (
    <div 
      onClick={onView}
      className={`relative flex flex-col p-4 border rounded-xl shadow-lg pointer-events-auto overflow-hidden ${bgClass} cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCritical ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-blue-500'}`} />
      
      <div className="flex gap-3 items-start pl-1">
        <div className={`mt-0.5 ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2">
            <h4 className="font-semibold text-slate-900 truncate">{alert.type || 'Alert'}</h4>
            <span className="text-xs text-slate-500 whitespace-nowrap mt-0.5">
              {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          
          <div className="text-sm font-medium text-slate-800 mt-1 truncate">
            {alert.resident || 'Unknown Resident'} {alert.room ? `• Room ${alert.room}` : ''}
          </div>
          
          <div className="text-xs text-slate-600 mt-0.5 truncate">
            {shortMessage}
          </div>
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="text-slate-400 hover:text-slate-600 p-1 -mr-2 -mt-2 transition-colors rounded-full hover:bg-slate-100 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface AlertToastStackProps {
  notifications: ToastAlert[];
  onViewDetails: (alert: ToastAlert) => void;
}

export function AlertToastStack({ notifications, onViewDetails }: AlertToastStackProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    notifications.forEach(n => {
      if (n.status === 'unacknowledged' && !seenIds.current.has(n.id)) {
        seenIds.current.add(n.id);
        
        setVisibleIds(prev => {
          const next = new Set(prev);
          next.add(n.id);
          return next;
        });

        const isCritical = n.severity === 'critical' || /fall/i.test(n.type || '');
        if (!isCritical) {
          setTimeout(() => {
            setVisibleIds(prev => {
              const next = new Set(prev);
              next.delete(n.id);
              return next;
            });
          }, 8000); // Auto-dismiss non-critical after 8 seconds
        }
      }
    });
  }, [notifications]);

  const handleDismiss = (id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const activeToasts = notifications.filter(n => n.status === 'unacknowledged' && visibleIds.has(n.id));
  
  // Sort by timestamp descending (newest first)
  activeToasts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (activeToasts.length === 0) return null;

  const MAX_VISIBLE = 4;
  const displayedToasts = activeToasts.slice(0, MAX_VISIBLE);
  const hiddenCount = activeToasts.length - MAX_VISIBLE;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none">
      {displayedToasts.map(toast => (
         <AlertToast 
           key={toast.id} 
           alert={toast} 
           onDismiss={() => handleDismiss(toast.id)} 
           onView={() => {
             handleDismiss(toast.id);
             onViewDetails(toast);
           }} 
         />
      ))}
      {hiddenCount > 0 && (
         <div className="bg-white/95 backdrop-blur-sm border border-slate-200 shadow-md rounded-xl p-2.5 text-center text-sm font-medium text-slate-600 pointer-events-auto">
           +{hiddenCount} more unacknowledged {hiddenCount === 1 ? 'alert' : 'alerts'}
         </div>
      )}
    </div>
  );
}
