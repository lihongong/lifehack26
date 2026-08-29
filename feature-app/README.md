# ShareNUS

React/Vite frontend and Node/Express/SQLite backend for the ShareNUS tracer bullets.

```bash
npm run install:all
npm run dev
```

The development command continuously rebuilds the frontend and serves the complete app and API from `http://127.0.0.1:3000/`.

For the complete authenticated handoff, build and start the Node server, then open the served mock uNivUS page:

```bash
npm run build
npm start
```

- Mock uNivUS entry: `http://127.0.0.1:3000/univus/`
- Feature app: `http://127.0.0.1:3000/`

Participant data is stored in `backend/data/community-exchange.sqlite` and is ignored by Git.
Set `PLATFORM_OPERATOR_SUBJECT` to the stable uNivUS subject allowed to bootstrap the first Platform Operator.
Without that deployment setting, all authenticated people remain Participants.
Set `SOURCE_ID_HASH_SECRET` in production before processing any Source Feed author identifier.

## Public Buffet feed

Anonymous visitors can browse fictional active Buffet Posts at `/buffets` and filter them by search text, exact NUS Zone, unclear location, and freshness.
Posts expire at a stated collection deadline or use a two-hour fallback from their source time.
The browser refreshes the feed every 30 seconds.

The public endpoint is `GET /api/buffets?query=&zone=&freshness=`, where freshness is `active`, `30`, or `60` and zone is `all`, `unclear`, or a canonical zone ID.
The response includes the `nus-zones-v1` static aliases and adjacency graph for later Nearby Zone features.

For a manual smoke test, open `/buffets` without signing in, search for `vegetarian`, filter Science and Location unclear, compare the three freshness options, and verify every card shows either Collect by or Estimated expiry.

## Protected community actions

Marketplace, Buffets, Lost & Found, active policy documents, and public profiles remain publicly readable.
Posting, Comments, claims, alerts, and Redemptions require an authenticated Participant who has accepted the policy versions currently required for that action.

The private profile includes demonstration controls for exercising each policy gate and an immutable acceptance history.
Policy versions and action mappings are seeded by SQLite migrations; production does not expose policy activation controls.

Key policy endpoints:

- `GET /api/policies/active`
- `GET /api/me/policy-status?action=comments`
- `GET /api/me/policy-acceptances`
- `POST /api/me/policy-acceptances`
- `POST /api/protected-actions/:action`

## Privileged operations

The Platform Operator can enroll and remove Moderators at `/operator`, where the complete immutable audit trail is also visible.
Moderators hide or restore Marketplace Listings with a required reason at `/moderation/marketplace`.

Key privileged endpoints:

- `GET /api/operator/moderators`
- `POST /api/operator/moderators`
- `DELETE /api/operator/moderators/:participantId`
- `GET /api/operator/audit`
- `GET /api/moderation/marketplace`
- `PATCH /api/moderation/marketplace/:listingId`

## Public Comments and Content Reports

Every Marketplace Listing exposes a public one-level Comment thread.
Creating or editing a Comment requires an authenticated Participant with a completed public profile and current acceptance of the policies required for Comments.
Authors can delete their Comments without renewed policy acceptance, and a removed-parent placeholder preserves replies.
Obvious email addresses and phone numbers require explicit confirmation before a Comment is published.

Authenticated Participants can submit a Content Report for a Marketplace Listing or Comment using fraud, safety, privacy, or staleness as the reason category.
The submission transaction captures sanitized evidence for Moderator review and never awards Gems.
Report evidence remains subject to operational retention and anonymization procedures, while the Moderator resolution reason and audit event are immutable.
Moderators can hide reported content, resolve content that is already unavailable, dismiss a report, or directly hide a Comment with a required reason.

Replies and moderation outcomes create private in-app notifications on the Participant profile.
Public Comment payloads expose only the author's public ID and display name.

Key discussion and reporting endpoints:

- `GET /api/listings/:listingId/comments`
- `POST /api/listings/:listingId/comments`
- `PATCH /api/comments/:commentId`
- `DELETE /api/comments/:commentId`
- `POST /api/content-reports`
- `GET /api/me/notifications`
- `GET /api/moderation/reports`
- `PATCH /api/moderation/reports/:reportId`
- `PATCH /api/moderation/comments/:commentId`

## Source Feed fixtures and gates

Marketplace demonstration data is replayed through an allowlisted Telegram-style fixture without a live chat, token, or network request.
Non-production startup and reset also seed fictional display-name and Telegram-contact consent for the monitor and bike-lock authors, so the public demo includes two working contact buttons while the other authors remain withheld.
Representative Telegram message text is parsed offline with deterministic labeled-field and controlled-keyword rules for Study, Room & Living, Transport, and Electronics.
Raw author identity, contact lines, and source-message text are not persisted; contact-like text is removed before normalized Listings or safe discrepancy candidates are stored.
Replay the deterministic baseline or another bundled scenario with:

```bash
npm run replay:source-fixtures
npm run replay:source-fixtures -- consent-lifecycle
npm run replay:source-fixtures -- marketplace-unparseable
```

Production starts with an empty Source Feed whose written-permission, privacy-review, and explicit live-enable gates are all disabled.
The live adapter factory cannot be called until all three per-feed gates pass.
The current increment intentionally provides no real Telegram connector.

Platform Operator endpoints:

- `GET /api/operator/source-feeds`
- `PATCH /api/operator/source-feeds/:feedId/gates`

Moderator endpoints:

- `GET /api/moderation/source-discrepancies?status=open`
- `POST /api/moderation/source-discrepancies/:discrepancyId/resolution`
- `GET /api/moderation/source-feeds/:feedId/author-consents`
- `POST /api/moderation/source-feeds/:feedId/author-consents`
- `DELETE /api/moderation/source-feeds/:feedId/author-consents/:consentId`

Fixture replay is exposed through `/api/dev/source-feeds/replay` only outside production and accepts allowlisted fixture names rather than paths or arbitrary payloads.
Public Marketplace responses omit private evidence, hashed identifiers, original Source Feed URLs, and unconsented attribution.
They include `sourceTime`, `expiresAt`, and `attributionState`, while `updatedAt` remains a compatibility alias for `sourceTime`.
Listings expire publicly 30 days after their latest applied source create or edit, and a later source edit resets expiry and reactivates the normalized Listing.
Unparseable content becomes a Source Discrepancy that a Moderator may retain or correct and publish without overriding system identity, source time, provenance, expiry, or attribution.

Run verification with `npm test`, `npm run build`, and `npm run test:e2e`.
The end-to-end command builds the current frontend before starting Playwright.
