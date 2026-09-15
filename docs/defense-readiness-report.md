# ORGanIZE — Capstone Defense Readiness Report

Prepared for the capstone defense of **ORGanIZE** (Next.js 16 + Prisma/PostgreSQL, live at https://organize-lspu-jaspu.vercel.app).

Scope: a five-phase hardening pass over the existing application. No database reset was run and the production database is untouched (all work is local `organize` on `localhost:5432`). Seed changes only affect fresh-seed or newly seeded local environments and are idempotent.

Status of every automated gate, run on the final tree: **all green**.

| Gate | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | Clean |
| Lint | `npx eslint` on all touched files | 0 errors |
| Production build | `npx next build` | Success (3 pre-existing dynamic-fs warnings from the DOCX master reads) |
| Smoke battery (HTTP) | `npx tsx scripts/smoke.ts` | **190/190** |
| Signature-route security tests | `npx tsx scripts/security-test.ts` | **15/15** |
| Hardening + integrity checks | `npx tsx scripts/verify-hardening.ts` | **6/6** |
| Demo seed | `npm run db:seed` | Runs twice, second run is a no-op |

---

## Phase 1 — Security hardening (Done)

- **Rate limiting** — DB-backed fixed-window buckets (migration `20260915162020_add_rate_limit_buckets`) shared across serverless invocations. Applied to login/signup/password-change (burst + per-account) and the OAuth start route. `RateLimitBucket` lazily resets after its window.
- **Password policy** — enforced at signup, self-serve password change, and admin create/reset: ≥10 chars, upper+lower+digit, ≤72 chars (bcrypt limit).
- **Session rotation** — session IDs are random 256-bit tokens, stored hashed; login signs a fresh session. Graceful deactivation through `isActive`.
- **Security headers** — CSP, HSTS, and friends set on every response; production error responses no longer leak stack traces or internal labels.
- **Upload content sniffing** — every attachment upload verifies the *declared* MIME against the *real* leading bytes (PDF/PNG/JPEG/WEBP + DOCX/XLSX must be valid zip archives containing their signature part). A renamed `.exe` or text file can never be stored as a "PDF".
- **Private storage** — attachments live in a private storage backend keyed by random stored filenames; downloads are authenticated.
- **Auditing** — login failures (with account-lifecycle reason for known accounts) and lifecycle actions write to the immutable audit log; successful sign-in clears the user's attempt counters so legitimate users are never locked out, while unknown emails stay generic (no enumeration).

## Phase 2 — Org-application draft workflow (Verified complete)

- All 7 official application-approval stages are modeled and gated by `src/lib/workflow.ts`.
- Readiness gates block submission until required documents (and the Senior Adviser assignment) are complete; `ORG_APPLICATION_WORKFLOW` drives the review chain (adviser → dean → college/SOA → OSAS) with return/reject + resubmit preserving full `RecognitionEvent`/audit history.

## Phase 3 — SF-001…SF-006 signature binding + template integrity (Done)

Overhauls how official forms are printed so the document is bound to what was actually reviewed and signed:

- **Signature snapshot binding** — the export route renders each signer from the `SignatureStep` snapshot (`signatureImage`/`signatureTyped` captured at signing) exactly like it was approved, never re-reading the user's current signature. Legacy rows fall back to the live user.
- **Signed-content fingerprint** — at signing, `signCurrentStep` records `canonicalJsonHash(documentData.data)` onto the step (migration `20260915165102_add_signature_step_document_data_hash`). `findSignedDataDrift` compares it to the *current* data; if signed content was altered, the PDF export fails closed with HTTP 409 naming the drifted roles. A return/resubmit clears the snapshots so re-signing re-verifies the revised content.
- **Master template integrity** — all six official OSAS/ISO masters are registered in `src/lib/docx/masters.ts` with committed SHA-256 hashes (`MASTER_HASHES`). Generation verifies the on-disk master against the manifest and refuses to render on any mismatch (`template_tamper`). Production keeps installing the dropdown template per defense-Registration-Selection-Form flow.
- **"Ready for Review"** wording applied to the FOR_SIGNATURE stage, gates, and accreditation filter so the defense demo reads clearly.

## Phase 4 — Role-aware UX + demo seed (Done)

- **Unsaved-change guard** — new `useExitGuard` walks beforeunload + capture-phase anchor intercept; armed on dirty field edits in the official-form workspace editor, and in the Organization, Activity, and Report create/edit forms. Disarm only on a successful submit (state-transition detected during render, so an error leave preserves the prompt).
- **Plain-language statuses** — replaced raw enum leaks with the existing `*_STATUS_META` label maps in the highest-visibility surfaces: accreditation processing (recognition status + current signatory label on every row), monitoring pipeline badges, analytics attendance drill-down, activity drill-down, and QR self-check-in alerts, and activity status badges.
- **Demo scenarios** — the seed now creates two in-flight, non-happy-path cases so every role sees their real workflows on first login:
  - **Tech Circle** (`TECHCIRCLE`) — current-AY application **returned for revision** with the reviewer's note, follow-up tracked (CONTACTED), and targeted notifications to President + Secretary.
  - **Esports Club** (`ESPORTSCLUB`) — current-AY application **submitted, awaiting adviser review**.
  - Deadline windows are date-relative (renewal OPEN now, initial-recognition OPEN, next cycle UPCOMING, last AY CLOSED) so the demo always shows live states. Idempotent (verified by running the seed twice).

## Phase 5 — Automated verification + report + demo script (Done)

- **Smoke battery extended to 190 checks** — full OSAS route sweep (dashboard through SF-006, exports, monitoring sheets, accreditation, notifications), plus:
  - **Role escalation** — MEMBER and ADVISER hitting `/users`, `/users/new`, `/colleges`, `/audit-log`, `/deadlines/new` are forced to `/forbidden` (Next 16 meta-refresh redirect) and never render admin content.
  - Signature-chain integrity (intact chain verifies, tampered link detected), evaluation/budget surfaces, and the verified chain badge on the seeded SF-001.
- **Security battery 15/15** — cross-org signing (allow on own org, deny on another), entity-id swap IDOR, direct backend call denial (`NOT_YOUR_STEP`), former-officer denial after assignment end, order bypass (cannot skip ahead to a not-yet-current step), completed-document re-sign rejection, multi-org president/member split, and HTTP-level UI that mirrors the server decision on every surface. Org B is now chosen dynamically so the fixture stays valid as seed evolves.
- **Hardening checks 6/6** — password policy, upload sniffing (forgery + embedded-magic + empty file), canonical-hash stability, master-template manifest (all 6 masters), rate-limit bucket persistence, and the **post-sign drift loop** (signed snapshot matches → content edit detected as drift → resubmit reset invalidates).

---

## What to demo (compressed)

Run `npm run db:seed` on a fresh local clone, then `npm run dev`. Verified on localhost with:

- OSAS: `/analytics`, `/monitoring`, `/accreditation` (shows Tech Circle "Returned for revision · Senior Adviser…"), the SF workspace, `/audit-log`, `/deadlines`, escalation on `/users` for a member account.
- President: Tech Circle returned notification → org accreditation page → resubmit; Esports Club awaiting review; SF-003 sign flow; unsaved-change guard on Organization/Activity/Report forms.
- Adviser: task card for the pending Esports Club signature.
- Report/print: export an official SF PDF (Word-COM on Windows) to show the signer snapshot binding.

Full narrative walk-through in [`defense-demo-script.md`](defense-demo-script.md).