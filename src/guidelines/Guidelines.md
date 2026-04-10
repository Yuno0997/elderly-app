# SafeAlert Band — Design & Implementation Guidelines

## Overview
SafeAlert Band is a web-based elderly care monitoring platform with three role-based interfaces. This document captures all design decisions, patterns, and constraints applied during development.

---

## Role-Based Access

### Admin
- Full access to all screens: Dashboard, Residents, Devices, Reports & Analytics, Users, System Management, Audit Log
- Critical Fall Modal enabled
- Sleep Anomaly Detection Modal enabled
- Unusual Pulse Rate Modal enabled
- Can add/archive residents, manage users, configure system settings
- Can assign tasks to caregivers

### Caregiver
- Restricted view: Dashboard (assigned residents only), Assigned Residents, Reports
- **No Devices page** — removed per design spec
- Dashboard shows only residents assigned to that caregiver
- Alerts shown contextually (only for their assigned residents)
- Critical Fall Modal enabled
- Sleep Anomaly Detection Modal enabled
- Unusual Pulse Rate Modal enabled

### Relative / Family Member
- Read-only interface: Dashboard (resident overview), Health Records, Incident History, Medication Log
- Dashboard shows a dedicated family-facing view for their linked resident
- No admin controls, no critical modal, no bell icon
- All data is presented in a transparent, easy-to-understand format

---

## Navigation Structure

### Admin Nav (Sidebar)
- Dashboard
- Residents
- Devices
- Reports & Analytics
- **[Admin Tools section]**
- Users
- System Management *(renamed from "Settings")*
- Audit Log

### Caregiver Nav
- Dashboard
- Assigned Residents
- Reports

### Relative Nav
- Dashboard
- Health Records
- Incident History
- Medication Log

---

## Key Design Decisions

### 1. Alerts Removed as Separate Page
Per design spec, there is **no separate Alerts page**. All incident notifications are integrated directly into the Dashboard:
- Admin: Active Incidents panel in the right sidebar of Dashboard
- Caregiver: Contextual alerts section showing only alerts for their assigned residents
- Alerts follow lifecycle: Unacknowledged → Acknowledged → Resolved

### 2. Residents Page — No Visible Status Tags
Resident cards on the Residents page **do not show** warning/critical/online status badges. Cards are clean profile cards showing:
- Gradient avatar with initials
- Name, age, gender
- Room number and section
- Resident ID (monospace)

**Clicking a card opens a full detail side panel** (slides in from right) with tabs:
- Personal Info, Monitoring, Medications, Incidents, Notes, Contacts

### 3. System Management (replaces Settings)
- Dropdown/accordion style — each section is a collapsible panel
- Sections: User Role Management, Caregiver & Resident Assignment, Caregiver Task Assignment, Notification Preferences, Access Control, Alert Thresholds, Facility Settings
- Dialog popups used for assignment actions
- All controls use `<select>` dropdowns, toggles, or dialog confirmations — not raw number inputs
- Caregiver Task Assignment allows admins to assign specific tasks (medication assistance, hourly monitoring, wellness check, fall incident response, sleep monitoring follow-up, meal assistance) with priority levels and scheduling

### 4. Reports — Care-Focused Analytics
- **Removed**: Response Time metric and Response Time Trend chart
- **Added**:
  - Resident Risk Ranking (sorted by incident count, with risk level badges)
  - Care Priority Insights (care notes for high/medium risk residents)
  - Incident Frequency by Resident (stacked bar chart using recharts)
  - Incident Type Breakdown (pie chart)
  - Incident Frequency Trend (monthly bar chart)
  - Printable Report section with CSV export and print button

### 5. Users Page — Profile Card Layout
- Grid of profile cards (not just a table)
- Each card shows: avatar, name, role badge, department, assigned responsibilities
- Click "View" to open detail modal with full information
- Supports Admin, Caregiver, and Relative/Family roles

### 6. Residents Page — Archive & Restore
- Admin can archive residents with confirmation dialog
- After archiving, a 5-second "Undo" toast appears
- Toggle "Archived" button to view archived residents
- Archived residents can be restored via confirmation dialog
- Clean, user-friendly workflow prevents accidental data loss

### 7. Alert Modals (Admin & Caregiver Only)
Three types of alert modals appear automatically during monitoring:

