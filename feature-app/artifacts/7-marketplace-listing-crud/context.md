# Context

## Existing behavior

Anonymous visitors can browse sanitized Marketplace Listings.
Moderators can hide and restore listings, and the Platform Operator can inspect those decisions in the immutable audit log.
Marketplace data currently comes only from Source Feed records, so there is no user-visible path for a Moderator to create or delete a manual listing.

## Authorization decision

ADR 0003 gives every Moderator broad operational authority over Source Feeds and content, with immutable auditing of sensitive actions.
`CONTEXT.md` says the Platform Operator owns feed gates and complete audit access, while Moderators own Marketplace moderation.
The new workflow uses the Moderator role and does not invent an `admin` role.

## Data boundary

Manual Marketplace Listings must remain distinct from imported Source Feed posts.
They must not fabricate Telegram identifiers, feed permission, author consent, or Source Feed provenance.
Deletion is a soft deletion so public content disappears immediately while the immutable audit target and minimal lifecycle record remain available.

## Test seams

The agreed public seams for this issue are the Moderator HTTP API, the anonymous listings HTTP API, and the browser UI used by a Moderator and anonymous visitor.
Tests verify authorization, validation, public visibility, deletion, and audit events only through those interfaces.
