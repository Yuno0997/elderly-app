Add the following missing features and interface components to the SafeAlert Band web application design.

ADMIN ADDITIONS

1. Residents Module – Undo Archive Feature
Add an Undo Archive function for archived residents.

Requirements:
- When the admin archives a resident, show a confirmation dialog first
- After archiving, display a success toast/snackbar with an “Undo” action
- Add an “Archived Residents” section or tab
- Inside Archived Residents, provide a “Restore Resident” button
- The design should make it easy for the admin to recover residents who were archived by mistake
- Keep the interaction clean, simple, and user-friendly

Suggested UI elements:
- Archive button on resident profile
- Confirmation modal:
  - Title: Archive Resident?
  - Message: Are you sure you want to archive this resident profile?
  - Buttons: Cancel / Confirm
- Success toast:
  - “Resident archived successfully”
  - Undo action button
- Archived Residents page or panel with:
  - resident profile card
  - archived date
  - restore button

2. System Management – Assigning of Tasks to Caregivers
Add a caregiver task assignment feature inside System Management.

Requirements:
- Admin must be able to assign specific tasks to caregivers
- Task assignment must include:
  - caregiver name
  - assigned resident/s
  - task type
  - date and time
  - priority level
  - optional notes/instructions
- This section should support role-based workflow and clearly show assigned responsibility
- Use dropdowns, dialog boxes, and structured forms
- The design should feel organized and administrative

Suggested task types:
- medication assistance
- hourly monitoring
- wellness check
- fall incident response
- sleep monitoring follow-up
- meal assistance

Suggested UI layout:
- System Management page
- subsection: Caregiver Task Assignment
- components:
  - caregiver dropdown
  - resident multi-select dropdown
  - task type dropdown
  - schedule picker
  - priority selector
  - notes field
  - assign task button
- include a table or card list of existing caregiver assignments

MODAL ADDITIONS

3. Sleep Anomaly Detection Modal
Add a dedicated modal design for sleep anomaly detection.

Purpose:
- Notify admin or caregiver when unusual sleep behavior is detected

Modal content:
- Title: Sleep Anomaly Detected
- Resident name
- Timestamp
- Summary of detected anomaly
- Assigned caregiver
- Current resident status
- Recommended action

Buttons:
- View Resident Details
- Acknowledge
- Assign Follow-Up

Style:
- clean alert modal
- serious but not overly alarming
- readable hierarchy
- suitable for healthcare monitoring context

4. Unusual Pulse Rate Detected Modal
Add a dedicated modal design for unusual pulse rate detection.

Purpose:
- Notify admin or caregiver when abnormal pulse rate is detected

Modal content:
- Title: Unusual Pulse Rate Detected
- Resident name
- Current pulse rate
- Normal threshold reference
- Timestamp
- Assigned caregiver
- Suggested next action

Buttons:
- View Monitoring Data
- Acknowledge
- Mark for Follow-Up

Style:
- professional healthcare alert modal
- clean layout with strong emphasis on key health data
- easy to understand at a glance

ROLE-BASED BEHAVIOR
- Admin should see all archive and restore controls
- Admin should manage caregiver task assignment
- Caregiver should only see task assignments relevant to them
- Alert modals should appear only to the appropriate assigned role when relevant

DESIGN CONSISTENCY
- Keep the same SafeAlert Band visual style
- Maintain clean healthcare dashboard design
- Use consistent cards, modals, dropdowns, and typography
- Make the added features feel fully integrated into the existing system
- Ensure the final design remains thesis-ready and presentation-ready