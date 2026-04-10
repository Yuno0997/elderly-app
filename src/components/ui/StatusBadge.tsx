interface StatusBadgeProps {
  status: 'online' | 'warning' | 'critical' | 'offline' | 'unacknowledged' | 'acknowledged' | 'resolved' | 'cancelled';
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const styles = {
    online: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    critical: 'bg-red-100 text-red-800 border-red-200',
    offline: 'bg-slate-100 text-slate-800 border-slate-200',
    unacknowledged: 'bg-red-100 text-red-800 border-red-200',
    acknowledged: 'bg-blue-100 text-blue-800 border-blue-200',
    resolved: 'bg-green-100 text-green-800 border-green-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const labels = {
    online: 'Online',
    warning: 'Warning',
    critical: 'Critical',
    offline: 'Offline',
    unacknowledged: 'Unacknowledged',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
    cancelled: 'Cancelled',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <span className={`inline-flex items-center border rounded-full font-medium ${styles[status]} ${sizes[size]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5"></span>
      {labels[status]}
    </span>
  );
}
