# ORGanIZE

Student Organization Management System for the Laguna State Polytechnic University —
Office of Student Affairs and Services (LSPU-OSAS). Handles organization profiles and
hierarchy, the recognition & renewal lifecycle, role-based accounts, official deadlines,
and a full audit trail.

## Tech stack

- **Next.js 16** (App Router, Server Actions, Turbopack) + React 19 + TypeScript
- **PostgreSQL 16** via **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Tailwind CSS v4**, lucide-react icons
- DB-backed sessions (httpOnly cookie, sha256-hashed tokens, 7-day TTL)

## Getting started

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Configure `.env` (already present for local dev):

   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/organize"
   SESSION_COOKIE_NAME="organize_session"
   ```

3. Apply migrations and seed demo data:

   ```powershell
   npx prisma migrate dev
   npm run db:seed
   ```

4. Run:

   ```powershell
   npm run dev        # development (Turbopack)
   npm run build      # production build (runs prisma generate first)
   npm run start      # production server on :3000
   ```

## Demo accounts

All demo accounts use the password **`Password123!`**

| Email | Role |
| --- | --- |
| osas@lspu.edu.ph | OSAS Administrator |
| soa@lspu.edu.ph | SOA Administrator |
| dean.ccs@lspu.edu.ph | College Dean (CCS) |
| adviser.regular@lspu.edu.ph | Regular Faculty Adviser |
| adviser.parttime@lspu.edu.ph | Part-Time Faculty Adviser |
| president.acs@lspu.edu.ph | Organization President (ACS) |
| secretary.jpia@lspu.edu.ph | Organization Secretary (JPIA) |
| member1.acs@lspu.edu.ph | Organization Member (ACS) |

## Architecture notes

- **RBAC** — every mutation is a Server Action guarded by
  `requirePermissionOrThrow(...)` (`src/lib/auth/rbac.ts`). The UI hides actions, but
  the backend always re-checks permissions and record scope.
- **Scoping** — deans see only their college; advisers only assigned organizations;
  officers only their own organizations (`orgScopeWhere` / `scopedOrgWhere`).
- **Recognition lifecycle** — DRAFT → SUBMITTED → UNDER_REVIEW → FOR_APPROVAL →
  APPROVED → RECOGNIZED, with RETURNED / REJECTED branches. Transitions are enforced
  server-side in `src/lib/actions/recognition.ts`; conferral is OSAS-only.
- **Derived org state** — Recognized / Pending Renewal / Expired / Inactive / Rejected /
  Active is computed from recognition history in `src/lib/org-state.ts`, never stored.
- **Audit trail** — every significant action is recorded with actor, IP, user agent,
  and before/after state (`src/lib/audit.ts`).
- **Middleware** — Next 16 uses `src/proxy.ts` (Node runtime) for an optimistic cookie
  check; real auth happens in server components/actions.
- **Prisma 7 client** — generated to `src/generated/prisma` (gitignored) and requires
  the pg driver adapter (`src/lib/db.ts`).

## Project layout

```
prisma/            schema, migrations, seed
src/app/(auth)/    login
src/app/(app)/     authenticated area (dashboard, organizations, recognition,
                   deadlines, users, colleges, audit-log, profile)
