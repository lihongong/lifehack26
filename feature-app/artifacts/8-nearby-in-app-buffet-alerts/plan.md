# Issue #8 implementation plan

## Outcome

An authenticated Participant can keep Buffet Alerts off with no selected NUS Zone, or explicitly choose one canonical NUS Zone and opt in after satisfying the existing alert policy gate.
Each fresh Buffet Post in the selected NUS Zone or one adjacent graph hop creates exactly one private in-app Buffet Alert for that Participant.
The Participant can record a Helpful Alert by marking the alert helpful or reporting food gone.
A food-gone report marks the Buffet Post possibly gone, suppresses later alert delivery, and creates a visible Moderator review.
A Moderator can restore the Buffet Post or confirm its expiry with a required reason, and either decision is written to the immutable audit trail.

## Acceptance mapping

### Location and alerts start unset and off

Add private alert preference state with a database default of off while preserving the nullable Participant NUS Zone.
Replace the legacy profile zone values with the canonical `nus-zones-v1` identifiers and names.
Expose the private preference and canonical zone choices only through authenticated Participant APIs and authenticated UI state.
Verify the initial state through service and API assertions plus a browser journey that begins with `Not selected` and an unchecked alert control.

### A Participant can select one NUS Zone and opt in

Add an authenticated, `alerts`-policy-protected preference update that validates exactly one canonical zone when enabling alerts.
Allow disabling alerts without erasing the selected private zone, while an explicit empty selection leaves alerts off.
Add an accessible Buffet Alert settings panel to the Buffet page with one zone selector, one opt-in checkbox, clear nearby-zone explanation, save status, and policy-required feedback.
Verify validation, authentication, policy enforcement, persistence across reload, keyboard labels, and visible status in API and Playwright tests.

### Fresh same-zone and Nearby Zone posts create one alert

Create a Buffet Alert delivery service that receives the current Buffet Post collection, uses the existing expiry rules, and matches only the selected zone plus `adjacentZoneIds(selectedZone)`.
Skip location-unclear, possibly-gone, confirmed-expired, and time-expired Buffet Posts.
Persist one Buffet Alert per Participant and stable Buffet Post ID and create its private notification in the same immediate transaction.
Invoke the delivery service from the canonical Buffet Post create or update seam, immediately after a successful opt-in for catch-up, and through an authenticated idempotent recovery endpoint, leaving anonymous `GET /api/buffets` read-only.
Require current `alerts` policy eligibility on every delivery path so a later material policy renewal suppresses new alerts until acceptance is current again.
Verify same-zone, exactly-one-hop, two-hop exclusion, unclear-location exclusion, expiry boundaries, delivery while `/buffets` is not mounted, policy-renewal suppression and resumption, and notification privacy in integration tests.

### Edits and duplicate deliveries do not create duplicate alerts

Enforce a database uniqueness constraint on Participant and Buffet Post ID and make delivery conflict-safe inside an immediate transaction.
Treat a changed Buffet Post payload with the same stable ID as the same delivery identity.
Verify repeated synchronization and an edited fixture with the same ID leave one Buffet Alert and one in-app notification.

### Food-gone feedback suppresses alerts and enters review

Persist Buffet Alerts separately from immutable Helpful Alert outcomes, with one terminal `helpful` or `food_gone` outcome per alert.
When `food_gone` is recorded, atomically insert the outcome, create or reuse the open food-gone review for that Buffet Post, and move the Buffet Post to `possibly_gone` state.
Decorate the public Buffet read model with a non-identifying possibly-gone status while keeping reporter identity private.
Suppress delivery for any Buffet Post with an open possibly-gone review.
Add alert-specific actions to eligible Buffet cards and add a dedicated Buffet review section to the Moderator screen.
Verify that feedback does not create Gems, the public feed shows the possibly-gone state, a second Participant receives no new alert for the post, and the Moderator sees the review without private data leaking publicly.

### Moderator restoration or expiry is audited and feedback records Helpful Alert

