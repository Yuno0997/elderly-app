# Elderly Care Monitoring App

## Project Overview

The Elderly Care Monitoring App is a facility-focused web platform for monitoring residents, managing incidents, tracking medications, and supporting coordination between administrators, caregivers, and family members.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)
- Recharts (analytics charts)

### Backend
- Node.js
- Express.js
- Zod (request validation)
- JWT (authentication)
- bcryptjs (password hashing)

### Database
- SQLite (local persistent database)

### Security and Access Control
- Role-based access control:
  - Admin
  - Caregiver
  - Relative/Family
- Protected API routes using Bearer tokens
- Password policy and first-login password change
- Session revoke/logout-all support

### Integration and Utilities
- UniSMS integration for SMS alert testing
- Local backup/restore utilities for SQLite

## Core Features

### 1. Authentication and User Management
- Secure login with JWT
- Admin bootstrap flow for first production admin
- User CRUD for admin (create, update role, activate/deactivate, reset password, delete)
- Profile security modal (change password and revoke sessions)

### 2. Resident Management
- Create, view, edit, and archive resident profiles
- Personal information management:
  - Date of birth
  - Computed age
  - Admitted date from actual creation timestamp
- Photo upload and crop support
- Caregiver assignment per resident

### 3. Real-Time Monitoring Dashboard
- Separate dashboards by role (admin, caregiver, relative)
- Live resident monitoring cards
- Active incident status visibility
- Caregiver task tracking (pending and completed)

### 4. Alert and Incident Handling
- Alert simulation for demo use:
  - Fall detected
  - Sleep anomaly
  - Unusual pulse
- Alert acknowledgment and resolution workflow
- Incident history page with status filtering
- Role-aware modal prompts for critical incidents

### 5. Medication Management
- Add medication schedules with controlled resident selection
- Medication status updates (Pending/Given)
- Event tracking for medication actions (assigned, pending, given)
- Unified visibility for admin/caregiver/family based on permissions
- Medication logs with actor and timestamp metadata

### 6. Caregiver Task Management
- Admin can assign care tasks to caregivers
- Tasks can be marked done/undone
- Task logs preserve completed activity history
- Dashboard now separates pending items from completed logs

### 7. Family Portal Features
- Family accounts linked to specific resident IDs
- Family resident selector for multi-linked access
- Read-only monitoring access for selected residents:
  - Incident history
  - Medication logs
  - Health records

### 8. Reports and Auditability
- Resident-level report view with health, incidents, and medication context
- Audit logs for critical system actions:
  - User changes
  - Resident changes
  - Device changes
  - Medication updates
  - Alert status changes

### 9. Device and System Management
- Device CRUD and assignment support
- Battery/status tracking
- System management panel for role assignments and linking workflows

### 10. Demo and Deployment Readiness
- Local dev setup with combined or split frontend/backend execution
- LAN and ngrok sharing options for presentation/demo
- Backup and restore runbook for operational reliability

## Current Project Strengths
- End-to-end role-based workflows
- Practical demo simulation tools for thesis presentation
- Strong traceability through audit and medication event logs
- Stable resident ID mapping and family data scoping
- PH timezone-consistent date/time display across UI

