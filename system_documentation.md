# System Documentation: Elderly Care Monitoring Web App

**Organization:** Real I - Immaculate Conception Elderly Home Care Services

---

## 1. System Scope

**What is the application?**
The application is a comprehensive web-based elderly care and health monitoring system. It is designed to digitize and centralize the operational workflow of an elderly care facility. The system integrates directly with IoT hardware (the "SafeAlert Band") to provide real-time health vitals tracking and automated emergency alert generation.

**Who is it built for?**
The system is built specifically for **Real I - Immaculate Conception Elderly Home Care Services**. 

**How does a user interact with it?**
Interaction depends on the user's assigned role:
*   **Admin:** Has unrestricted access to the entire system. Interacts via a web dashboard to manage all user accounts (caregivers, family members), configure IoT devices, generate facility-wide reports, audit system logs, and oversee all resident data.
*   **Caregiver:** Interacts with the system primarily to log daily care tasks. Uses the dashboard to monitor the real-time vitals of assigned residents, acknowledge and resolve emergency alerts (falls, abnormal heart rates, sleep anomalies), administer and log medications, and update health/incident records.
*   **Family Members (Outside the facility):** Interacts with a restricted view of the application. They can only view the profile, current status, real-time vitals, and care updates specifically for their assigned relative(s), providing peace of mind without compromising the privacy of other residents.

---

## 2. Functional Requirements Matrix

Below is the explicitly defined list of interactive features and functionalities within the application.

### Authentication & Authorization
1. Submitting the login form with valid credentials must authenticate the user and redirect them to the Dashboard.
2. The system must enforce role-based access control, hiding restricted sidebar menus from non-admin users.
3. The system must automatically log the user out if their session expires or if a global unauthorized event occurs.
4. Attempting to log in with an incorrect password more than 10 times within 15 minutes must temporarily lock the IP address.
5. Users flagged with `must_change_password` must be forced to update their password via a security modal before accessing the system.

### Dashboard & Real-Time Monitoring
6. The Dashboard must display a real-time list of residents and their current IoT band vitals (Heart Rate, Accelerometer, Sleep Status, Battery).
7. Receiving a critical hardware event (e.g., Fall Detection, Sleep Anomaly, Unusual Pulse) must immediately trigger a high-priority modal overlay with an audible chime.
8. The system must show vitals as "Offline" or "Stale" if the IoT band stops transmitting data for a specified threshold.
9. Clicking on a resident card must open their detailed profile view.
10. The system must display a global "Connection Banner" if the backend server becomes unreachable.

### Resident Management
11. Clicking 'Add Resident' must open a wizard modal allowing staff to input demographic data, medical history, and emergency contacts.
12. Submitting the resident form must save the resident to the database and immediately update the residents list.
13. The resident profile must allow staff to assign or reassign a specific caregiver.
14. The system must allow users to upload, crop, and set a profile photo for a resident.
15. Archiving a resident must hide them from active monitoring views while preserving their historical data.

### IoT Device Management
16. The Devices tab must list all registered SafeAlert bands, showing their MAC Address/Device ID, battery level, and current online status.
17. The system must allow an Admin to pair a specific IoT band to a specific resident.
18. If a band's battery drops below 20%, the system must automatically generate a "Low Battery" warning alert.

### Medication Management
19. Submitting a new medication schedule must log the prescription and add it to the daily queue.
20. When adding a new medication, the system must cross-check the drug name against the resident's recorded allergies and display a warning if a conflict exists.
21. Clicking the checkbox next to a scheduled medication must mark it as 'Given' and record the timestamp.
22. The backend must automatically flag medications as "Missed" and trigger an alert if they are not marked 'Given' within a configurable window (e.g., 30 minutes past due).
23. The medication interface must allow multi-selection of items for bulk actions.

### Health Records & Incident History
24. Users must be able to submit text-based incident reports (e.g., injuries, behavioral notes) that are timestamped and tied to a resident.
25. Users must be able to log daily health metrics (e.g., manual blood pressure readings, weight) into the resident's historical health record.

### Tasks & To-Do List
26. The system must provide a daily care task checklist assigned to caregivers.
27. Clicking a task checkbox must toggle its completion status and sync the state to the database.

### Reports & Exporting
28. The system must generate a "Shift Handover" report summarizing alerts, medications, and tasks over a selected timeframe.
29. Clicking 'Export to PDF' (or CSV) on a report must generate and download the respective file containing the displayed data.

### User Management (Admin Only)
30. The Admin must be able to create new user accounts, assigning them a role of Admin, Caregiver, or Relative.
31. When creating a 'Relative' account, the Admin must be able to link the account to one or more specific residents.
32. The Admin must be able to trigger a password reset for a user, generating a temporary password.
33. The system must block the deletion of a user if they currently have active residents or tasks assigned to them.

### System Settings & Audit Logs (Admin Only)
34. The Audit Log must record and display a chronological history of sensitive system actions (e.g., user logins, resident creations).
35. The system must allow the Admin to clear routine alerts and tasks, but must protect the core Audit Log from being deleted.
36. The System Management view must allow Admins to configure global variables.

### Alert Simulation (Testing Tool)
37. Clicking 'Simulate Fall' in the Alert Simulation panel must immediately trigger a mock fall event on the dashboard.
38. Clicking 'Simulate Sleep Anomaly' or 'Simulate Pulse' must trigger their respective mock alerts to verify UI responsiveness.
