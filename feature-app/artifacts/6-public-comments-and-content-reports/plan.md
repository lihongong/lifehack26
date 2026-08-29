# Implementation Plan for Issue #6

## Outcome

Marketplace Listings expose accessible public Comment threads to every visitor.
Authenticated Participants with a completed public profile who have accepted the current Comment policies can create top-level Comments and one level of replies and edit their own Comments with an edited marker.
Authors can always delete their own Comments without renewed policy acceptance, while preserving a placeholder when replies or unresolved Content Reports remain.
The application warns and requires explicit confirmation before sending Comment text containing an obvious email address or phone number.
Authenticated Participants can file a Content Report against a Marketplace Listing or Comment for fraud, safety, privacy, or staleness without receiving Gems.
Moderators can review the report queue, independently resolve every report, and hide reported or directly selected content with a required reason whose resolution and audit records cannot be rewritten or deleted.
Reply recipients, affected content authors, and reporters can see relevant non-push notifications in their private profile.

## Acceptance mapping

| Requirement | Change | Verification |
| --- | --- | --- |
| Authenticated Participants can add Comments and one level of replies to Marketplace Listings. | Add Comment persistence, a Marketplace Comment HTTP interface guarded by Participant authentication, completed public profile, visible-target checks, and the existing `comments` policy requirement, plus an accessible thread/composer on each Marketplace Listing. | Focused HTTP test covers public reads, authentication, incomplete profiles, policy gating, top-level creation, reply creation, private-field exclusion, rejection of a reply to a reply, and direct database rejection of deeper nesting. Playwright covers visible creation and reply behavior. |
| Authors can edit Comments with an edited marker and delete them with placeholders when replies remain. | Add author-only edit and delete operations, public edit metadata, and tombstone rendering for removed parents or Comments retained by unresolved reports. Policy acceptance gates creation and editing but not deletion. | Focused HTTP test proves ownership checks, both deletion paths, report-retained deletion, and deletion after policy renewal. Playwright proves the edited marker and removed-parent placeholder remain visible with the reply. |
| Obvious email addresses and phone numbers trigger a warning before submission. | Add reusable obvious-contact detection, server-enforced confirmation, and an accessible UI confirmation step that identifies the detected contact type without echoing private text. | Focused service or HTTP examples cover obvious email, international/local phone shapes, and ordinary text. Playwright proves the first submission warns and only explicit confirmation creates the Comment. |
| Participants can report posts and Comments for fraud, safety, privacy, or staleness without earning Gems. | Add retention-governed Content Report evidence with an atomically captured sanitized target snapshot and an authenticated report interface for visible Marketplace Listings and Comments, plus report controls in the listing and Comment UI. | Focused HTTP test covers all allowed target and reason types, invalid or hidden targets, snapshot stability after edit/delete, private-field exclusion, and unchanged Gem balance and ledger. Playwright files both a Comment report and the Marketplace Listing report needed by the moderation journey. |
| Moderators can review and hide reported content with an immutable reason. | Add a Moderator report queue, immutable terminal report resolutions, direct Comment moderation, transaction-neutral content-visibility helpers, and same-transaction target transition, audit, resolution, and notification writes. Reports support hidden, already-unavailable, and dismissed outcomes so duplicate or pre-hidden targets cannot strand open reports. | Focused HTTP test covers role enforcement, required reason, direct Comment hiding, hidden public output, duplicate and pre-hidden report resolution, report-after-edit/delete behavior, atomic rollback, immutable resolution/audit records, and duplicate resolution rejection. Playwright proves the visible report queue and disappearance or placeholder behavior after moderation. |
| End-to-end tests cover the full report journey. | Add one issue-focused Playwright scenario that launches Participants and a Moderator, accepts policies, creates and reports content, moderates it, and verifies public and private outcomes. | Run the focused scenario on mobile and desktop, then run the complete Playwright suite. |
| Participants receive non-push reply and moderation notifications. | Add in-app notification persistence, a private notifications endpoint, and a chronological profile notification section. | Focused HTTP test proves recipient scoping and absence of private fields. Playwright verifies reply and moderation notifications for the intended Participants. |
| Comments are public while protected writes preserve privacy. | Return public display name and public Participant ID only, never email, external subject, private Participant ID, or Ownership Evidence. | HTTP response assertions search serialized bodies for known private values. Existing anonymous Marketplace browsing remains green. |