Add Moderator-only review resolution outcomes `restored` and `expired`, each with a required validated reason.
Record the terminal review resolution, Buffet Post state transition, and `buffet_post_restored` or `buffet_post_expired` audit event atomically.
Restoration makes the post eligible for alerts to Participants who have never received it, while confirmed expiry removes it from the public feed and all future delivery.
Display the resolution result in the Moderator UI and expose the resulting immutable audit event only through the existing Platform Operator audit surface.
Verify both resolution paths, immutable audit behavior, authorization, idempotent terminal handling, and the absence of Gem Ledger changes.

## Feature changes

### 1. Persist alert delivery, feedback, and review state

Add a schema migration ledger to `backend/src/db/database.js` so each lexically ordered migration runs transactionally exactly once, including on upgraded databases whose existing migrations initially have no ledger entries.
Add the explicitly named `backend/src/migrations/006_buffet_alerts.sql` for persisted namespaced Buffet Posts, a private Buffet Alert opt-in flag, deduplicated Buffet Alert deliveries, terminal Helpful Alert outcomes, repeatable food-gone review cycles and resolutions, and current Buffet Post moderation state.
Extend the notification type constraint to include `buffet_alert` through a one-time table rebuild without changing existing notification rows or public payloads.
Migrate legacy `Kent Ridge` profile values to `medicine-kent-ridge`, clear unsupported `Bukit Timah` and `Outram` values, and keep every upgraded Participant opted out.
Add uniqueness, foreign keys, lookup indexes, state checks, and update and delete rejection triggers for terminal Helpful Alert outcomes and food-gone resolutions.
Add database triggers that reject an enabled alert preference without a canonical selected zone.
Update the non-production reset path to clear the new operational tables in foreign-key order and recreate any new immutable triggers.

### 2. Deepen the Buffet domain boundary

Move the application-startup Buffet fixtures through a persistent Buffet Post upsert service keyed by source feed ID plus source post ID, while keeping public expiry and filtering in `buffetService`.
Make post upsert the primary delivery trigger and keep preference-time and explicit synchronization reconciliation as recovery paths.
Add a dedicated alert service for preference validation, delivery matching, feedback, and review state transitions.
Use the canonical NUS Zone graph from `nusZones.js` for both profile validation and one-hop matching so frontend and backend cannot drift onto the legacy zone list.
Represent current post state independently from the in-memory source payload so a stable post ID remains moderated across repeated or edited delivery attempts.
Capture a sanitized Buffet Post snapshot when each food-gone review cycle opens and allow later content edits without changing that evidence.
Support repeated review cycles while allowing at most one open cycle per namespaced Buffet Post and attaching concurrent food-gone outcomes to that current cycle.
Return only the Participant's own alert identifiers and outcomes from authenticated endpoints.

### 3. Add authenticated Participant alert APIs

Expose the private alert preference through the authenticated session payload and never expose it through the public Participant profile.
Route every profile-zone and alert-enabled transition through one authoritative service.
Require current alert policy acceptance only when enabling alerts or changing the zone of an enabled subscription, always permit opt-out without renewed acceptance, and atomically disable alerts when the zone is cleared.
Add a conditional-policy preference update, an idempotent policy-aware recovery endpoint, and a policy-protected feedback endpoint for a Participant's own alert.
Return the same not-found response for nonexistent and non-owned alert IDs and reject a second terminal outcome.
Keep the anonymous Buffet feed available without authentication and decorate its posts only with public `possiblyGone` state or remove confirmed-expired posts.
Return structured policy and validation errors through the existing error handler conventions.

### 4. Add Moderator review APIs

Expose open food-gone reviews only to Moderators and include a report-time safe Buffet Post snapshot plus aggregate signal count and timing without exposing reporter identity to the public feed.
Add one terminal resolution endpoint with `restored` and `expired` outcomes and required reasons.
Compose the state transition, terminal resolution, and immutable audit write in one transaction.
If the Buffet Post naturally expired during review, keep the review resolvable for audit but prevent restoration from making the post public or alert-eligible.

### 5. Build the visible Buffet Alert journey

