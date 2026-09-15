# ORGanIZE — Capstone Defense Demo Script

60-minute presentation flow. Login at https://organize-lspu-jaspu.vercel.app (or localhost after `npm run db:seed` + `npm run dev`). All demo accounts use password `Password123!`. AY 2026-2027.

Demo fixtures available after seeding:

- **Tech Circle** (child of CCS-SBO) — current-AY application **returned for revision** with live follow-up + notifications.
- **Esports Club** (child of CCS-SBO) — current-AY application **submitted, awaiting adviser review**.
- Deadlines are date-relative: **Renewal = OPEN**, **Initial Recognition = OPEN**, **First-semester activities = UPCOMING**, last AY = **CLOSED**.

| # | Time | Step | Login as | What to show | Why it matters |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 | Intro | — | Title slide: problem (manual/paper accreditation of student orgs), goal (single lifecycle system), stack (Next.js 16, Prisma/PostgreSQL, Vercel, Word-COM print pipeline), architecture diagram | Sets the stage |
| 2 | 0:05 | Login & session behavior | OSAS `osas@lspu.edu.ph` | Sign in; open DevTools → Application → Cookies: note HttpOnly session cookie; show `/audit-log` log in entry | Secure auth + audit trail (§30) |
| 3 | 0:08 | Dashboards by role | OSAS | `/dashboard` — recognition renewal queue, per-deadline cards, signature queue | Role-aware dashboards (§28) |
| 4 | 0:11 | Accreditation processing | OSAS | `/accreditation` — matrix by college; find **Tech Circle** = "Returned for revision · in review…"; **Esports Club** = submitted/awaiting review; filter by status | 7-stage workflow + ready-for-review wording (§6/§7) |
| 5 | 0:15 | Org application return flow | President `president.acs@lspu.edu.ph` | Bell → **Tech Circle returned** notification ("why" reason visible); open org → accreditation: returned banner with reviewer note, follow-up card, full event history | Return/revision preserving history (§10) |
| 6 | 0:18 | Fix & resubmit | President | Edit the SF-001 entry fields, resubmit; workflow tracker advances; new notifications land | Readiness gates + originator resubmit |
| 7 | 0:21 | SF workspace + signature binding | President | Open SF-003 (or SF-002) workspace: preview/edit official DOCX; submit; the signature tracker shows LOCKED→CURRENT | Official forms structure preserved (core rule) |
| 8 | 0:24 | Signature request | Adviser `adviser.regular@lspu.edu.ph` | Task card "awaiting your signature"; signing UI shows review-hash/handoff copy; attach saved signature → chain advances; **signed step snapshot** (exact signature you saw is rendered at export, never re-read from profile later) | §9 explicit confirmation + Phase 3 binding |
| 9 | 0:27 | Template integrity + drift guard | OSAS or dev terminal | (a) Rerun `npx tsx scripts/verify-hardening.ts` — master-manifest + drift checks print PASS; (b) optional live: edit the exported PDF data after signing → export fails closed with 409 naming the drifted role | Immutable signed content; tamper-proof masters |
| 10 | 0:30 | Print an official form | OSAS | `/forms/sf-003?org=<org>&ay=2026-2027` → Download/print PDF (Word-COM on Windows); show the rendered text fields are system-populated and signatures come from the step snapshots | Digitized SF forms, stored in records (§26) |
| 11 | 0:33 | Analytics & monitoring | OSAS | `/analytics` — overview KPIs, compliance matrix, activities M&E, alerts; `/monitoring` — per-org pipeline; `/export/analytics` CSV (budget actual + utilization %) | Management reporting |
| 12 | 0:38 | Kalendaryo & attendance | OSAS | `/calendar` — activity calendar with conflict detection; open an activity → QR check-in flow | §21/§22/§23 |
| 13 | 0:41 | Financial compliance | OSAS | `/financial` — compliance matrix; open a submission routed through the same signature chain as SF forms | P12 |
| 14 | 0:44 | Unsaved-change guard | Any officer | Edit Organization/Activity/Report form → navigate away → browser warns; confirm discard | Data loss protection (Phase 4) |
| 15 | 0:46 | Security battery (live) | Dev terminal | `npx tsx scripts/security-test.ts` → 15/15: cross-org denial, IDOR, direct-backend call, order bypass, completed re-sign, former-officer; `npx tsx scripts/smoke.ts` → 190/190 including MEMBER/ADVISER escalation to `/forbidden` on `/users` | Defense-in-depth evidence |
| 16 | 0:52 | Q&A buffer | — | Keep open: sign-out demo (anonymity of unknown-email login), rate-limit on rapid failed logins, session rotation on re-login | Hardening depth |

## Demo tips

- Keep the **Verification Console** open on one window (run all three scripts) so a judge can watch suites pass live.
- The signed-PDF binding (step 9) is the strongest Phase 3 proof — practice mutating a field between sign and export beforehand on a scratch org (e.g., create a temp org, attach a signature, edit the saved data, try PDF).
- Do NOT attempt a PDF export on Vercel (501) — print docs via the Windows machine; on Vercel the graceful 501 message is itself demo-able.
- Prod seed is untouched: every rotated credential and the Vercel token should be revoked after the defense (see the environment notes in the development handoff).
- If a step is behind schedule, trim steps 11–13 — the "wow" moments are 5–9.