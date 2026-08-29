# ShareNUS

ShareNUS aggregates time-sensitive community posts and rewards participation across marketplace, buffet, and lost-property experiences.

## Current implementation architecture

The tracer-bullet application currently uses a React and Vite frontend served by a Node and Express backend with SQLite persistence.
This implementation keeps the current app working while ADR 0004 records the intended production move to Next.js, Vercel, and Supabase.
`backend/src/app.js` is a side-effect-free application factory so tests can inject an in-memory database, clock, identity adapter, and Platform Operator subject.
The frontend obtains the private authenticated Participant from `GET /api/auth/session` and uses the returned role to expose only the relevant privileged navigation.

## Authentication and privileged roles

The uNivUS adapter supplies a stable external subject and private email to a one-time launch assertion.
Session tokens are random, stored only as hashes, carried by an HTTP-only same-site cookie, and resolved against the database on every request.
The first authenticated identity whose stable subject matches the deployment-only `PLATFORM_OPERATOR_SUBJECT` becomes the sole Platform Operator.
There is no public Platform Operator elevation endpoint, and missing or mismatched configuration fails closed.
The Platform Operator can enroll an existing Participant as a Moderator by exact private email and can remove a Moderator with a required reason.
Moderator removal deletes the current privileged role and revokes all of that Participant's active sessions in the same transaction.
Every Moderator has one unrestricted Moderator role rather than a collection of narrower permissions.

## Moderation and immutable auditing

The current demonstrable sensitive action is hiding or restoring a Marketplace Listing through `/api/moderation/marketplace`.
Public Marketplace queries exclude hidden listings, while Moderators can inspect both visible and hidden listings on `/moderation/marketplace`.
Moderators can also publish and soft-delete manual Marketplace Listings through the same surface, with records kept separate from imported Source Feed provenance and defaulting to a 30-day public lifetime.
Every successful bootstrap, Moderator enrollment, Moderator removal, Marketplace create, Marketplace delete, Marketplace hide, and Marketplace restore writes an audit event in the same transaction as the sensitive change.
Audit events record the event type, actor, target, reason, timestamp, and whether the action was self-directed.
Self-directed Marketplace actions are inferred on the server from an internal Source Feed author subject and are never accepted from the client or exposed publicly.
SQLite triggers reject updates and deletions from the audit log.
Only the Platform Operator can read the complete audit trail through `/api/operator/audit` and `/operator`.

## Source Feed ingestion and consent

Marketplace Listings are persisted from versioned Telegram-style fixtures rather than a hard-coded application array.
Fixture replay uses an allowlist, an injected clock, and a private source-identity hashing secret, and it never reads a Telegram token or opens a network connection.
The live adapter boundary remains disabled until a Platform Operator records per-feed written permission, approves the privacy review, and explicitly enables live ingestion.
Revoking either approval disables live ingestion automatically.

Processed update identifiers and non-identifying deletion tombstones are immutable.
Duplicate updates are idempotent, rate-limited updates remain retryable without advancing the feed cursor, and updates older than the configured window become Source Discrepancies.
Monotonic source edits and deletions propagate automatically, while stale, divergent, or otherwise conflicting updates wait for a Moderator to apply the source version or retain the stored version with a reason.

A Moderator records author consent separately from Source Feed permission, with independent public display-name and contact scopes and a private evidence reference.
Public Marketplace responses omit source identifiers, author identity, and contact data unless active scoped consent permits the relevant attribution.
Non-production startup and reset idempotently seed fictional name-and-contact consent for the monitor, bike-lock, and Gem-demo keyboard fixture authors, leaving calculator and lamp attribution withheld; production never receives these demonstration consents.
Consent withdrawal synchronously removes imported content, scrubs stored identity, contact, and evidence fields, redacts staged discrepancy content, and leaves only non-identifying operational records.
Gate, consent, and discrepancy decisions are written to the immutable Platform Operator audit trail.

## Public Buffet feed and NUS Zones

The anonymous Buffet feed uses fictional posts anchored once at application startup and served through `GET /api/buffets`.
Seeded fictional Buffet Posts remain available throughout a demo and display no expiry countdown. Future non-fictional posts retain the stated collection deadline or two-hour fallback expiry behavior.
The public feed supports text search, exact-zone filtering, `Location unclear`, and Active, 30-minute, or 60-minute freshness filters.
Ambiguous locations remain visible under All zones and Location unclear but never match a canonical NUS Zone.
The frontend refreshes the feed every 30 seconds so newly expired posts disappear without authentication.

The static graph version is `nus-zones-v1` and contains UTown, Museum/UCC, CDE, Central, FASS, Business, Computing, PGP, Science, and Medicine/Kent Ridge MRT.
Approved aliases map as follows: ERC to UTown; SRC and UCC to Museum/UCC; EA to CDE; YIH and CLB to Central; AS5 to FASS; BIZ2 to Business; COM2 and COM3 to Computing; PGPR to PGP; LT27 and S17 to Science; and YLL, NUH, and Kent Ridge MRT to Medicine/Kent Ridge MRT.
The undirected edges are UTown-Museum/UCC, UTown-CDE, Museum/UCC-CDE, Museum/UCC-Central, Museum/UCC-FASS, CDE-Central, CDE-Business, Central-FASS, Central-Business, Central-Computing, Central-Science, FASS-Business, Business-Computing, Business-PGP, Computing-PGP, Computing-Science, PGP-Science, PGP-Medicine/Kent Ridge MRT, and Science-Medicine/Kent Ridge MRT.
The graph is an implementation inference for Nearby Zone behavior, not an official walking-time claim, and the public issue #7 filter does not include adjacent zones.

