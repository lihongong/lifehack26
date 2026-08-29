# Issue #8: Nearby in-app Buffet Alerts

## Source metadata

- Repository: `bryanjhc/lifehack26`
- Canonical URL: https://github.com/bryanjhc/lifehack26/issues/8
- State: open
- Labels: `ready-for-agent`
- Assignees: `bryanjhc`
- Author: `realqijun`
- Created: `2026-08-29T07:24:12Z`
- Updated: `2026-08-29T14:09:56Z`
- Fetched: `2026-08-29T18:30:56Z`

## Relationships

The issue body declares that issues #3, #4, #5, and #7 block this work.
The GitHub connector did not expose separate parent or blocking relationship fields, so no additional relationship metadata was available to verify.

## Body

## What to build

Let an authenticated Participant opt into Buffet Alerts for one selected NUS Zone and its Nearby Zones.
Matching posts create deduplicated in-app notifications, Participants can mark alerts helpful or report food gone, and Moderators can resolve the resulting review.
Follow the confirmed product glossary and architectural decisions.

## Acceptance criteria

- [ ] Location and alerts start unset and off, and a Participant can explicitly select one NUS Zone and opt in.
- [ ] A fresh matching post creates one in-app alert for the selected zone or one adjacent graph hop.
- [ ] Edits and duplicate deliveries do not create duplicate alerts.
- [ ] A food-gone report stops new alerts, marks the post possibly gone, and enters Moderator review.
- [ ] Moderator restoration or expiry is audited, and helpful or food-gone feedback records the Helpful Alert outcome.

## Blocked by

- #3 - Participant login, profile, and daily Gems
- #4 - Versioned policies and protected actions
- #5 - Platform Operator, Moderators, and immutable audit
- #7 - Fresh public Buffet feed

## Comments

No comments were present when fetched.