Add an authenticated Buffet Alert settings panel above the feed filters and preserve the anonymous feed layout for visitors.
Keep public feed loading independent from private settings and recovery state so a private authentication or policy failure cannot clear public Buffet Posts.
Name the settings selector `Buffet Alert NUS Zone` and rename the public filter to `Filter Buffet Posts by NUS Zone` to keep accessible names unambiguous.
Show whether a delivered alert matched the selected or a Nearby Zone and expose `Mark helpful` and `Report food gone` only for the current Participant's eligible alert.
Show a calm but unambiguous `Possibly gone` treatment on public Buffet cards while review is open.
Add a self-contained `Buffet food-gone reviews` component to the Moderator page with independent loading, error, reason, refresh state, and restore or expire actions.
Keep controls usable at Pixel 7 and desktop widths, with explicit labels, live status messages, alerts for errors, visible focus, and no color-only state communication.

### 6. Document the completed domain behavior

Update `CONTEXT.md` with the implemented private preference, one-hop delivery, deduplication, Helpful Alert outcome, food-gone review, and audit behavior.
Use the confirmed glossary terms and keep each full sentence on its own physical line.

## Commit points

The user has not authorized commits or pushing for this request, so these are verification checkpoints only.

### Checkpoint 1: Persist Buffet Alert delivery and preferences

Status: completed.

Scope includes the migration ledger, file-backed upgrade path, `006_buffet_alerts.sql`, persisted namespaced Buffet Posts, canonical Participant zone migration and validation, authoritative preference transitions, private session preference payload, ingestion-driven and recovery delivery services, authenticated routes, reset behavior, and backend tests.
Prerequisites are the existing Participant, policy, notification, Buffet Post, and NUS Zone seams.
Run `npm test` and confirm initial off and unset state, safe legacy-zone conversion, opt-out after policy renewal, profile-route invariants, one-hop matching, expiry exclusion, delivery without visiting `/buffets`, policy-renewal suppression, private notification delivery, edit deduplication, and duplicate synchronization.
Proof is a green backend suite with a file-backed pre-issue upgrade and two reopenings plus direct database assertions for one linked alert and one notification per Participant and namespaced post.

### Checkpoint 2: Record Helpful Alert outcomes and moderate food-gone reports

Status: completed.

Scope includes feedback persistence, post state, food-gone review and resolution services, Moderator routes, audit events, reset behavior, and backend tests.
Prerequisite is checkpoint 1.
Run `npm test` and confirm non-disclosing ownership checks, terminal feedback, suppression, concurrent signals sharing one open review, report-time evidence stability, restoration followed by a new review cycle, natural expiry, both Moderator outcomes, immutable audit events, terminal resolution conflicts, rollback, and unchanged Gem Ledger state.
Proof is a green backend suite with state-transition and audit assertions for restoration and expiry.

### Checkpoint 3: Deliver the Participant and Moderator UI

Status: completed.

Scope includes independent frontend feed and alert APIs, Buffet Alert settings, card feedback and possibly-gone state, an isolated Moderator review component, canonical profile zone choices, responsive styling, and Playwright coverage.
Prerequisites are checkpoints 1 and 2 plus the matched baseline from UI proof.
Run `npm run build`, the focused Buffet Alert Playwright journey on mobile first, then the same journey on desktop.
Proof is matched before-and-after UI evidence and independent reset-backed browser journeys covering default state and opt-in, delivery and duplicate recovery, helpful feedback and profile notification order, food-gone suppression, both visible Moderator outcomes, and visible audit evidence.

### Checkpoint 4: Complete documentation and regression verification

Status: completed.

Scope includes `CONTEXT.md`, final accessibility checks, and any small in-scope repairs found during full verification.
Prerequisites are checkpoints 1 through 3.
Run `git diff --check`, the file-backed migration upgrade check within `npm test`, `npm run build`, and `npm run test:e2e`.
Proof is a clean tracked diff limited to issue #8, green backend and browser suites, and no modification to the unrelated `../app/` directory.

## Verification

### Backend and integration