**Critical Fall Modal** (12 seconds after login)
- Blocking modal with red accent for fall detection events
- Shows resident info, location, timestamp
- Action buttons: Acknowledge, View Resident, Dispatch Response

**Sleep Anomaly Detection Modal** (25 seconds after login)
- Indigo/purple accent for sleep pattern alerts
- Displays anomaly type, timestamp, current status, recommended action
- Shows assigned caregiver
- Action buttons: View Resident Details, Acknowledge, Assign Follow-Up

**Unusual Pulse Rate Modal** (40 seconds after login)
- Dynamic color (red for elevated, orange for low pulse)
- Large display of current pulse rate vs. normal range
- Visual trend indicator
- Suggested next action prominently displayed
- Action buttons: View Monitoring Data, Acknowledge, Mark for Follow-Up

All modals follow professional healthcare design with clear visual hierarchy and easy-to-understand layouts suitable for quick decision-making.

---

## Visual Style

### Color Palette
- Background: `slate-50` (main app bg), `white` (cards)
- Primary action: `blue-600` / `teal-500` (gradient brand)
- Admin accent: `purple`
- Caregiver accent: `blue`
- Relative accent: `teal`
- Critical: `red-500/600`
- Warning: `yellow-400/500`
- Stable/OK: `green-500/600`
- Offline/Inactive: `slate-400`

### Typography
- All headings use Tailwind classes explicitly on component level
- Section titles: `font-semibold text-slate-900`
- Body text: `text-slate-700` / `text-slate-600`
- Helper text: `text-slate-500` / `text-slate-400`
- Monospace IDs: `font-mono`

### Card Style
- `rounded-xl` with `border border-slate-200 shadow-sm`
- Hover states: `hover:shadow-md hover:border-blue-200`
- Role-specific accented panels use gradient backgrounds

---

## Data & Simulation

- All data is mock/simulated — no backend connection
- Heart rate updates every 3 seconds via `setInterval` (±5 bpm random walk)
- Connection status randomly drops for 3 seconds (5% chance every 10s)
- Critical Fall Modal appears 12 seconds after login (admin/caregiver only)
- Sleep Anomaly Detection Modal appears 25 seconds after login (admin/caregiver only)
- Unusual Pulse Rate Modal appears 40 seconds after login (admin/caregiver only)
- Residents assigned to Nurse Emily Chen: Margaret Wilson, Robert Anderson, Mary Garcia, Patricia Davis
- Residents assigned to Nurse Jessica Brown: Dorothy Martinez, James Thompson, William Brown, John Miller
- Relative account (Sarah Wilson) is linked to Margaret Wilson (RES-1000)

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@safealert.com | admin |
| Caregiver | caregiver@safealert.com | caregiver |
| Relative/Family | relative@safealert.com | relative |

Quick-fill buttons on the Login page allow one-click demo access.

---

## File Structure
```
/App.tsx                      — Root, auth state, routing
/components/
  Login.tsx                   — Login page with 3 demo accounts
  Dashboard.tsx               — Role-specific dashboard (Admin/Caregiver/Relative)
  Residents.tsx               — Profile card grid + detail side panel + archive/restore
  Devices.tsx                 — Admin: device management table (admin only)
  Reports.tsx                 — Risk ranking, incidents, care priority, charts
  Users.tsx                   — Profile card grid + detail modal
  SystemManagement.tsx        — Dropdown accordion settings + task assignment
  AuditLog.tsx                — Admin audit log table
  HealthRecords.tsx           — Relative: HR charts + sleep quality (read-only)
  IncidentHistory.tsx         — Relative: incident timeline (read-only)
  MedicationLog.tsx           — Relative: medication schedule + compliance (read-only)
  Header.tsx                  — Top bar, role badge, bell icon (hidden for relative)
  Sidebar.tsx                 — Role-aware sidebar navigation
  BottomNav.tsx               — Mobile bottom navigation (role-aware)
  CriticalFallModal.tsx       — Blocking modal for critical fall events
  SleepAnomalyModal.tsx       — Alert modal for sleep pattern anomalies
  UnusualPulseModal.tsx       — Alert modal for abnormal pulse rates
  ConnectionBanner.tsx        — "Connection lost" top banner
  ui/                         — Shared UI components (StatusBadge, etc.)
```