## Feature changes

1. Add one idempotent SQLite migration for Comments, retention-governed Content Report evidence, immutable report resolutions, current Comment moderation state, and in-app notifications.
The schema will use explicit `target_type` and `target_id` values because Marketplace Listings are seeded Source Feed data rather than database rows.
Content Reports will capture the target type, target ID, reporter, reason category, and sanitized evidence snapshot atomically at submission, but report evidence and reporter identity will not receive no-update/no-delete triggers because production retention and anonymization procedures remain an operational gate under ADR 0005.
Immutable report resolution and audit rows will retain the terminal outcome and required Moderator reason without copying the reported text.
Database checks, foreign keys where applicable, a trigger rejecting a parent that is itself a reply, unique keys, and no-update/no-delete triggers on resolution and audit facts will enforce nesting and immutability outside the HTTP service.

2. Add a cohesive public Comment service and routes as the first vertical slice.
The public read model will return top-level Comments with at most one reply collection, sanitized author identity, edited state, and either visible body text or an author-deleted/Moderator-hidden placeholder.
Creation and editing will validate a visible Marketplace Listing, completed public profile, Comment body length, one-level parent relationship, authorship, current Comment policy acceptance, and explicit confirmation of obvious contact details.
Deletion will validate only authentication and authorship so a material policy renewal cannot prevent an author from removing unsafe or private content.
Successful reply insertion and its in-app notification for another Participant will commit in one transaction, and a database trigger will independently reject a reply to a reply.
Hidden Marketplace Listings will return not found from public Comment and report interfaces, and new replies to author-deleted or Moderator-hidden parent Comments will be rejected while existing replies remain publicly readable beneath a placeholder.

3. Add Marketplace Comment threads to each visible Listing card.
Anonymous visitors will be able to expand and read the thread but will be directed to authenticate before writing.
Authenticated Participants will receive accessible forms for new Comments, replies, editing, deletion, and contact-detail confirmation, with focusable status and error feedback.
The thread will show public Participant links, edited markers, author-deleted placeholders, and Moderator-hidden placeholders without exposing private profile information.

4. Add retention-governed Content Report submission as the second vertical slice.
The service will accept only Marketplace Listing and Comment targets and only fraud, safety, privacy, or staleness reasons.
Reporting will require authentication and a completed public profile, will accept only currently visible targets, will never call the Gem service, and will preserve the reporter's balance and ledger.
The report transaction will capture a sanitized evidence snapshot before acknowledging submission, so later edits or author deletion do not change what the Moderator reviews.
An author deletion will physically remove an unreferenced Comment with no replies, but will retain a body-cleared tombstone when replies or an unresolved Content Report require target continuity.
The UI will provide compact accessible report forms on a Marketplace Listing and each visible Comment.

5. Add the Moderator Content Report queue and moderation transaction as the third vertical slice.
The queue will contain open reports with the sanitized snapshot captured at submission and reporter public identity.
Refactor Marketplace Listing moderation behind transaction-neutral visibility mutation helpers while preserving transaction-owning direct moderation entry points.
Add the equivalent direct Comment hide seam required by ADR 0006, with an immutable audit reason and moderation notification even when no Content Report exists.
Resolving a report will validate a reason and terminal outcome, transition a still-visible target when hiding is requested, append an immutable resolution, append the existing immutable audit event, and create affected-participant notifications in one transaction.
Every report can reach a terminal `hidden`, `already_unavailable`, or `dismissed` outcome even when another report or direct moderation already hid or removed the target.
The Moderator screen will separate the report queue from direct Marketplace and Comment moderation and will prevent already resolved reports from being acted on again.

6. Add private notification history to the Participant profile.
Notifications will be generated for replies from another Participant, direct moderation affecting a Comment author, and report outcomes affecting the reporter or content author.
The private endpoint will scope rows to the current Participant and return display-safe message metadata without exposing another Participant's email or stable external subject.

7. Update development reset behavior, repository context, and README endpoint documentation to include the new persisted feature.
Generated artifacts and `CHANGELOG.md` will remain untouched.