Test default private state, canonical zone validation and migration, authentication, conditional `alerts` policy renewal, unconditional opt-out, exact-zone and one-hop matching, two-hop and unclear exclusion, stated and fallback expiry, ingestion-driven delivery while the Buffet page is absent, deduplication under repeated and edited delivery, unique alert-to-notification linkage, private response allowlists, non-disclosing feedback ownership, single terminal Helpful Alert outcomes, shared open review signals, repeated review cycles, report-time evidence, possibly-gone suppression, natural expiry during review, Moderator authorization, both resolution outcomes, immutable audit entries, transaction rollback, unchanged Gems, and file-backed upgrade idempotency.

### End to end

Reset the app and anchor the clock at `2026-08-30T04:00:00Z`.
Launch a Participant with a completed public profile and current policies, visit `/buffets`, and assert the NUS Zone is initially unselected and Buffet Alerts are off.
Select Central, enable alerts, and assert alerts appear for the Central one-hop fixtures in FASS, Business, and Science but not the two-hop UTown fixture or location-unclear fixture.
Trigger recovery synchronization again and assert the notification and eligible-card counts do not increase.
Mark one alert helpful and verify its terminal Helpful Alert state without a Gem change.
Report another alert food gone and verify the public card says `Possibly gone`, a newly opted-in Participant does not receive that post, and a Moderator sees the dedicated review.
Resolve one reset-backed review as restored and verify a Participant who has not previously received the post can receive it.
Resolve another reset-backed review as expired through the Moderator UI and verify the post leaves the public feed.
Open the private profile independently and verify Buffet Alert notification ordering and content.

### Accessibility and UI proof

Before source edits, capture `/buffets` after reset and clock anchoring for an anonymous visitor and for an authenticated Participant with no selected NUS Zone at 390 by 844 and 1280 by 900.
Record the exact route, viewport, clock, identity, policy state, and distinguishing headings and controls.
After implementation, reproduce those states and capture the alert settings panel, an alert-enabled card, a possibly-gone card, and the Moderator food-gone review at matching viewports.
Assert accessible names for the distinct `Buffet Alert NUS Zone` selector, `Filter Buffet Posts by NUS Zone` selector, opt-in checkbox, helpful and food-gone actions, review reason, restore action, and expire action.
Inspect spacing, focus, wrapping, contrast, live status announcements, and mobile control sizing rather than relying only on automated assertions.

### Regression

Run the complete backend and Playwright suites to preserve anonymous Buffet browsing, profile setup, policy gates, existing notifications, Marketplace moderation, and Source Feed behavior.

## Risks and recovery

The in-memory Buffet Post source means delivery must be reconciled through an explicit idempotent service and authenticated synchronization route until a persistent Buffet Source Feed owns delivery events.
Keep that service independent of HTTP so a future Source Feed adapter can call the same boundary without changing deduplication semantics.
Rebuilding the notification table to widen its type constraint could damage existing rows if migration order or foreign-key handling is wrong.
Introduce a migration ledger, perform the rebuild once in the transactional `006_buffet_alerts.sql` migration, copy every existing column, and verify all three legacy notification types, indexes, foreign keys, constraints, and a second application reopen through a file-backed upgrade test.
Concurrent feedback or delivery could create duplicate state without database enforcement.
Use immediate transactions, uniqueness constraints, and conflict-aware reads, then test repeated requests.
Restoring a Buffet Post must not redeliver it to a Participant who already received the same stable post ID.
Preserve delivery rows across restoration and only make the post eligible for Participants without that deduplication record.
If the feature must be rolled back, disable the new authenticated controls and synchronization route first while leaving the additive operational tables intact so existing notification and audit history remains readable.

## Open blockers

None.

## Completion evidence

The file-backed legacy upgrade and second reopening pass within the 49-test backend suite.
The production frontend build passes.
The focused Buffet Alert Playwright journeys pass 6 of 6 across mobile and desktop.
The complete Playwright regression passes 28 of 28 across mobile and desktop.
Matched before-and-after UI proof is recorded in `ui-proof.md` for the authenticated `/buffets` default state at 390 by 844 and 1280 by 900.
Additional after-state evidence covers enabled Nearby Zone alerts, the possibly-gone state, and the isolated Moderator review.
The implementation uses the persistent Buffet Post upsert seam as the primary delivery trigger rather than the original in-memory-only reconciliation assumption.
No commit or push was authorized, so the completed work remains uncommitted on the issue branch.