## Found-Item custody and rewards

Found-Item Reports use the same controlled property categories, NUS Zones, encrypted private-data boundary, and sanitized image pipeline as Lost-Item Posts.
Participant submissions remain private until Moderator approval creates a separate contact-free public description and approved photo subset.
Approved reports may receive a private, revisioned handover appointment only when the Platform Operator has approved the custody procedure, recorded its private evidence reference, explicitly enabled custody, and kept at least one Custody Location active.
Deactivating the final active Custody Location or revoking procedure approval disables custody automatically without altering immutable appointment snapshots.

The existing Moderator role acts as Custodian for this tracer bullet.
Creating a Found-Item Report atomically creates an exactly-once 20-Gem `FOUND_ITEM_REPORT` ledger entry linked to that report.
Intake atomically snapshots encrypted private evidence and condition notes, retains all sanitized photos privately, publishes only the intake-approved subset, marks the report received, and moves its public Comment thread and open Content Reports to the Found Item.
Editing, withdrawal, rejection, approval, arranged handover, physical intake, abandonment, and other closure never add another reward.
Found Items expose the controlled condition value publicly, while Participant identity, original text, Private Identifying Details, custody evidence, appointment details, location instructions, and condition notes remain private.

## Gem participation rewards

The immutable Gem Ledger is the source of truth for balances and enforces one reward per Participant, reason, and source record.
Selecting “I’m going” awards 2 Gems for each distinct active Buffet Post, with at most three rewarded Buffet Posts per Singapore day.
Opening a consented Marketplace contact awards 1 Gem for each distinct Marketplace Listing, with at most three rewarded contacts per Singapore day; anonymous visitors may still open the contact without a reward.
A detected sale awards 30 Gems each to its buyer and seller, with at most three sale rewards per Participant per Singapore day across buyer and seller roles.
The non-production Telegram fixture adapter provides one seller-owned keyboard listing, one seeded Demo Buyer contact, and an owner-only “sold” reply control so the sale flow is demonstrable without live Telegram or WhatsApp access.
Processed sales are exact-once and disappear from the active public Marketplace feed. Production exposes no simulated sold endpoint.
Daily uNivUS login and physical Found-Item intake no longer award Gems; immutable historical entries remain readable.

## Private Buffet Alerts and Helpful Alert review

Each authenticated Participant starts with no selected NUS Zone and Buffet Alerts off.
The private profile and Buffet Alert settings use the canonical `nus-zones-v1` identifiers, while public Participant profiles never expose the selected zone or alert preference.
Enabling Buffet Alerts or changing the zone of an enabled subscription requires current alert-policy acceptance.
A Participant can always opt out without renewed policy acceptance, and clearing the selected NUS Zone atomically turns Buffet Alerts off.

Buffet Posts are persisted under a Source Feed namespace and stable source post identifier before delivery is reconciled.
A fresh Buffet Post creates at most one private Buffet Alert and one linked in-app notification for each eligible Participant whose selected zone is the post's zone or one adjacent graph hop away.
Location-unclear, time-expired, possibly-gone, and confirmed-expired Buffet Posts do not create alerts.
Source edits and repeated reconciliation preserve the original delivery identity and cannot duplicate either the Buffet Alert or its notification.

A Participant can record one terminal Helpful Alert outcome for their own Buffet Alert by marking it helpful or reporting food gone.
A food-gone outcome marks the Buffet Post possibly gone, suppresses later delivery, and joins the current open Moderator review cycle.
Each review cycle preserves a sanitized report-time Buffet Post snapshot and aggregates concurrent signals without exposing reporter identity publicly.
A later food-gone outcome can open a new cycle after restoration, while only one cycle can remain open for a Buffet Post at a time.

A Moderator can restore a reviewed Buffet Post or confirm it expired with a required reason.
The resolution and `buffet_post_restored` or `buffet_post_expired` audit event are recorded atomically, and both the Helpful Alert outcome and review resolution are immutable.
Restoration never duplicates an earlier Participant delivery, and a Buffet Post whose source expiry has passed resolves as expired rather than being revived.

## Development and verification

Non-production uNivUS launches support fixed `operator`, `moderator`, and `participant` demo identities through the `x-demo-identity` request header.
Production rejects the mock adapter and never accepts demo identity selection.
Playwright starts the app with an in-memory database and the mock Operator's stable subject configured for repeatable role and session-revocation tests.
Non-production startup and reset replay the fictional baseline Marketplace fixture, while production starts with an empty disabled Source Feed.
Run `npm run replay:source-fixtures` to verify the baseline fixture or append an allowlisted fixture name such as `consent-lifecycle`.
Run `npm test`, `npm run build`, and `npm run test:e2e` from this directory before merging a change.

