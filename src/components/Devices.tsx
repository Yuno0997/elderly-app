import { useEffect, useMemo, useState } from 'react';
import { UserRole } from '../App';
import { Search, Plus, Cpu, Battery, BatteryLow } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface DevicesProps {
  userRole: UserRole;
}

function batteryMeta(status: string, battery: number) {
  if (status === 'offline') {
    return {
      label: 'Offline',
      chipClass: 'bg-slate-100 text-slate-600 border-slate-200',
      iconClass: 'text-slate-500',
      Icon: BatteryLow,
    };
  }
  if (battery <= 20) {
    return {
      label: 'Low Battery',
      chipClass: 'bg-red-50 text-red-700 border-red-200',
      iconClass: 'text-red-600',
      Icon: BatteryLow,
    };
  }
  if (battery <= 50) {
    return {
      label: 'Medium',
      chipClass: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      iconClass: 'text-yellow-600',
      Icon: Battery,
    };
  }
  return {
    label: 'Good',
    chipClass: 'bg-green-50 text-green-700 border-green-200',
    iconClass: 'text-green-600',
    Icon: Battery,
  };
}

export function Devices({ userRole }: DevicesProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [devices, setDevices] = useState<any[]>([]);
  const [residents, setResidents] = useState<Array<{ id: number; name: string; room: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [status, setStatus] = useState<'online' | 'offline' | 'maintenance'>('online');
  const [battery, setBattery] = useState(100);
  const [assigningDeviceId, setAssigningDeviceId] = useState<string | null>(null);
  const [assignResidentName, setAssignResidentName] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const isAdmin = userRole === 'admin';

  const filtered = useMemo(
    () => devices.filter((d) =>
      d.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.assignedResident || '').toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [devices, searchQuery]
  );

  const loadDevices = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/devices');
      if (!res.ok) return;
      setDevices(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let stopped = false;
    (async () => {
      try {
        const res = await apiFetch('/api/residents');
        if (!res.ok) return;
        const data = await res.json();
        if (stopped) return;
        const list = Array.isArray(data)
          ? data.map((r: any) => ({
              id: Number(r.id),
              name: String(r.name || ''),
              room: String(r.room || ''),
            }))
          : [];
        setResidents(list);
      } catch {
        // ignore resident list fetch errors in device view
      }
    })();
    return () => {
      stopped = true;
    };
  }, [isAdmin]);

  const addDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId.trim()) return;
    const res = await apiFetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId.trim(), status, battery }),
    });
    if (!res.ok) return;
    const created = await res.json();
    setDevices((prev) => [created, ...prev]);
    setDeviceId('');
    setStatus('online');
    setBattery(100);
  };

  const assignResident = async (id: string, residentName: string | null) => {
    setAssignSaving(true);
    const res = await apiFetch(`/api/devices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedResident: residentName && residentName.trim() ? residentName.trim() : null }),
    });
    setAssignSaving(false);
    if (!res.ok) return;
    const updated = await res.json();
    setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    setAssigningDeviceId(null);
    setAssignResidentName('');
  };

  return (
    <div className="p-4 md:p-6">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Devices</h1>
            {isAdmin && <span className="text-xs text-slate-500">Admin controls enabled</span>}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        {isAdmin && (
          <form onSubmit={addDevice} className="p-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="Device ID"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <input
              type="number"
              min={0}
              max={100}
              value={battery}
              onChange={(e) => setBattery(Number(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <button type="submit" className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              <Plus className="w-4 h-4" />
              Add Device
            </button>
          </form>
        )}
        <div className="p-4 border-t border-slate-200">
          {loading ? (
            <div className="text-sm text-slate-500">Loading devices...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Cpu className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">No devices found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((d) => (
                <div key={d.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{d.deviceId}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{d.status}</span>
                      {(() => {
                        const meta = batteryMeta(String(d.status || ''), Number(d.battery || 0));
                        const Icon = meta.Icon;
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${meta.chipClass}`}>
                            <Icon className={`w-3.5 h-3.5 ${meta.iconClass}`} />
                            {Number(d.battery || 0)}% · {meta.label}
                          </span>
                        );
                      })()}
                      <span>· {d.assignedResident || 'Unassigned'}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    assigningDeviceId === d.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={assignResidentName}
                          onChange={(e) => setAssignResidentName(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white min-w-56"
                        >
                          <option value="">Unassigned</option>
                          {residents.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.name} (Room {r.room})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignResident(d.id, assignResidentName || null)}
                          disabled={assignSaving}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setAssigningDeviceId(null);
                            setAssignResidentName('');
                          }}
                          disabled={assignSaving}
                          className="px-3 py-1.5 bg-slate-100 rounded text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAssigningDeviceId(d.id);
                          setAssignResidentName(String(d.assignedResident || ''));
                        }}
                        className="px-3 py-1.5 bg-slate-100 rounded text-xs text-slate-700 hover:bg-slate-200"
                      >
                        Assign
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
