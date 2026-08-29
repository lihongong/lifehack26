# Issue #8 UI proof

## Claim

An authenticated Participant with no selected NUS Zone now sees private Buffet Alert settings that start unset and off, while the anonymous Buffet feed remains unchanged.
After choosing Central and opting in, the same Buffet page exposes exactly three Helpful Alert action groups for one-hop FASS, Business, and Science posts.
Food-gone feedback visibly marks the affected Buffet Post possibly gone, and the Moderator screen exposes an isolated review with reason, restore, and expire controls.

## Matched contract

- Baseline revision: `655110a92b68358e19d42fdb5e55ad5f0fdaca6e`
- Changed worktree: uncommitted issue #8 implementation on `feat/issue-8-nearby-in-app-buffet-alerts`
- Route: `/buffets`
- Browser: Codex in-app Chromium browser
- Viewports: 390 by 844 and 1280 by 900
- Time: `2026-08-30T04:00:00Z`
- Data: fictional startup Buffet Posts after development reset behavior
- Identity: synthetic authenticated Participant with current Terms and Privacy acceptance
- Initial private state: no selected NUS Zone and Buffet Alerts off

## Baseline assertion

The page displayed five fresh Buffet Posts and did not contain a `Buffet Alerts` settings heading.
The Participant's profile zone was unset.

## Changed assertion

The page displayed five fresh Buffet Posts, a visible `Buffet Alerts` settings heading, a `Buffet Alert NUS Zone` selector with an empty value, and an unchecked `Enable Buffet Alerts` checkbox.
After Central opt-in, the page exposed three `Matches a Nearby Zone` action groups.
After food-gone feedback, the affected Buffet Post displayed `Possibly gone` text.
The Moderator review exposed one labeled reason field, one `Restore Buffet Post` button, and one `Confirm expired` button.

## Evidence files

- Baseline Participant mobile: `/tmp/issue-8-ui-proof/before-participant-mobile.png`
- Changed default mobile: `/tmp/issue-8-ui-proof/after-default-mobile.png`
- Baseline Participant desktop: `/tmp/issue-8-ui-proof/before-participant-desktop.png`
- Changed default desktop: `/tmp/issue-8-ui-proof/after-default-desktop.png`
- Enabled alert mobile full page: `/tmp/issue-8-ui-proof/after-enabled-mobile-full.png`
- Enabled alert desktop full page: `/tmp/issue-8-ui-proof/after-enabled-desktop-full.png`
- Possibly-gone mobile: `/tmp/issue-8-ui-proof/after-possibly-gone-mobile.png`
- Possibly-gone desktop: `/tmp/issue-8-ui-proof/after-possibly-gone-desktop.png`
- Moderator review mobile: `/tmp/issue-8-ui-proof/after-moderator-review-mobile.png`
- Moderator review desktop: `/tmp/issue-8-ui-proof/after-moderator-review-desktop.png`

The screenshots remain untracked temporary evidence by design.
