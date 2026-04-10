import { useEffect, useState } from 'react';
import {
  X, Printer, Download, FileText, ChevronRight, Heart, Activity,
  Moon, AlertTriangle, Pill, ClipboardList, User as UserIcon,
  Calendar, Clock, CheckCircle2, XCircle, TrendingUp, Shield,
  FileDown, Share2, RotateCcw, BarChart2, Phone, Building2,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { UserRole } from '../App';
import { apiFetch } from '../lib/api';
import { formatPHDate, formatPHTime } from '../lib/time';

interface ResidentReportProps {
  resident: any;
  userRole: UserRole;
  onClose: () => void;
}

type IncidentRow = {
  date: string;
  time: string;
  type: string;
  severity: 'critical' | 'warning';
  acknowledgedBy: string;
  resolvedBy: string;
  responseDuration: string;
  notes: string;
};

type MedicationRow = {
  name: string;
  schedule: string;
  completed: number;
  total: number;
  missed: number;
  notes: string;
};

function buildReportData(resident: any, incidents: IncidentRow[], medications: MedicationRow[]) {
  const avgHR = Math.round(resident?.heartRate || 72);
  const unusualPulseAlerts = incidents.filter((i) => /hr|pulse/i.test(i.type)).length;
  const sleepAnomalyCount = incidents.filter((i) => /sleep/i.test(i.type)).length;
  return {
    healthSummary: {
      avgHR,
      highestPulse: avgHR + 15,
      lowestPulse: Math.max(avgHR - 15, 40),
      latestPulse: avgHR,
      latestStatus: 'Stable',
      unusualPulseAlerts,
      avgSleepDuration: 'N/A',
      sleepAnomalyCount,
      generalRemarks: incidents.length
        ? 'Report is generated from live incidents and medication records in the backend.'
        : 'No live incident records found for this resident in the selected period.',
    },
    incidents,
    medications,
    careNotes: resident?.notes?.length
      ? resident.notes.map((n: any) => ({
          date: formatPHDate(n.time || Date.now()),
          author: n.author || 'System',
          note: n.content || '',
        }))
      : [],
    pulseTrend: [
      { day: 'Mar 4', avg: 71, high: 89, low: 57 },
      { day: 'Mar 5', avg: 79, high: 118, low: 60 },
      { day: 'Mar 6', avg: 70, high: 85, low: 55 },
      { day: 'Mar 7', avg: 72, high: 90, low: 58 },
      { day: 'Mar 8', avg: 69, high: 82, low: 54 },
      { day: 'Mar 9', avg: 74, high: 91, low: 60 },
      { day: 'Mar 10', avg: 73, high: 95, low: 59 },
    ],
    incidentByType: [
      { type: 'Falls', count: 2, color: '#ef4444' },
      { type: 'HR High', count: 2, color: '#f59e0b' },
      { type: 'Sleep', count: 1, color: '#8b5cf6' },
      { type: 'HR Low', count: 0, color: '#64748b' },
    ],
    sleepTrend: [
      { day: 'Mon', hours: 5.5, anomaly: 0 },
      { day: 'Tue', hours: 6.8, anomaly: 0 },
      { day: 'Wed', hours: 6.2, anomaly: 0 },
      { day: 'Thu', hours: 4.9, anomaly: 1 },
      { day: 'Fri', hours: 7.1, anomaly: 0 },
      { day: 'Sat', hours: 6.5, anomaly: 0 },
      { day: 'Sun', hours: 6.0, anomaly: 0 },
    ],
    reportHistory: [],
    familyRequests: [],
  };
}

const REPORT_CATEGORIES = [
  { id: 'health', label: 'Health Monitoring Summary', icon: Heart },
  { id: 'incidents', label: 'Incident History', icon: AlertTriangle },
  { id: 'medications', label: 'Medication Logs', icon: Pill },
  { id: 'notes', label: 'Caregiver Notes', icon: ClipboardList },
  { id: 'sleep', label: 'Sleep Anomaly Records', icon: Moon },
  { id: 'pulse', label: 'Unusual Pulse Records', icon: Activity },
];

const STATUS_STYLES: Record<string, string> = {
  Stable: 'bg-green-100 text-green-700 border border-green-200',
  Warning: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  Critical: 'bg-red-100 text-red-700 border border-red-200',
  Offline: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-50 border-red-300 text-red-700',
  warning: 'bg-yellow-50 border-yellow-300 text-yellow-700',
};

export function ResidentReport({ resident, userRole, onClose }: ResidentReportProps) {
  const [liveIncidents, setLiveIncidents] = useState<IncidentRow[]>([]);
  const [liveMeds, setLiveMeds] = useState<MedicationRow[]>([]);
  const [dateRange, setDateRange] = useState('Monthly');
  const [reportType, setReportType] = useState('Comprehensive');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    REPORT_CATEGORIES.map(c => c.id)
  );
  const [generated, setGenerated] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [alertsRes, medsRes] = await Promise.all([apiFetch('/api/alerts'), apiFetch('/api/medications')]);
      if (alertsRes.ok) {
        const alerts = await alertsRes.json();
        const filtered = alerts
          .filter((a: any) => a.resident === resident.name)
          .map((a: any) => {
            const dt = new Date(a.timestamp || Date.now());
            return {
              date: formatPHDate(dt),
              time: formatPHTime(dt),
              type: a.type || 'Incident',
              severity: a.severity === 'critical' ? 'critical' : 'warning',
              acknowledgedBy: a.status === 'unacknowledged' ? 'Unacknowledged' : 'Care Team',
              resolvedBy: a.status === 'resolved' ? 'Care Team' : '-',
              responseDuration: '-',
              notes: `Status: ${a.status || 'unknown'}`,
            } as IncidentRow;
          });
        setLiveIncidents(filtered);
      }
      if (medsRes.ok) {
        const meds = await medsRes.json();
        const grouped = meds.filter((m: any) => m.resident === resident.name);
        setLiveMeds(
          grouped.map((m: any) => ({
            name: m.medication,
            schedule: m.time,
            completed: m.given ? 1 : 0,
            total: 1,
            missed: m.given ? 0 : 1,
            notes: 'Live medication log entry',
          }))
        );
      }
    };
    load();
  }, [resident.name]);

  const data = buildReportData(resident, liveIncidents, liveMeds);
  const generatedAt = 'April 3, 2026 · 10:45 AM';
  const period = dateRange === 'Daily' ? 'April 3, 2026' :
    dateRange === 'Weekly' ? 'Mar 28 – Apr 3, 2026' :
    dateRange === 'Monthly' ? 'March 2026' : 'Custom Range';

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    const rows = [
      ['Incident Date', 'Time', 'Type', 'Severity', 'Acknowledged By', 'Resolved By', 'Response Time', 'Notes'],
      ...data.incidents.map(i => [i.date, i.time, i.type, i.severity, i.acknowledgedBy, i.resolvedBy, i.responseDuration, `"${i.notes}"`]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resident.residentId}_incident_report.csv`;
    a.click();
  };

  const totalFalls = data.incidents.filter(i => i.type === 'Fall Detected').length;
  const criticalFalls = data.incidents.filter(i => i.type === 'Fall Detected' && i.severity === 'critical').length;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-100 flex flex-col overflow-hidden">
      {/* ─── Top Bar ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <span>Dashboard</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>Residents</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>{resident.name}</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-900 font-medium">Individual Report</span>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2">
            {userRole !== 'relative' && (
              <button
                onClick={() => setGenerated(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <FileText className="w-3.5 h-3.5" />
                Generate Report
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="ml-1 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Main Content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 flex gap-6">

          {/* ══ LEFT: Main Report Area ══════════════════════════════════ */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">

            {/* Page Title */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl font-bold text-slate-900">Individual Resident Report</h1>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES['Stable']}`}>
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                    Stable
                  </span>
                </div>
                <p className="text-sm text-slate-500">Generate printable and exportable health, monitoring, medication, and incident reports for this resident.</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-slate-400">Last updated</div>
                <div className="text-xs font-medium text-slate-600">April 2026</div>
              </div>
            </div>

            {/* ── Resident Summary Card ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-teal-500 px-5 py-4 flex items-center gap-5">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-xl font-bold text-white border-2 border-white/40 flex-shrink-0">
                  {resident.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white">{resident.name}</h2>
                  <p className="text-white/80 text-sm">{resident.age} years old · {resident.gender} · Room {resident.room}, {resident.section}</p>
                  <p className="text-white/60 text-xs font-mono mt-0.5">{resident.residentId}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs text-white/60 mb-1">Last Sync</div>
                  <div className="text-sm font-semibold text-white">Just now</div>
                  <div className="text-xs text-white/60 mt-1">Band: {resident.deviceId}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100">
                {[
                  { label: 'Assigned Caregiver', value: resident.caregiver, icon: UserIcon },
                  { label: 'Emergency Contact', value: resident.emergency?.split(' ·')[0] ?? 'N/A', icon: Phone },
                  { label: 'Device / Band ID', value: resident.deviceId, icon: Activity, mono: true },
                  { label: 'Health Status', value: 'Stable', icon: Shield, badge: true },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs text-slate-400 uppercase tracking-wide font-medium">{item.label}</span>
                      </div>
                      {item.badge ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />
                          {item.value}
                        </span>
                      ) : (
                        <div className={`text-sm text-slate-900 truncate ${item.mono ? 'font-mono' : ''}`}>{item.value}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Filter & Generation Controls ── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex flex-wrap gap-4 items-start">
                {/* Quick range */}
                <div className="flex-shrink-0">
                  <div className="text-xs text-slate-500 font-medium mb-1.5">Report Period</div>
                  <div className="flex gap-1">
                    {['Daily', 'Weekly', 'Monthly', 'Custom'].map(r => (
                      <button
                        key={r}
                        onClick={() => setDateRange(r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          dateRange === r
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Report type */}
                <div className="flex-shrink-0">
                  <div className="text-xs text-slate-500 font-medium mb-1.5">Report Type</div>
                  <select
                    value={reportType}
                    onChange={e => setReportType(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option>Comprehensive</option>
                    <option>Health Summary Only</option>
                    <option>Incident Report Only</option>
                    <option>Medication Log Only</option>
                  </select>
                </div>
                {/* Date range custom */}
                {dateRange === 'Custom' && (
                  <div className="flex gap-2 items-end">
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1.5">From</div>
                      <input type="date" defaultValue="2026-03-01" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium mb-1.5">To</div>
                      <input type="date" defaultValue="2026-04-03" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* Category checkboxes */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-500 font-medium mb-2">Include in Report</div>
                <div className="flex flex-wrap gap-2">
                  {REPORT_CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    const active = selectedCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.label}
                        {active && <CheckCircle2 className="w-3 h-3 ml-0.5 text-blue-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role notice */}
              {userRole === 'relative' && (
                <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2 text-sm text-teal-700">
                  <Shield className="w-4 h-4 flex-shrink-0" />
                  <span>You have read-only access. You may download and print this report.</span>
                </div>
              )}
              {userRole === 'caregiver' && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-sm text-blue-700">
                  <UserIcon className="w-4 h-4 flex-shrink-0" />
                  <span>You can generate and print reports for residents assigned to you.</span>
                </div>
              )}
            </div>

            {/* ── Printable Report Preview ── */}
            {generated && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Preview header label */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Printable Report Preview</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Ready</span>
                  </div>
                  <div className="text-xs text-slate-400">Selected period: <span className="font-medium text-slate-600">{period}</span></div>
                </div>

                <div className="p-6 space-y-8" id="report-preview">
                  {/* ── Report Document Header ── */}
                  <div className="border-b-2 border-slate-200 pb-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-teal-500 rounded-lg flex items-center justify-center">
                            <Activity className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">SafeAlert Band</div>
                            <div className="text-xs text-slate-400">Elderly Care Monitoring System</div>
                          </div>
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 mt-3">Individual Resident Health & Care Report</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Report Type: {reportType} · Period: {period}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400 mb-0.5">Generated</div>
                        <div className="text-sm font-semibold text-slate-700">{generatedAt}</div>
                        <div className="text-xs text-slate-400 mt-1 font-mono">{resident.residentId}</div>
                      </div>
                    </div>
                  </div>

                  {/* ── SECTION A: Patient Information ── */}
                  <ReportSection label="A" title="Patient / Resident Information" icon={UserIcon} iconColor="text-blue-600" bgColor="bg-blue-50">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      {[
                        { label: 'Full Name', value: resident.name },
                        { label: 'Age', value: `${resident.age} years old` },
                        { label: 'Sex / Gender', value: resident.gender },
                        { label: 'Room / Bed Number', value: `${resident.room} · ${resident.section}` },
                        { label: 'Assigned Caregiver', value: resident.caregiver },
                        { label: 'Attending Physician', value: 'Dr. Michael Chen' },
                        { label: 'Relative / Guardian', value: resident.emergency?.split(' ·')[0] ?? 'N/A' },
                        { label: 'Contact Information', value: resident.emergency?.split('·')[1]?.trim() ?? 'N/A' },
                        { label: 'Device ID / Band ID', value: resident.deviceId, mono: true },
                        { label: 'Resident ID', value: resident.residentId, mono: true },
                        { label: 'Admitted Date', value: resident.admittedDate },
                        { label: 'Primary Condition(s)', value: resident.condition },
                      ].map((item, i) => (
                        <div key={i} className="flex flex-col">
                          <span className="text-xs text-slate-400 uppercase tracking-wide font-medium">{item.label}</span>
                          <span className={`text-sm text-slate-900 mt-0.5 ${item.mono ? 'font-mono' : ''}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </ReportSection>

                  {/* ── SECTION B: Health Monitoring Summary ── */}
                  {selectedCategories.some(c => ['health', 'pulse', 'sleep'].includes(c)) && (
                    <ReportSection label="B" title="Health Monitoring Summary" icon={Heart} iconColor="text-red-500" bgColor="bg-red-50">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                        {[
                          { label: 'Average Heart Rate', value: `${data.healthSummary.avgHR} bpm`, color: 'text-slate-900' },
                          { label: 'Highest Pulse', value: `${data.healthSummary.highestPulse} bpm`, color: 'text-red-600' },
                          { label: 'Lowest Pulse', value: `${data.healthSummary.lowestPulse} bpm`, color: 'text-blue-600' },
                          { label: 'Latest Reading', value: `${data.healthSummary.latestPulse} bpm`, color: 'text-green-600' },
                          { label: 'Monitoring Status', value: data.healthSummary.latestStatus, color: 'text-green-600' },
                          { label: 'Unusual Pulse Alerts', value: `${data.healthSummary.unusualPulseAlerts} events`, color: 'text-amber-600' },
                          { label: 'Avg Sleep Duration', value: data.healthSummary.avgSleepDuration, color: 'text-indigo-600' },
                          { label: 'Sleep Anomaly Count', value: `${data.healthSummary.sleepAnomalyCount} anomaly`, color: 'text-purple-600' },
                        ].map((item, i) => (
                          <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <div className="text-xs text-slate-400 mb-1">{item.label}</div>
                            <div className={`text-sm font-semibold ${item.color}`}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1">General Remarks / Condition Summary</div>
                        <p className="text-sm text-slate-700 leading-relaxed">{data.healthSummary.generalRemarks}</p>
                      </div>
                    </ReportSection>
                  )}

                  {/* ── SECTION C: Incident History ── */}
                  {selectedCategories.includes('incidents') && (
                    <ReportSection label="C" title="Incident History" icon={AlertTriangle} iconColor="text-amber-500" bgColor="bg-amber-50">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                          <span className="text-xs text-red-600 font-medium">Total Falls: {totalFalls}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 border border-red-300 rounded-lg">
                          <span className="text-xs text-red-700 font-semibold">Critical Falls: {criticalFalls}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                          <span className="text-xs text-slate-600 font-medium">Total Events: {data.incidents.length}</span>
                        </div>
                        {/* Legend */}
                        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-sm inline-block" />Critical</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-400 rounded-sm inline-block" />Warning</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              {['Date & Time', 'Type', 'Severity', 'Acknowledged By', 'Resolved By', 'Response', 'Notes / Intervention'].map((h, i) => (
                                <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {data.incidents.map((inc, i) => (
                              <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <div className="text-sm text-slate-900">{inc.date}</div>
                                  <div className="text-xs text-slate-400">{inc.time}</div>
                                </td>
                                <td className="px-3 py-2.5 text-sm text-slate-800 whitespace-nowrap">{inc.type}</td>
                                <td className="px-3 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${SEVERITY_STYLES[inc.severity]}`}>
                                    {inc.severity}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{inc.acknowledgedBy}</td>
                                <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{inc.resolvedBy}</td>
                                <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{inc.responseDuration}</td>
                                <td className="px-3 py-2.5 text-xs text-slate-500 max-w-xs">{inc.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </ReportSection>
                  )}

                  {/* ── SECTION D: Medication & Care Logs ── */}
                  {selectedCategories.some(c => ['medications', 'notes'].includes(c)) && (
                    <ReportSection label="D" title="Medication and Care Logs" icon={Pill} iconColor="text-indigo-600" bgColor="bg-indigo-50">
                      {selectedCategories.includes('medications') && (
                        <>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Medication Schedule</div>
                          <div className="space-y-2 mb-5">
                            {data.medications.map((med, i) => (
                              <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <Pill className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-900">{med.name}</div>
                                  <div className="text-xs text-slate-500">{med.schedule}</div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" />{med.completed} completed</span>
                                    <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{med.missed} missed</span>
                                  </div>
                                  <div className="w-24 h-1.5 bg-slate-200 rounded-full mt-1 ml-auto">
                                    <div
                                      className="h-1.5 bg-green-500 rounded-full"
                                      style={{ width: `${(med.completed / med.total) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {selectedCategories.includes('notes') && (
                        <>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Caregiver Task Logs & Care Notes</div>
                          <div className="space-y-2">
                            {data.careNotes.map((note, i) => (
                              <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-semibold text-slate-700">{note.author}</span>
                                  <span className="text-xs text-slate-400">{note.date}</span>
                                </div>
                                <p className="text-sm text-slate-600">{note.note}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </ReportSection>
                  )}

                  {/* ── SECTION E: Trends & Analytics ── */}
                  <ReportSection label="E" title="Trends and Analytics" icon={TrendingUp} iconColor="text-teal-600" bgColor="bg-teal-50">
                    {/* Summary stat cards */}
                    <div className="grid grid-cols-3 gap-3 mb-5">
                      {[
                        { label: 'Total Incidents', value: data.incidents.length, sub: 'Reporting period', color: 'bg-red-50 border-red-100 text-red-700' },
                        { label: 'Medications Compliance', value: '90.3%', sub: '84 of 90 doses', color: 'bg-green-50 border-green-100 text-green-700' },
                        { label: 'Avg Pulse (7-day)', value: `${data.healthSummary.avgHR} bpm`, sub: 'Within normal range', color: 'bg-blue-50 border-blue-100 text-blue-700' },
                      ].map((stat, i) => (
                        <div key={i} className={`rounded-lg border p-3 ${stat.color}`}>
                          <div className="text-sm font-semibold">{stat.label}</div>
                          <div className="text-xl font-bold mt-1">{stat.value}</div>
                          <div className="text-xs opacity-70 mt-0.5">{stat.sub}</div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Pulse Trend */}
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-red-400" />
                          Pulse Rate Trend (7-Day)
                        </div>
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.pulseTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[40, 130]} />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                formatter={(v: any) => [`${v} bpm`]}
                              />
                              <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Avg" />
                              <Line type="monotone" dataKey="high" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="High" />
                              <Line type="monotone" dataKey="low" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Low" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-1">
                          {[
                            { color: '#3b82f6', label: 'Avg' },
                            { color: '#ef4444', label: 'High' },
                            { color: '#64748b', label: 'Low' },
                          ].map(l => (
                            <span key={l.label} className="flex items-center gap-1 text-xs text-slate-500">
                              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: l.color }} />
                              {l.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Incident Count by Type */}
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          Incident Count by Type
                        </div>
                        <div className="h-44">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.incidentByType} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="type" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                formatter={(v: any) => [`${v} events`]}
                              />
                              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {data.incidentByType.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Sleep Anomaly Frequency */}
                      <div className="md:col-span-2">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-indigo-400" />
                          Sleep Duration & Anomaly Frequency (Weekly)
                        </div>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.sleepTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 9]} />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                              />
                              <Bar dataKey="hours" name="Sleep Hours" fill="#818cf8" radius={[4, 4, 0, 0]} opacity={0.85}>
                                {data.sleepTrend.map((entry, i) => (
                                  <Cell key={i} fill={entry.anomaly ? '#7c3aed' : '#818cf8'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="w-3 h-3 bg-indigo-400 rounded-sm inline-block" />
                            Normal Night
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="w-3 h-3 bg-violet-700 rounded-sm inline-block" />
                            Sleep Anomaly Detected
                          </span>
                        </div>
                      </div>
                    </div>
                  </ReportSection>

                  {/* ── SECTION F: Report Footer ── */}
                  <div className="border-t-2 border-slate-200 pt-5">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        {[
                          { label: 'Generated By', value: userRole === 'admin' ? 'Administrator' : userRole === 'caregiver' ? resident.caregiver : 'Family / Relative' },
                          { label: 'Generated On', value: generatedAt },
                          { label: 'Resident ID', value: resident.residentId, mono: true },
                          { label: 'Report Period', value: period },
                        ].map((item, i) => (
                          <div key={i} className="flex gap-3 text-sm">
                            <span className="text-slate-400 w-32 flex-shrink-0">{item.label}:</span>
                            <span className={`text-slate-700 font-medium ${item.mono ? 'font-mono' : ''}`}>{item.value}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2">Reviewed By</div>
                        <div className="border-b border-slate-300 w-48 mb-1" />
                        <div className="text-xs text-slate-400">Authorized Signature</div>
                        <div className="mt-4 text-xs text-slate-400">
                          <div className="border-b border-slate-300 w-48 mb-1" />
                          <div>Date</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <p className="text-xs text-slate-400">
                        This report is system-generated by <span className="font-semibold text-slate-600">SafeAlert Band</span> — IoT-Based Elderly Care Monitoring System. 
                        For official documentation purposes only. Data reflects monitoring period: <span className="font-medium">{period}</span>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══ RIGHT: Utility Sidebar ══════════════════════════════════ */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-4">

            {/* Quick Export */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Quick Export</div>
              <div className="space-y-2">
                {[
                  { label: 'Export as PDF', icon: FileDown, onClick: handlePrint, color: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200' },
                  { label: 'Download CSV', icon: Download, onClick: handleExportCSV, color: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200' },
                  { label: 'Print Report', icon: Printer, onClick: handlePrint, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200' },
                  { label: 'Share (Coming Soon)', icon: Share2, onClick: () => {}, color: 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-60' },
                ].map((btn, i) => {
                  const Icon = btn.icon;
                  return (
                    <button
                      key={i}
                      onClick={btn.onClick}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${btn.color}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Report History */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Previous Reports</div>
              </div>
              <div className="space-y-2">
                {data.reportHistory.map((rep, i) => (
                  <div key={i} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 truncate">{rep.type}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{rep.date}</div>
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0">{rep.pages}p</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      {rep.generatedBy}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Family Request Log */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Family Requests</div>
              </div>
              <div className="space-y-2">
                {data.familyRequests.map((req, i) => (
                  <div key={i} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="text-xs font-medium text-slate-800 truncate">{req.type}</div>
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium flex-shrink-0">
                        {req.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{req.requestedBy} · {req.date}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resident Quick Stats */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Quick Stats</div>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Total Incidents', value: data.incidents.length, color: 'text-red-600' },
                  { label: 'Active Medications', value: data.medications.length, color: 'text-indigo-600' },
                  { label: 'Sleep Anomalies', value: data.healthSummary.sleepAnomalyCount, color: 'text-purple-600' },
                  { label: 'Pulse Alerts', value: data.healthSummary.unusualPulseAlerts, color: 'text-amber-600' },
                  { label: 'Days Monitored', value: 79, color: 'text-teal-600' },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{stat.label}</span>
                    <span className={`text-sm font-bold ${stat.color}`}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Facility Info */}
            <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-3.5 h-3.5 text-slate-300" />
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Facility</div>
              </div>
              <div className="text-sm font-semibold text-white">Sunrise Care Center</div>
              <div className="text-xs text-slate-400 mt-0.5">123 Eldercare Drive, Manila</div>
              <div className="text-xs text-slate-400 mt-3">
                <span className="text-slate-300">System: </span>SafeAlert Band v2.1
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                <span className="text-slate-300">Report ID: </span>
                <span className="font-mono">RPT-{resident.residentId}-{new Date().getMonth() + 1}{new Date().getFullYear()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────
function ReportSection({ label, title, icon: Icon, iconColor, bgColor, children }: {
  label: string;
  title: string;
  icon: any;
  iconColor: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`flex items-center gap-3 mb-4 pb-2.5 border-b border-slate-200`}>
        <div className={`w-7 h-7 ${bgColor} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <div>
          <span className="text-xs text-slate-400 font-medium">Section {label}</span>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      {children}
    </div>
  );
}