## Commit points

### 1. Add public Marketplace Comment threads

- Commit title: `Add public Marketplace Comment threads`
- Scope: migration foundations for Comments and notifications, database nesting enforcement, Comment service and routes, frontend Comment thread/composer, contact-detail warning, focused HTTP coverage, and Participant-facing Playwright coverage for create, reply, edit, delete, and notification behavior.
- Prerequisites: issue branch based on refreshed `origin/main`; active policy data from issue #4.
- Tests: run the focused Comment HTTP test on every red-green slice, run the focused Playwright Comment scenario after UI integration, run `npm test`, and run `npm run build`.
- Proof: anonymous public reads remain available; completed-profile and policy-accepted creation/editing succeeds; deletion remains available after policy renewal; invalid nesting, hidden targets, and ownership fail; the warning requires confirmation; author changes render correctly; reply creation and notification are atomic and scoped to the intended Participant.

### 2. Add Content Report moderation journey

- Commit title: `Add Content Report moderation journey`
- Scope: retention-governed Content Report evidence, immutable resolution persistence, atomic evidence snapshots, report submission API/UI, Moderator report queue, transaction-neutral visibility helpers, direct Comment moderation, listing and Comment hide transactions, immutable audit and notifications, reset support, focused HTTP tests, and the complete Playwright report journey.
- Prerequisites: public Comment thread commit and existing Moderator/audit implementation from issue #5.
- Tests: run the focused report HTTP test on every red-green slice, run the focused report Playwright scenario on mobile and desktop, run `npm test`, and run `npm run build`.
- Proof: reports accept only specified reasons and visible valid targets, snapshots survive later edit/delete, Gem state stays unchanged, only Moderators can resolve reports, every report can terminate even when its target is already unavailable, direct and report-based moderation update public output atomically, immutable resolution/audit records reject update/delete, and reporters/authors receive the intended notification.

### 3. Document and verify public discussion controls

- Commit title: `Document public discussion controls`
- Scope: update `README.md` and `CONTEXT.md` with stable behavior, endpoint inventory, privacy boundaries, and validation commands; include only documentation corrections learned during implementation.
- Prerequisites: both feature commits are green.
- Tests: run the full `npm test`, `npm run build`, and `npm run test:e2e` commands once against the final tree.
- Proof: documentation matches shipped behavior, every backend test passes, the production frontend builds, and both Playwright projects pass.

## Verification

### Agreed public seams for test-driven slices

- HTTP seam: the Express application created by `createApp` with an in-memory SQLite database, exercised through authenticated and anonymous requests.
- Participant UI seam: the Marketplace Listing Comment thread and private profile as rendered and operated through Playwright.
- Moderator UI seam: the Content Report queue and hide action as rendered and operated through Playwright.
- Persistence invariant seam: direct nesting attempts and direct mutation attempts against immutable resolution, audit, and Gem Ledger records.

Tests will exercise these public seams and will not mock internal services.
Each behavior slice will start with one failing focused test, add the smallest implementation that makes it pass, and then proceed to the next slice.

### Unit and integration

- Add focused HTTP integration coverage for Comment reads and writes, completed-profile enforcement, authorization, creation/edit policy gating, policy-independent deletion, one-level replies at both service and database seams, hidden/deleted parent rules, hidden listing rules, contact-detail confirmation, editing, deletion, sanitized identity, transaction rollback, and notification scoping.
- Add focused HTTP integration coverage for Content Report validation, atomic and stable evidence snapshots, report-then-edit, report-then-delete, Gem invariance, Moderator queue access, direct and report-driven listing/Comment hiding, already-unavailable and dismissed resolutions, immutable resolution and audit state, duplicate handling, and rollback at transaction failure points.
- Use worked literal examples for contact-detail detection rather than recomputing expectations with the production detector.

### End to end

