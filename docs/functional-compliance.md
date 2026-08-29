# Functional Compliance Map

Status of the existing ORGanIZE system against the **System Functional Optimization Master Prompt**. Statuses: **Done** (implemented and enforced), **Partial** (implemented but with a noted gap), **Gap** (missing).

Single source of truth for the workflow/state rules:

| Artifact | Purpose |
| --- | --- |
| `src/lib/rbac.ts` | Role→permission matrix (`ROLE_PERMISSIONS`), org scoping (`orgScopeWhere`) |
| `src/lib/workflow.ts` | Per-document workflow/state rules — tracker steps, current-action gates, legal transitions (§6/§29/§32) |
| `src/lib/authority.ts` | Authority chain (§2), role labels, derived per-process actor matrix (§28) |
| `src/lib/form-routes.ts` | Per-form signatory sequences (§6/§8) |
| `src/lib/signature-routing.ts` | Signature gating enforcement (LOCKED→CURRENT→SIGNED) (§8/§9) |

## Section-by-section

| # | Requirement | Status | Where / Notes |
| --- | --- | --- | --- |
| 1 | Lifecycle-centered system, no duplicated records | Done | Single `Organization` profile feeds recognition, activities, documents, renewal; memberships/advisers are relations, not copies |
| 2 | Confirmed account set (8 roles) + authority structure | Done | `Role` enum matches exactly; `AUTHORITY_CHAIN` in `authority.ts` (authority ≠ universal signature order) |
| 3 | President creates the organization; DRAFT → SUBMITTED | Done | `createOrganization` (`org.submit`), `applicationStatus=DRAFT`; submit → `SUBMITTED`; adviser does NOT create |
| 4 | Central organization profile + mother/sub/independent hierarchy | Done | `Organization` + `OrgType` (MOTHER/CHILD/INDEPENDENT); children under mother org |
| 5 | Recognition requirements checklist; block submit if incomplete | Done | SF-001 checklist (`analytics.ts`) + document repository; recognition/renewal `SUBMIT` is blocked until the six accreditation documents are uploaded for that year (letter excluded — it IS the submission); org application blocks on draft completeness + Senior Adviser assignment |
| 6 | Configurable workflow engine per document | Done | `workflow.ts` defs (org application, recognition/renewal, activity, report) + `form-routes.ts` per-form sequences |
| 7 | Visible processing trail (current location/action/next) | Done | `WorkflowSteps` tracker + `currentAction` gates; recognition/organization pages show trail; `RecognitionEvent` history |
| 8 | Signature gating — locked until current signatory acts | Done | `SignatureStep` LOCKED/CURRENT enforced in `authorizeCurrentSigner` (§9 in `signature-routing.ts`) |
| 9 | Explicit signature confirmation (review → comment → sign / request revision) | Done | Signature route pages: review + optional comment + confirm attach; revision action |
| 10 | Revision workflow preserves history | Done | Routes keep RETURNED steps; `RecognitionEvent`, `AuditLog`, route `version`; nothing erased |
| 11 | Renewal reuses existing record | Done | Recognition `kind: RENEWAL` on the same org; `RENEWAL_WORKFLOW` reuses recognition def |
| 12 | Recognition history per period + expiry/archive | Done | One `Recognition` per org+AY; `RecognitionStatus.EXPIRED`; `deriveOrgState` → EXPIRED/PENDING_RENEWAL; history never deleted |
| 13 | Officer management ACTIVE→INACTIVE, preserve history | Done | `setMembershipPosition`/deactivation in `organizations.ts` (§15/§16); historical rows kept |
| 14 | Senior (REGULAR) + Junior (PART_TIME) advisers; transfer preserves history | Done | `AdviserAssignment` isCurrent flag + endedAt; org bound to REGULAR; `ADVISER_TYPE_LABELS` |
| 15 | Select existing students for membership (no manual re-encoding) | Done | Bulk-add selected students (`addMembers` in `organizations.ts`) |
| 16 | SF List of Members auto-populated from membership | Done | `/print/forms/sf-005` renders roster from current members (officers first, then by name) |
| 17 | Multiple organizations per student, org-specific access | Done | `OrganizationMember` rows per org; `orgScopeWhere` scoping |
| 18 | Membership application → president review → approve | Done | APPLIED→UNDER_REVIEW→APPROVED/ACTIVE lifecycle with officer/admin review actions |
| 19 | Activity proposal created by President with full info | Done | `createActivity` (activity.submit) with name/date/time/venue/description/objectives/budget/participants/docs |
| 20 | Meaningful activity statuses | Done | `ProposalStatus` + `ActivityPhase` (PLAN→ARCHIVE); `ACTIVITY_WORKFLOW` gates |
| 21 | Calendar with conflict detection | Done | `/calendar` flags same-venue + same-organization time overlaps |
| 22 | Activity completion: attendance→evidence→report→monitoring | Done | Attendance, `ActivityCheckIn`/QR, `AccomplishmentReport`, `monitoring.ts`, `ACTIVITY_PHASES` |
| 23 | Attendance auto-associates student+org+activity+datetime | Done | `ActivityAttendance` composite key (`@@unique([activityId, userId])`) — no re-encoding |
| 24 | Accomplishment report with review/comments/revisions | Done | `AccomplishmentReport` + `REPORT_WORKFLOW` (SUBMIT/RETURN/ACCEPT) |
| 25 | Central document repository + missing-requirement identification | Done | `/organizations/[id]/documents` tracks Required→Submitted→Under Review→Approved/Returned |
| 26 | Digitized SF forms: structure, signatures, print, stored in records | Done | `/print/forms/sf-001…sf-006`, `SignatureRouteSection`, PDF-print; attachments kept under org records |
| 27 | OSAS-created deadlines + notifications | Done | `Deadline` model (process/scope/college), deadline pages, Part-9 notification helper |
| 28 | Role-specific dashboards | Done | `/dashboard` branches per role; §28 structural audit below (table) + UI pass chunks A/C/E; permission roots are `src/lib/auth/rbac.ts` + `authority.ts` |
| 29 | Global status system (org/document/activity) | Done | Enums + `ORG_*_STATUS_META`, `deriveOrgState`; statuses are meaningful states, not "Pending" |
| 30 | Audit trail | Done | `AuditLog` on every action + `RecognitionEvent` for per-step history |
| 31 | Enter once, reuse everywhere | Done | Membership/attendance/forms/reports read user + organization relations; no re-entry |
| 32 | Process tracker on every processing screen | Done | `WorkflowSteps` (org application, recognition, activity, report, SF signature routes) + current-action block |
| P12 | Financial structure & financial compliance (`FinancialRequirement`/`FinancialSubmission`) | Done | Configurable per-process requirements (default signatory chain President → Secretary → Senior Adviser → Dean → SOA → OSAS or config-driven), one submission per org+AY+requirement, versioned attachments (`FINANCIAL_DOCUMENT`/`FINANCIAL_SUPPORTING`), routed through the same `SignatureRoute` as SF forms, one status taxonomy (DRAFT/INCOMPLETE/SUBMITTED/UNDER_REVIEW/RETURNED/RESUBMITTED/APPROVED/ARCHIVED) derived in `src/lib/financial.ts`, overdue derived from `Deadline`s (never stored), comments, archive (COMPLETED only). Serves as the analytics `Financial` source of truth (`analytics-loader` + `financialCompliance` in `analytics.ts`, 3-state badge Submitted/Overdue/Pending; the Part 12 submission also satisfies the SF-001 FINANCIAL_REPORT checklist item). Insert points: org workspace `/organizations/[id]/financial`, admin `/financial/requirements`, `/financial` compliance section, RBAC `financial.view`/`financial.manage` |