## Issue workflow

Each GitHub issue must be resolved on a new issue-specific branch created from the latest remote `main`.
The completed branch must be pushed and merged through a pull request containing `Closes #N` rather than committed directly to `main`.

## Language

**Participant**:
A person who uses the application and may earn or spend Gems.
_Avoid_: User, account holder

**Gem**:
A non-transferable participation credit with no cash value.
_Avoid_: Credit, coin, currency, point

**Source Feed**:
An authorized stream of community posts originating outside the application.
_Avoid_: Scrape, Telegram dump

**Marketplace Listing**:
A Source Feed post offering an item through the NUS Marketplace community.
_Avoid_: Product, in-app listing

**Found-Item Report**:
A Participant's report that an apparently lost item has been found and can be surrendered to the Custodian.
_Avoid_: Lost post, sale listing

**Lost-Item Post**:
A Participant's report describing property they have lost and want help locating.
_Avoid_: Found-Item Report, claim

**Found Item**:
Physical property recorded by the Custodian after a Participant completes a verified handover.
_Avoid_: Listing, inventory, product

**Private Identifying Detail**:
Information withheld from a Found Item's public description so that it can be used as Ownership Evidence.
_Avoid_: Secret answer, hidden field

**Custodian**:
The application operator responsible for receiving, storing, and releasing found property.
_Avoid_: Finder, seller, owner

**Moderator**:
A trusted operator with authority across Source Feeds, custody, claims, exclusions, Redemptions, Gems, and content moderation.
_Avoid_: Admin, reviewer

**Content Report**:
A Participant's request for Moderator review of content believed to be fraudulent, unsafe, privacy-invasive, or stale.
_Avoid_: Complaint, flag

**Comment**:
A public response from a Participant to a post or another Comment, displayed under the Participant's chosen public name.
_Avoid_: Message, claim, chat

**Verified Reunion**:
The recorded physical release of a Found Item by the Custodian to a successful Claimant.
_Avoid_: Match, approved claim, return

**Operational Record**:
A custody, handover, Gem, fraud, or audit record retained without an active Participant profile when needed for an unresolved item or a defined retention period.
_Avoid_: Deleted account data, archive

**Match Candidate**:
A possible relationship between a Lost-Item Post and a Found-Item Report that a Moderator must review before either Participant is contacted.
_Avoid_: Match, owner

**Claimant**:
A person asking the Custodian to return a Found Item that the person asserts is theirs.
_Avoid_: Buyer, requester

**Ownership Evidence**:
Non-public identifying details or other proof that supports a Claimant's claim to a Found Item.
_Avoid_: Description, verification answer

**Gem Ledger**:
The auditable record of Gem awards, spending, refunds, and Moderator adjustments for a Participant.
_Avoid_: Balance history, wallet

**Redeemable Item**:
Found property that the Custodian has explicitly made eligible for acquisition with Gems after its claim period ends.
_Avoid_: Unclaimed listing, lost item for sale

**Valuation Suggestion**:
An explainable Gem price calculated from a Moderator-maintained pricing guide and a potential Redeemable Item's category, age, and condition.
_Avoid_: Appraisal, cash value, automatic price

**Excluded Item**:
A Found Item temporarily prevented from becoming redeemable unless a Moderator removes the exclusion with a recorded reason.
_Avoid_: Banned item, prohibited listing

**Prohibited Item**:
A sensitive or unsafe Found Item that can never become redeemable, including identity documents, access credentials, payment instruments, medication, hazardous goods, and data-bearing electronics.
_Avoid_: Excluded Item, restricted listing

**Redemption**:
The Moderator-approved allocation of a Redeemable Item to a Participant in exchange for Gems.
_Avoid_: Purchase, sale, claim

**Redemption Request**:
A Participant's request to be selected by a Moderator for a Redeemable Item.
_Avoid_: Bid, order, purchase request

**Custody Location**:
The operator-configured place and instructions for handing Found Items to the Custodian or collecting released property.
_Avoid_: Pickup point, lost-and-found office

**Source Discrepancy**:
A conflict between a Source Feed post and the application's stored or inferred version that requires Moderator review.
_Avoid_: Sync error, bad import

**Buffet Post**:
A time-sensitive Source Feed post describing food available for community collection at a stated place.
_Avoid_: Buffet listing, food deal

**NUS Zone**:
A controlled campus area or building that a Participant may select as their general location or associate with a Buffet Post.
_Avoid_: GPS location, address, geofence

**Nearby Zone**:
The selected NUS Zone or one of its predefined adjacent zones.
_Avoid_: Radius, nearby location

**Buffet Alert**:
An opt-in notification about a fresh Buffet Post in a Participant's selected NUS Zone or a Nearby Zone.
_Avoid_: Ping, food notification

**Helpful Alert**:
A Buffet Alert that its receiving Participant explicitly marks helpful or uses to report that the food is gone.
_Avoid_: Open, view, click
