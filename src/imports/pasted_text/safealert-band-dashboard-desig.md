Design a professional, modern, user-friendly web-based dashboard UI in Figma for a system called “SafeAlert Band”, an elderly monitoring and management platform for a home for the aged.

Overall design goals:
- Clean, minimal, healthcare-inspired interface
- Professional but warm and approachable
- Easy to navigate for admins, caregivers, and relatives
- Prioritize readability, monitoring clarity, and role-based access
- Desktop web dashboard layout
- Use card-based sections, clean spacing, rounded corners, soft shadows, and consistent typography
- Make the design feel like a real capstone/thesis system prototype, not a generic template

Create separate role-based interfaces:
1. Admin account
2. Caregiver account
3. Relative/Family account

Important global revision requirements:
- Remove the separate “Alerts” page entirely
- Replace “Settings” with “System Management”
- Make controls in System Management appear as dropdown/dialog style UI
- Make the Reports section more unique, meaningful, and insightful
- The interface should clearly show differences between Admin, Caregiver, and Relative roles
- Access should be based on assigned responsibility and role permissions

ADMIN DASHBOARD STRUCTURE

1. Main Dashboard page
Create a live monitoring dashboard that shows real-time resident monitoring.

Dashboard must include:
- Total residents count
- Active devices count
- Number of recent incidents
- Quick overview of residents needing extra care
- Hourly monitoring section
- Medication monitoring
- Admin task monitoring
- Resident monitoring updates per hour

Do not place alert cards in a separate Alerts page.
Instead, integrate important incident notifications inside the dashboard in a clean and organized way.

Dashboard layout suggestion:
- Top summary cards
- Center panel for live resident monitoring per hour
- Side panel for medications and admin tasks
- Lower section for recent incident highlights

2. Residents page
Redesign the Residents section.

Requirements:
- Remove visible resident status tags such as:
  - warning
  - critical
  - online
- Show residents as profile cards/boxes only
- Each card should include:
  - resident photo
  - name
  - age
  - room/section
  - short identifier
- Full information must only appear when a card is clicked
- Clicking a resident card opens a detailed side panel or modal with:
  - personal information
  - medical notes
  - monitoring data
  - assigned caregiver
  - incident history
  - medications
  - emergency contact

The visual style should make the residents page feel organized and less cluttered.

3. Devices page
For Admin only:
- Keep the Devices section, but make it cleaner and more practical
- Show:
  - device ID
  - assigned resident
  - battery status
  - device activity status
  - last sync
- Include add/register device button
- Use a neat table or card-table hybrid layout

4. Reports & Analytics page
This page must be redesigned to be more useful and unique.

Important revisions:
- Place “Recent Incidents” in the center of the page
- Remove:
  - response time
  - response time trend
- Add meaningful analytics such as:
  - residents with the highest number of fall incidents
  - residents most prone to accidents
  - residents needing extra care
  - critical cases summary
  - incident frequency trends by resident
  - top recurring health or safety issues
  - printable record/report section for family requests

Make the reports page visually richer and more unique.
Possible sections:
- Recent incidents center panel
- Left side: resident risk ranking
- Right side: care priority insights
- Lower section: printable reports / exportable summaries

This page should communicate care priorities, not just technical metrics.

5. Users page
Redesign the Users page.

Requirements:
- Each user must have:
  - profile photo
  - full name
  - role
  - personal information
- Use profile cards or table cards with expandable details
- Show assigned responsibilities where applicable

6. System Management page
Rename Settings to “System Management”.

Requirements:
- Use dropdown-based and dialog-based management controls
- Include sections like:
  - user role management
  - caregiver assignment
  - resident assignment
  - account controls
  - notification preferences
  - access control settings
- Make the interface feel administrative and organized

CAREGIVER ACCOUNT STRUCTURE

Design a separate caregiver interface with restricted and role-based access.

1. Caregiver Dashboard
Requirements:
- Show only specific tasks assigned to that caregiver
- Show assigned residents only
- Show medication reminders, monitoring duties, and scheduled care actions
- Include a clean task-focused dashboard layout

2. Caregiver Alerts behavior
There should be no separate Alerts page.
Instead:
- Show notifications only for residents assigned to that caregiver
- Alerts should be contextual and task-based

3. Caregiver Residents page
Requirements:
- Show only residents assigned to that caregiver
- Use profile cards
- Clicking card shows resident details relevant to the caregiver’s duties only

4. Caregiver Devices page
- Remove devices section entirely from caregiver interface

5. Caregiver Reports page
Requirements:
- Show reports only for residents assigned to that caregiver
- Include summaries of incidents, care actions, and patient monitoring relevant to their assignments only

RELATIVE / FAMILY ACCOUNT STRUCTURE

Design an additional relative/family account interface.

Purpose:
- Allow family members to check the condition, status, and records of their resident relative

Relative dashboard must include:
- Resident profile summary
- Health status summary
- Recent incidents
- Medication log
- Monitoring updates
- Emergency contact or caregiver info
- Read-only records view

Important:
- Relative account should be simple, clear, and read-only
- Focus on trust, transparency, and ease of understanding
- No admin/system management controls

DESIGN STYLE GUIDE

Visual style:
- Modern healthcare dashboard
- Soft, calm palette
- White, light gray, muted blue, teal, and subtle green accents
- Avoid overly dark or aggressive colors
- Professional capstone/thesis UI look

Typography:
- Clean sans-serif
- Strong section hierarchy
- Readable text for older-care-focused context

Components:
- Cards
- Tables
- Modals
- Dropdowns
- Tabs
- Side navigation
- Top navigation bar
- Status indicators where needed, but not on resident cards as warning/critical/online labels

Navigation structure:
Admin:
- Dashboard
- Residents
- Devices
- Reports & Analytics
- Users
- System Management

Caregiver:
- Dashboard
- Assigned Residents
- Reports

Relative:
- Dashboard
- Health Records
- Incident History
- Medication Log

Final output request:
Create a complete multi-page Figma UI concept for SafeAlert Band showing:
- Admin dashboard and pages
- Caregiver dashboard and pages
- Relative dashboard and pages

Make each role visually related but clearly different in permissions and content.
The final output should look polished, thesis-ready, role-based, and presentation-ready for a capstone defense.