## Notes on registry adoption

## Notes on registry adoption

`workflow.ts` is now the single source everywhere a workflow's *movable state* is enumerated: module actions (org/recognition/activity/report) derive transitions; progress bars and step indexes derive from the defs; the dashboard's recognition queue and in-flight count use `inFlightStatuses(RECOGNITION_WORKFLOW)`; monitoring buckets (`planned`/`upcoming`/`completed`) derive from `ACTIVITY_WORKFLOW` steps/reject state and `ACTIVITY_PHASES`. Semantic groupings that are deliberately NOT workflow buckets remain local constants (e.g., "satisfied recognitions" = `SATISFIED`, "filed reports" = `FILED_REPORT`).

## §28 structural dashboard audit (as of this build)

Routing + scope + per-role content were verified from code (`src/app/(app)/dashboard/page.tsx`, `src/lib/auth/rbac.ts`, `src/lib/authority.ts`). The master prompt's original §28 *role lists* text is not present in the repo; the audit below is against the role/permission matrix that is the code's own authority. Remaining known nicety (behavior-preserving, not a gap): adviser deadlines are campus-wide rather than scoped to assigned orgs.

| Role | Dashboard | Scoping verified | Content | Enrichment gaps (for the UI pass) |
| --- | --- | --- | --- | --- |
| OSAS / SOA | `AdminDashboard` | Campus-wide | Org count/recognized/pending/deadlines, pending-actions card with three read-only, def-derived sections (ORGANIZATION applications in the creation chain, recognition queue, membership applications awaiting officer review), org-state distribution, deadlines, recent audit timeline | None structurally |
| Dean | `DeanDashboard` | `collegeId` (orgs + pending recognitions) | College org counts, recognized, for-review, applications in college, university deadlines | None structurally |
| Senior / Junior Adviser | `AdviserDashboard` | Current `AdviserAssignment`s only | "Awaiting your action" card (recognition starts/reviews + activity proposals needing endorsement — Senior Adviser only; SF signature routes where the CURRENT step is the adviser's own role, Senior *or* Junior per `AdviserType`), per-org state + AY recognition status, university deadlines | Deadlines are campus-wide, not scoped to assigned orgs |
| President / Secretary / Member | `OfficerDashboard` | Current `OrganizationMember`s (role-agnostic content, officer-only CTAs) | Per-org recognition state, AY application status, "Complete submission" for `editableStates`, "Start renewal" quick action, relevant deadlines (process+college+type scoped) | Recognize office (PRESIDENT vs SECRETARY vs MEMBER) when rendering CTAs; already def-derived for editability |

## Locked decisions

- The eight roles are final; no additional roles may be invented (§2).
- Authority order (OSAS > SOA > Dean > Senior Adviser > Junior Adviser > org) is **scope**, not a universal signature sequence (§2/§6).
- Organization creation ≠ recognition (§3/§5): creating is always `DRAFT`; recognition is conferred only at the end of the review chain.
- The application/renewal letter cannot be a pre-submit requirement — it exists as soon as the application is filed.
- An application can never pass a step whose reviewer has not acted (§8).

## UI/UX optimization pass (33-section prompt)

Redesign pass over the *existing* interface only — no rebuild, no invented business rules, no mock data (§32). Base tokens already match the brief (see "Design system baseline" below), so the pass is applied in verified chunks; `tsc`/`eslint`/`npm run build` are run after every chunk. This table is appended as chunks land.

| Chunk | Requirement (UI prompt) | Status | Where / Notes |
| --- | --- | --- | --- |
| A | §6 "What requires my attention?" — dashboards lead with the user's pending work | Done | OSAS `Pending actions` now has two def-derived sections: · ORGANIZATION applications in the creation chain (responsible reviewer per `currentAction`, status badge, Review link) above the recognizable recognition queue; Adviser dashboard now leads with `Awaiting your action` (recognition starts/reviews + activity-proposal endorsements, Senior Adviser only, links straight to the document) |
| A | §28 gap closure | Partial | Admin org-application surfacing and adviser recognition/activity surfacing landed; member-application acceptance queue and adviser signature-route surfacing remain (see audit table above) |
| A | §31 "who / what / done / blocking / next" | Done | Every acted row carries the responsible role + concrete next step (`currentAction`) and a single primary action link |
| A | §32 preservation | Done | Read-only additions; no transitions, permissions, or queries changed; state defs untouched |
| B | §8 organization profile header | Done | Org profile now leads with a fact strip: current-AY recognition status (linked to the recognition record) / Senior Adviser / President — all derived from existing relations (`seniorAdviser`, `president`); logo-name-college-type-status badge were already present. Tab navigation deferred deliberately: the single-scroll profile with in-header links to Documents/SF-004/Edit is a consistent pattern already |
| C | §9/§12/§13 document center as a table + "where is my document" | Done | `/organizations/[id]/documents` gains a `Document workflow` card: one row per signature-routed SF form (SF-001/002/003/005), showing routing state (In progress/Completed/Revision/Rejected/Not started), the CURRENT awaited signatory (`SIGNATORY_LABELS` + resolved signer), signed-count, and an "Open form" link (`/forms/sf-00x?org=&ay=`). Queried directly from `SignatureRoute` (`entityType: "SF"`, `entityId endsWith :org:ay`); missing routes render "Not started" (routes are lazily created on first form open — existing behavior, unchanged). SF-004/SF-006 are intentionally absent (no signature workflow). §12 requirement-checklist panel kept as a status table (Required→Submitted→Under Review→Approved), not cards |
| C | §28 OSAS membership memory + adviser signature surfacing | Done | Admin `Pending actions` now includes a read-only "Membership applications" section (officers still decide on their org pages). Adviser "Awaiting your action" now includes SF signature routes where their role is CURRENT (`SENIOR_ADVISER` for REGULAR, `JUNIOR_ADVISER` for PART_TIME assignments), linking straight to the form. Form metadata centralized once: `FORM_META`/`SIGNATURE_FORM_ORDER`/`SIGNATORY_LABELS` in `src/lib/form-routes.ts` (documents page + dashboard both consume it) |
| D | §26 loading/error states + §29 consistency | Done | Added `(app)/loading.tsx` (shell stays rendered; branded content skeleton with `aria-busy` + sr-only text) and `(app)/error.tsx` (in-content retry boundary that keeps the shell, matching the global `/error.tsx` which still resets the whole app). Audited: `TableWrap` already scrolls horizontally (`overflow-x-auto`, `min-w-640px`) so all tables are mobile-safe; every major list route already renders `EmptyState` (organizations, recognition, activities, reports, users, colleges, deadlines, notifications, audit-log, dashboard); calendar grid uses greedy cells + overview list |
| E | Final polish sweep (audit-driven) | Done | Fixed two HIGH nested-table bugs: `analytics/page.tsx` and `monitoring/page.tsx` rendered `<TableWrap><table><THead><TR>` → invalid nested `<table>` plus a nested `<tr><tr>`, which dropped the header-background row and the horizontal-scroll min-width guarantee; both now use the house `<THead><TH>` form. Also: `monitoring` "Monitoring report" CTA used a nonexistent `.btn-outline` class (rendered as plain text) → shared outline-button classes; `deadlines` mobile card showed date-based badge for inactive deadlines (desktop said Inactive) → `Inactive` branch added; `recognition/[id]` hand-rolled orange `border-orange-200 bg-orange-50` RETURNED box → `<Alert tone="warning">` matching the sibling notices, and "Schedule interview" demoted from primary → outline so the review flow has one primary per card; `recognition` progress bar `bg-green-600` literal → `bg-success` token; `member-picker` flat `red/emerald-50` → `danger-light`/`success-light` tokens; typed-signature previews `text-gray-900` → `text-content`. ESLint/tsc clean, build green |

### Design system baseline (already compliant, audited)

`src/app/globals.css` `@theme` already implements the brief: primary `#123b63` / primary-dark `#0b2945` / primary-light `#eaf2f8`; background `#f7f9fc`; gold reserved for recognition; success/warning/danger/info are in-family; Inter is wired as `--font-sans` (Manrope as display face); `--shadow-card`/`--shadow-pop`; `:focus-visible` outline. App shell in `src/components/shell.tsx` already provides §4/§5 role-aware nav (`NAV_SECTIONS` filtered by `can(user, permission)`), a collapsible sidebar, mobile drawer, topbar search, year picker, notification bell and account menu — no changes needed there this chunk.

### Remaining UI chunks (proposed order)

All planned UI chunks (A–E) are now Done. Optional follow-up, behavior-preserving: scope adviser "university deadlines" to the adviser's assigned orgs rather than campus-wide (low value; daily-list form is already driven by the same deadline query).

## Analytics module optimization (28-section prompt)

Implemented per the "ANALYTICS MODULE OPTIMIZATION PROMPT": five layers (descriptive → diagnostic → trend → rule-based alerting → rule-based prescriptive), statistics/fixed rules only — no ML, no forecasting, no invented ratings. All computation is frequency counts, percentage distributions, and explicit threshold rules.

| Prompt area | Built as | Where |
| --- | --- | --- |
| Five layers | Descriptive KPIs (org mix, accreditation % avg, financial, activity completion) → matrix; diagnostics (requirements gaps, workflow stage delays, signature bottlenecks); trends (compliance, membership, activities filed, implementation rate); rule-based alerts; rule-based recommendation text on every alert | `src/lib/analytics.ts`, `src/app/(app)/analytics/page.tsx` |
| Compliance = actual tracked requirements | SF-001 checklist compares tagged attachments on the org's AY recognitions (`requirementsChecklist`/`compliancePct`); financial compliance strictly Submitted/Overdue/Unsubmitted; never "application exists" | `src/lib/analytics.ts` |
| Rule-based alert engine (§20 etc.) | Fixed rules only: At Risk = ≥2 unmet requirements within 7 days of an applicable deadline; Due Soon = 1 unmet within 7 days (CAPS mirror); financial Overdue once the deadline passes; ended-but-unreported activities; workflows stalled ≥14 days; CURRENT signatory queues. Every alert carries its rule text ("Why") + a predefined action ("Recommend/consult/remind") | `riskAlerts`/`financialAlerts`/`reportAlerts`/`stalledAlerts`/`bottleneckAlerts` in `src/lib/analytics.ts`, `STALL_WORKFLOW_DAYS`, `RISK_WINDOW_DAYS` |
| Drill-down Number→Explanation→Record→Action (§23) | `/analytics/org/[id]` — each org state is explained (recognition badge + %, financial badge, officer ratio 1:N, attendance, requirement checklist, applicable deadlines, activities with attendance) with links to the underlying records | `src/app/(app)/analytics/org/[id]/page.tsx` |
| Role-specific analytics (§21) | Page branches: FULL workspace for OSAS/SOA/Dean (`analytics.view`), org-scoped workspace for advisers/officers via `orgScopeWhere`, personal-only view for MEMBER (their attendance/memberships). Nav entry now `org.view` so every role sees Analytics; page content still branch-scoped | `src/app/(app)/analytics/page.tsx`, `src/lib/nav.ts` |
| Filters → data attributes | Academic Year (default current), Organization, College, Type, Recognition status — all map to real columns/derived states; "No application" is an explicit option | `src/components/analytics/analytics-filters.tsx` |
| Export | CSV respecting the same scope + filters (matrix + alerts w/ rule text); OSAS/SOA/Dean only via `requireExporter()` | `src/app/export/analytics/route.ts` |
| Data integrity (0 vs No Data) (§25) | `NoData` guard everywhere a state is unreported; activity completion shows "—" (none planned) vs "0%"; donut/line/bars print values so no insight depends on color alone | `src/components/analytics/analytics-parts.tsx`, `src/components/ui/charts.tsx` |
| Visualization rules (§26 etc.) | Donut for small distributions, bars for comparisons, lines for trends, tables for records, horizontal bars for rankings; no invented M&E grade (system has no rating model — counts/percentages only) | `src/components/ui/charts.tsx` (added `DonutChart`) |

Data model note: `RecognitionEvent.action/createdAt` drives per-milestone stage delays (`diagnoseWorkflow`, configured-workflow actions only); `SignatureStep.status=CURRENT` drives bottleneck counts; attendance "actual" = `ActivityAttendance` rows.