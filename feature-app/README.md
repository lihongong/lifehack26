# NUS Community Exchange

React/Vite frontend and Node/Express/SQLite backend for the NUS Community Exchange tracer bullets.

```bash
npm run install:all
npm run dev
```

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

Run verification with `npm test`, `npm run build`, and `npm run test:e2e`.
The end-to-end command builds the current frontend before starting Playwright.