- Baseline route: `/`, after `POST /api/dev/reset`, with the seeded Marketplace Listing grid visible.
- Viewports: Playwright's configured iPhone 13 mobile project and Desktop Chrome project.
- Participant path: launch through the mock uNivUS handoff, complete profile, accept current Comment policies, expand a Marketplace Listing thread, submit a warned Comment, reply from a second Participant, edit, delete, report, and inspect notification history.
- Moderator path: launch and enroll a Moderator, open `/moderation/marketplace`, inspect the captured report evidence, enter an immutable reason, hide the reported target, independently resolve a second report for the same target, and verify the public result.
- Distinguishing assertions: only one reply level is offered, explicit contact confirmation is required, edited and deleted states are textually announced, captured report evidence does not change after an author edit, report creation does not change Gems, a hidden Comment uses a placeholder, a hidden Marketplace Listing leaves the public feed, duplicate reports reach terminal outcomes, and relevant notifications appear only in the intended private profiles.

### Accessibility and UI proof

- Use semantic headings, lists, forms, labels, buttons, links, status regions, and alert regions for all new interactions.
- Confirm keyboard operation and visible focus for expand, compose, reply, edit, delete, report, and moderation controls.
- Verify mobile layout has no horizontal overflow and touch controls retain at least the existing control height conventions.
- Capture and inspect baseline and final screenshots at the same seeded listing, route, viewport, identity, and thread state if the local browser workflow supports durable evidence.

### Final checks

- Run `npm test` once after all focused backend tests are green.
- Run `npm run build` regularly because the repository has no separate TypeScript or lint script.
- Run `npm run test:e2e` exactly once at the end after focused Playwright scenarios are green.
- Run the requested two-axis code review against `origin/main` after the implementation commits, fix all material findings, rerun affected checks, and commit the corrections.

## Risks and recovery

- Risk: a polymorphic target references a nonexistent seeded Marketplace Listing or a Comment in a different post thread.
Mitigation: validate target existence and thread ownership inside the service before every write, and cover invalid target IDs in HTTP tests.
- Risk: SQLite cannot express the complete one-reply-level rule with a simple foreign key.
Mitigation: enforce it both in the service transaction and in an insertion/update trigger that rejects a parent which itself has a parent.
- Risk: public response payloads leak private Participant fields through convenient row spreading.
Mitigation: construct explicit public read models and assert against known private values at the HTTP seam.
- Risk: hiding a reported target conflicts with its existing moderation state or another report resolution.
Mitigation: make each report independently terminal with `hidden`, `already_unavailable`, or `dismissed`; only the same report being resolved twice returns a conflict.
- Risk: report submission followed by target edit or deletion changes or destroys the evidence a Moderator needs.
Mitigation: capture a sanitized evidence snapshot in the report transaction, retain a body-cleared Comment tombstone while an unresolved report exists, and test report-then-edit and report-then-delete paths.
- Risk: composing report resolution around the current transaction-owning listing moderation service creates nested transactions or partial writes.
Mitigation: extract transaction-neutral visibility mutations and keep transaction ownership at the direct moderation and report-resolution entry points, with rollback tests for target, audit, resolution, and notification writes.
- Risk: retaining reported evidence forever preserves privacy-invasive content beyond operational need.
Mitigation: keep immutable facts limited to resolution and audit records, leave report evidence and reporter identity retention-governed, document the production retention procedure as an ADR 0005 launch gate, and avoid copying evidence into immutable records.
- Risk: UI state becomes stale across Comment edits, deletion, replies, reports, or moderation.
Mitigation: keep one per-listing refresh boundary after mutations and render server-returned truth rather than predicting nested state locally.
- Risk: long seeded card content plus Comment controls becomes visually dense on mobile.
Mitigation: collapse threads by default, reveal actions progressively, and inspect both configured Playwright viewports.
- Recovery: each feature commit is independently green and can be reverted without a data rewrite in this tracer environment.
- Recovery: the new migration is additive; if rollout must stop before production data exists, application routes and UI can be reverted while the unused tables remain harmless.
- Recovery: once real moderation records exist, retain additive immutable tables and disable the feature at the route/UI layer rather than deleting audit evidence.

## Open blockers

No external blocker prevents implementation.
The plan adopts an in-app chronological profile list for non-push notifications because the issue does not request push delivery or specify read-state behavior.
The plan treats issue #6's explicit Marketplace acceptance criterion as the implementation scope while shaping Comment persistence around a post type and post ID so ADR 0006 can extend it to future Buffet, Lost-Item, and Found-Item post surfaces without a schema rewrite.
