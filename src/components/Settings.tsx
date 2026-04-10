import { useState } from 'react';
import { Save, Undo2 } from 'lucide-react';

export function Settings() {
  const [settings, setSettings] = useState({
    hrWarningLow: 50,
    hrWarningHigh: 100,
    hrCriticalLow: 45,
    hrCriticalHigh: 120,
    hrDuration: 5,
    offlineMinutes: 15,
    escalationMinutes: 5,
    facilityName: 'Sunrise Senior Care Facility',
    facilityAddress: '123 Care Street, Medical City, ST 12345',
    facilityPhone: '(555) 123-4567',
  });

  const [showSaved, setShowSaved] = useState(false);

  const handleSave = () => {
    // Mock save
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 3000);
  };

  const handleReset = () => {
    setSettings({
      hrWarningLow: 50,
      hrWarningHigh: 100,
      hrCriticalLow: 45,
      hrCriticalHigh: 120,
      hrDuration: 5,
      offlineMinutes: 15,
      escalationMinutes: 5,
      facilityName: 'Sunrise Senior Care Facility',
      facilityAddress: '123 Care Street, Medical City, ST 12345',
      facilityPhone: '(555) 123-4567',
    });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
            >
              <Undo2 className="w-5 h-5" />
              <span className="hidden md:inline">Reset</span>
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Save className="w-5 h-5" />
              <span className="hidden md:inline">Save Changes</span>
            </button>
          </div>
        </div>

        {/* Alert Thresholds */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Heart Rate Thresholds</h2>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Warning Low (bpm)
                </label>
                <input
                  type="number"
                  value={settings.hrWarningLow}
                  onChange={(e) => setSettings({ ...settings, hrWarningLow: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Trigger warning when HR drops below this value</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Warning High (bpm)
                </label>
                <input
                  type="number"
                  value={settings.hrWarningHigh}
                  onChange={(e) => setSettings({ ...settings, hrWarningHigh: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">Trigger warning when HR exceeds this value</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Critical Low (bpm)
                </label>
                <input
                  type="number"
                  value={settings.hrCriticalLow}
                  onChange={(e) => setSettings({ ...settings, hrCriticalLow: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
                <p className="text-xs text-slate-500 mt-1">Trigger critical alert when HR drops below this value</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Critical High (bpm)
                </label>
                <input
                  type="number"
                  value={settings.hrCriticalHigh}
                  onChange={(e) => setSettings({ ...settings, hrCriticalHigh: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500"
                />
                <p className="text-xs text-slate-500 mt-1">Trigger critical alert when HR exceeds this value</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Duration (minutes)
              </label>
              <input
                type="number"
                value={settings.hrDuration}
                onChange={(e) => setSettings({ ...settings, hrDuration: parseInt(e.target.value) })}
                className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">How long HR must be outside normal range before triggering alert</p>
            </div>
          </div>
        </div>

        {/* Device & Alert Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Device & Alert Settings</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Offline Threshold (minutes)
              </label>
              <input
                type="number"
                value={settings.offlineMinutes}
                onChange={(e) => setSettings({ ...settings, offlineMinutes: parseInt(e.target.value) })}
                className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Create offline incident if device hasn't transmitted for this duration</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Escalation Timer (minutes)
              </label>
              <input
                type="number"
                value={settings.escalationMinutes}
                onChange={(e) => setSettings({ ...settings, escalationMinutes: parseInt(e.target.value) })}
                className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Escalate critical alerts if unacknowledged for this duration</p>
            </div>
          </div>
        </div>

        {/* Facility Information */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Facility Information</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Facility Name
              </label>
              <input
                type="text"
                value={settings.facilityName}
                onChange={(e) => setSettings({ ...settings, facilityName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Address
              </label>
              <input
                type="text"
                value={settings.facilityAddress}
                onChange={(e) => setSettings({ ...settings, facilityAddress: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={settings.facilityPhone}
                onChange={(e) => setSettings({ ...settings, facilityPhone: e.target.value })}
                className="w-full md:w-64 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Confirmation Snackbar */}
      {showSaved && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Settings saved successfully</span>
        </div>
      )}
    </div>
  );
}
