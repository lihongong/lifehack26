# NUS Community Exchange

The NUS Community Exchange aggregates time-sensitive community posts and rewards participation across marketplace, buffet, and lost-property experiences.

## Current implementation architecture

The tracer-bullet application currently uses a React and Vite frontend served by a Node and Express backend with SQLite persistence.
This implementation keeps the current app working while ADR 0004 records the intended production move to Next.js, Vercel, and Supabase.
`backend/src/app.js` is a side-effect-free application factory so tests can inject an in-memory database, clock, identity adapter, and Platform Operator subject.
The backend runs every idempotent SQL migration at startup and keeps Participant, session, policy, Gem, Comment, Content Report, notification, privileged-role, moderation, and audit state in SQLite.
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
Every successful bootstrap, Moderator enrollment, Moderator removal, Marketplace hide, and Marketplace restore writes an audit event in the same transaction as the sensitive change.
Audit events record the event type, actor, target, reason, timestamp, and whether the action was self-directed.
Self-directed Marketplace actions are inferred on the server from an internal Source Feed author subject and are never accepted from the client or exposed publicly.
SQLite triggers reject updates and deletions from the audit log.
Only the Platform Operator can read the complete audit trail through `/api/operator/audit` and `/operator`.

## Public Comments, Content Reports, and notifications

Every Marketplace Listing exposes a publicly readable one-level Comment thread through `/api/listings/:listingId/comments` and the Marketplace Listing card.
Comment creation and editing require an authenticated Participant with a completed public profile and current policy acceptance for Comments.
Author deletion requires authentication and ownership but deliberately does not require renewed policy acceptance.
An author-deleted parent remains as a body-cleared placeholder while replies or unresolved Content Reports require continuity.
SQLite triggers independently reject reply-to-reply persistence, while public Comment read models expose only public Participant IDs and display names.
Obvious email addresses and phone numbers return a contact-detail confirmation response before publication, and the frontend requires an explicit public-sharing confirmation.

Authenticated Participants can submit Content Reports for Marketplace Listings and Comments using fraud, safety, privacy, or staleness categories.
Report submission atomically captures sanitized evidence without creating a Gem Ledger entry.
Report evidence and reporter identity remain retention-governed operational data rather than immutable data.
Report resolutions record an immutable terminal outcome and required Moderator reason without copying the reported evidence into the immutable record.
Each report can independently terminate as hidden, already unavailable, or dismissed, even when another report or direct moderation already changed the target.

Marketplace Listing and Comment visibility mutations are transaction-neutral so direct moderation and report resolution can compose them inside one transaction with audit and notification writes.
Moderators can directly hide Comments through `/api/moderation/comments/:commentId` and can resolve the queue exposed by `/api/moderation/reports`.
Replies, direct Comment moderation, and report outcomes create private in-app notifications available through `/api/me/notifications` and the Participant profile.

## Public Buffet feed and NUS Zones

The anonymous Buffet feed uses fictional posts anchored once at application startup and served through `GET /api/buffets`.
Posts expire at their stated collection deadline or exactly two hours after their source time when no deadline is stated.
The public feed supports text search, exact-zone filtering, `Location unclear`, and Active, 30-minute, or 60-minute freshness filters.
Ambiguous locations remain visible under All zones and Location unclear but never match a canonical NUS Zone.
The frontend refreshes the feed every 30 seconds so newly expired posts disappear without authentication.

The static graph version is `nus-zones-v1` and contains UTown, Museum/UCC, CDE, Central, FASS, Business, Computing, PGP, Science, and Medicine/Kent Ridge MRT.
Approved aliases map as follows: ERC to UTown; SRC and UCC to Museum/UCC; EA to CDE; YIH and CLB to Central; AS5 to FASS; BIZ2 to Business; COM2 and COM3 to Computing; PGPR to PGP; LT27 and S17 to Science; and YLL, NUH, and Kent Ridge MRT to Medicine/Kent Ridge MRT.
The undirected edges are UTown-Museum/UCC, UTown-CDE, Museum/UCC-CDE, Museum/UCC-Central, Museum/UCC-FASS, CDE-Central, CDE-Business, Central-FASS, Central-Business, Central-Computing, Central-Science, FASS-Business, Business-Computing, Business-PGP, Computing-PGP, Computing-Science, PGP-Science, PGP-Medicine/Kent Ridge MRT, and Science-Medicine/Kent Ridge MRT.
The graph is an implementation inference for Nearby Zone behavior, not an official walking-time claim, and the public issue #7 filter does not include adjacent zones.

## Development and verification

Non-production uNivUS launches support fixed `operator`, `moderator`, and `participant` demo identities through the `x-demo-identity` request header.
Production rejects the mock adapter and never accepts demo identity selection.
Playwright starts the app with an in-memory database and the mock Operator's stable subject configured for repeatable role, session-revocation, Comment, and Content Report tests.
The mobile project uses Playwright's Pixel 7 Chromium profile because the frozen WebKit runtime available on macOS 14 arm64 crashes before application startup.
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
