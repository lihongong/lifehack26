# Issue #8 adversarial plan review

## Blockers

### Notification migration is unsafe under the current migration runner

Finding: Widening the notification type check requires a table rebuild, but `createDatabase` reruns every SQL file on every startup and has no migration ledger.
Evidence: `backend/src/db/database.js` lexically executes every migration unconditionally, and `backend/src/migrations/004_comments_and_reports.sql` owns the notification type check.
Disposition: Accepted.
Reason: A destructive table rebuild must run exactly once and must preserve existing notification rows during a real upgrade, not only create a valid fresh database.
Plan revision: Add a migration ledger before the explicitly named `006_buffet_alerts.sql`, execute each unapplied migration transactionally, and add a file-backed pre-issue upgrade and second-reopen test.

### Profile edits bypass the alert preference invariant and opt-out policy

Finding: `PUT /api/me/profile` can change or clear `nus_zone` without the `alerts` policy boundary, while protecting every preference update would wrongly prevent opt-out after policy renewal.
Evidence: `backend/src/routes/profileRoutes.js` authenticates profile updates without policy middleware, and `backend/src/services/participantService.js` writes `nus_zone` directly.
Disposition: Accepted.
Reason: Zone and opt-in transitions need one authoritative service, enabling and enabled-zone changes need current policy acceptance, and consent withdrawal must remain possible without renewed acceptance.
Plan revision: Centralize transitions, atomically disable alerts when the zone is cleared, permit unconditional opt-out, require current policy for enablement or enabled-zone changes, and enforce the enabled-zone invariant with database triggers.

### Page-mounted synchronization does not create alerts when posts arrive

Finding: Synchronizing only while `/buffets` is mounted means an opted-in Participant can miss an entire fresh post lifecycle.
Evidence: Buffet Posts are currently created at application startup, and `frontend/src/hooks/useBuffets.js` refreshes only while the Buffet route is mounted.
Disposition: Accepted.
Reason: Delivery must be driven from the Buffet Post create or update seam, with reconciliation serving only recovery and opt-in catch-up.
Plan revision: Persist canonical Buffet Posts, invoke delivery from post upsert, retain idempotent recovery, enforce current alert policy on every delivery path, and prove delivery while the Participant is not viewing `/buffets`.

### Legacy NUS Zone values have no upgrade rule

Finding: Existing rows can contain `Kent Ridge`, `Bukit Timah`, or `Outram`, none of which are valid canonical graph IDs as stored.
Evidence: `backend/src/services/participantService.js` and `frontend/src/components/ProfileForm.jsx` use those legacy values, while `backend/src/data/nusZones.js` uses canonical IDs.
Disposition: Accepted.
Reason: Replacing validation alone would strand existing private profiles in an invalid state.
Plan revision: Migrate `Kent Ridge` to `medicine-kent-ridge`, clear unsupported `Bukit Timah` and `Outram`, keep all upgraded alerts off, update affected tests, and assert no private session returns a legacy value.

## Important improvements

### Keep public feed failures independent from private alert failures

Disposition: Accepted.
Reason: Anonymous Buffet browsing must remain available when authentication or alert policy state prevents private synchronization.
Plan revision: Use separate frontend state and requests for public feed data and private alert settings or recovery.

### Define a namespaced Buffet Post identity

Disposition: Accepted.
Reason: Source post identifiers are only safely unique inside a Source Feed namespace.
Plan revision: Persist source feed ID plus source post ID with a composite uniqueness constraint and use the internal Buffet Post key for alerts, moderation, and review cycles.

### Capture review evidence and support repeated review cycles

Disposition: Accepted.
Reason: In-memory content can change, and restoration must not prevent a later food-gone event from opening a new review.
Plan revision: Store a sanitized report-time snapshot, allow multiple immutable review cycles with one current open review per post, attach concurrent signals to that review, and test edit-after-report and restoration-followed-by-report.

### Tighten feedback ownership and disclosure

Disposition: Accepted.
Reason: Another Participant must not learn whether a guessed private alert ID exists.
Plan revision: Use identical not-found behavior for nonexistent and non-owned alerts, return only caller-owned alert IDs, and reject a second terminal outcome.

### Isolate Buffet moderation from the monolithic Moderator refresh

Disposition: Accepted.
Reason: A Buffet review API failure must not prevent existing moderation domains from loading.
Plan revision: Add a self-contained Buffet review component with independent load, error, reason, and refresh state.

### Avoid duplicate NUS Zone accessible names

Disposition: Accepted.
Reason: The current feed filter locator would become ambiguous.
Plan revision: Name the new selector `Buffet Alert NUS Zone`, rename the filter to `Filter Buffet Posts by NUS Zone`, and update regression tests deliberately.

### Enforce one notification per delivery

Disposition: Accepted.
Reason: A unique alert row does not by itself prevent application code from inserting duplicate notifications.
Plan revision: Link each alert to one unique notification and create the notification only when the alert insert succeeds in the same transaction.

### Define natural expiry during an open review

Disposition: Accepted.
Reason: Restoration cannot revive a Buffet Post whose source deadline has passed.
Plan revision: Keep the review resolvable for audit, but return an effective expired outcome when the Moderator attempts restoration after natural expiry and never make the post public or alert-eligible.

## Optional refinements

### Distinguish private zone selection from public graph metadata

Disposition: Accepted.
Reason: The anonymous feed intentionally publishes the zone graph while the Participant's selected zone remains private.

### Assert response allowlists

Disposition: Accepted.
Reason: Field-level assertions are stronger evidence of the privacy boundary than searching serialized output.

### Cover both Moderator outcomes visibly

Disposition: Accepted.
Reason: Both controls are user-facing and should be exercised through the visible Moderator surface.

### Split the long browser journey

Disposition: Accepted.
Reason: Independent reset-backed journeys will be easier to diagnose and less flaky.

### Verify notification order and profile display

Disposition: Accepted.
Reason: The issue promises in-app notifications, and the profile is the existing visible notification surface.

## Reconciled status

No finding requires a new product decision or authority beyond issue #8.
The revised plan has no open blocker.