src/components/    UI kit + shell + form helpers
src/lib/           db, auth, rbac, audit, org-state, deadlines, nav, server actions
```

## Status

Core foundation complete: auth + RBAC, colleges/departments, organizations with
mother/child hierarchy, recognition & renewal workflow, deadlines, role-aware
dashboards, audit log, profile & password management, seed data.

Also included:

- **Activity proposals** — officers file proposals (organization/college/
  university scope), current adviser endorses, dean approves college-scope
  activities and OSAS/SOA approve university-wide ones; returned/rejected
  proposals carry reviewer notes.
- **Accomplishment reports** — linked to approved proposals or filed as
  unplanned activities; accepting a report automatically marks the linked
  activity completed. Full audit history on every record.
- **Attachments** — PDF/image/Word files (≤10 MB) can be attached to
  recognition applications, activity proposals, and accomplishment reports.
  Files live outside the web root; every download re-checks record scoping.
- **Excel exports** — `/export/*.xlsx` alongside the CSV endpoints, same
  scoping and audit trail.
- **Form Library** (sidebar → Form Library, `/forms`) — print-perfect A4
  replicas of all six official OSAS forms served outside the app shell
  (`/forms/sf-001…006`), each pre-filled from system data with every remaining
  blank editable before printing via `window.print()`. Canonical numbering
  follows the DOCX footers: SF-001 application letter (+CHED checklist),
  SF-002 renewal letter, SF-003 adviser commitment, SF-004 plan of activities
  (one activity per page with Add button), SF-005 member roster with 1×1 photo
  boxes (officers-only; photos pending profile-picture feature), SF-006 dean's
  certification. Opening a form without an organization shows a picker.
- **Activity monitoring & evaluation** (`/monitoring`, all roles scoped to
  their organizations) — live plan-of-activities pipeline per org (planned /
  approved / completed / returned), fixed evaluation rules flagging activities
  that ended without an accomplishment report, campus budget utilization
  (actual vs estimated), attendance capture rates, and a printable
  system-generated monitoring report per organization for OSAS records.
- **Analytics dashboard** (OSAS/SOA/Deans, college-scoped) — the five-layer
  model from the proposal, fully implemented: descriptive (membership,
  officer ratios, recognition status, SF-001 requirements-checklist
  completion %, financial compliance, plan-of-activities status), diagnostic
  (most-missed/late requirement documents, workflow stage durations, most
  returned/rejected), trend (per-cycle comparisons with % change),
  rule-based alerting ("At Risk" = 2+ unmet requirements within 7 days of a
  deadline, including individually tagged checklist documents), and fixed
  prescriptive recommendations. Officers tag each recognition attachment
  with the SF-001 checklist item it satisfies on upload.
  model from the capstone proposal: descriptive indicators (membership,
  officer ratios, recognition status, plan-of-activities and report
  completion), diagnostic breakdowns (most returned/rejected requirement
  types, average days per signatory stage), trend charts across academic
  years with cycle-over-cycle change, rule-based risk alerting ("At Risk"
  when an organization has two or more unmet requirements within 7 days of
  a deadline), and rule-based prescriptive recommendations selected from a
  fixed action set. Statistical and rule-based only — no ML.
- **Attendance & participation** — activity detail pages carry an attendance
  roster (per academic year) with manual marking (present / late / absent /
  excused, with remarks) and a QR check-in window: officers open it, members
  scan and confirm, arriving after the scheduled start records LATE. The
  window auto-closes 24 hours after the activity ends.
- **Activity calendar** — month/week/day views with organization and search
  filters. Overlapping activities sharing a venue (or an organization) are
  flagged as scheduling conflicts. Drafts and rejected proposals stay private.
- **Forced password change** — accounts created or reset by an admin carry a
  temporary password and are routed through `/change-password` until they set
  their own.
- **CSV exports** — `/export/organizations` and `/export/recognitions` (OSAS, SOA,
  deans only; rows respect record scoping; every export is audited).

- **Deadline notifications & alerts (Part 9)** — in-app notification
system (/notifications, bell badge with unread count in the topbar).
Creating or materially updating an OSAS deadline automatically notifies
every covered organization's officers and advisers; review decisions on
accreditation applications, activity proposals, and accomplishment reports
(reported, returned, approved, rejected, conferred) alert the organization's
president and secretary. Delivery is in-app by design; email is a documented
future extension.

- **Document repository (Part 7B)** — per-organization repository at
`/organizations/[id]/documents` (linked from the org profile header). Shows
the seven SF-001 requirements for any academic year with submitted/missing
status, downloadable files per slot, accomplishment-report evidence links,
untagged supporting documents with re-tagging, and a scoped upload panel.
Access mirrors attachment rules: admins campus-wide, deans in-college,
advisers and members on their own organizations.

SF-005 ships as the exact replica of the official blank form — its 1×1
picture boxes are intentionally empty, matching the paper workflow where
members paste physical photos. There are no open follow-ups.
Note: `npm run build` needs a raised Node heap (`NODE_OPTIONS` set in the
build script); avoid running builds while `next dev` is live — they share
`.next`.

