# NUS Community Exchange design standard

This document defines the visual and interaction standard for the Marketplace, Buffets, and Lost & Found tabs.
New exchange tabs should follow the same system so that the application feels like one product even when each feature presents different information.

## Principles

- Use one shared layout, type scale, control system, card shell, and interaction language.
- Express feature-specific meaning through copy, icons, badges, and small status accents.
- Do not give an entire feature a separate color palette or component style.
- Preserve clear information hierarchy before adding decoration.
- Keep public browsing usable without authentication and make private actions visibly secondary.

## Application shell and navigation

The exchange is mobile-first and supports viewport widths from 320 px upward.
The application shell fills the viewport up to a maximum width of 430 px and remains centered on wider screens.
The header, welcome banner, tab navigation, content area, and footer must appear in that order.

The exchange navigation contains equal-width tabs with a minimum 44 px target height.
The active tab uses the primary orange for its label and 3 px underline.
Inactive tabs use muted text, and keyboard focus uses the shared focus ring.
Every active tab must expose `aria-current="page"`.

## Design tokens

Use semantic tokens rather than feature names or repeated color literals.

| Purpose | Token | Value |
| --- | --- | --- |
| Page background | `--surface-page` | `#090909` |
| Card background | `--surface-card` | `#111722` |
| Raised control background | `--surface-raised` | `#171d2b` |
| Subtle inset background | `--surface-subtle` | `#0d141e` |
| Primary accent | `--accent-primary` | `#ff5b3f` |
| Supporting accent | `--accent-secondary` | `#5879ef` |
| Heading text | `--text-heading` | `#cbd5eb` |
| Muted text | `--text-muted` | `#aeb8ce` |
| Border | `--border-default` | `#2a3448` |
| Focus | `--focus-ring` | `#ffd36f` |
| Success | `--status-success` | `#8ed6a5` |
| Warning | `--status-warning` | `#ffd09f` |
| Danger | `--status-danger` | `#ff9a87` |

Cards use `--radius-card` at 16 px.
Controls use `--radius-control` at 12 px.
Use the shared spacing scale instead of introducing one-off margins whenever practical.

## Feed anatomy

Every top-level exchange feed begins with the same header anatomy.
The eyebrow is uppercase, 10 px, strongly weighted, and letter-spaced.
The `h2` is sentence case, 25 px, and uses heading text.
The live result count aligns to the lower edge of the title on the opposite side.
An optional description sits below the heading row in muted 11 px text.

Use the following copy for the current feeds.

| Tab | Eyebrow | Heading |
| --- | --- | --- |
| Marketplace | Browse publicly | Marketplace listings |
| Buffets | Available now | Fresh buffet posts |
| Lost & Found | Search campus | Lost & Found |
| Found property subsection | Found property | Found property |

## Filters and controls

Place a full-width search control before the remaining filters.
Place selects and dates in a two-column grid with a 10 px gap.
At viewport widths of 360 px or less, stack filter controls into one column.
Use a visible label above every select and date control.
Search controls may use a visually hidden label when the placeholder also describes the task.

Text fields, selects, and dates are 42 px tall with the shared raised surface, border, and control radius.
Hover may strengthen the border without changing layout.
Keyboard focus must use the shared focus color and a 3 px translucent ring.
Do not rely on placeholder text as the only accessible name.

## Cards and content hierarchy

All public results use the neutral exchange card shell.
The shell uses the card surface, default border, 16 px radius, and shared shadow.
Image cards use a 16:9 media area above 17 px content padding.
Cards without media use 17 px padding around the complete body.

Arrange card content in this order when the data exists.

1. Category, fixture label, freshness, or status row.
2. An 18 px `h3` title.
3. A 13 px description with 1.45 to 1.5 line height.
4. Primary facts such as price, location, or date.
5. Source and publication metadata.
6. Reports, comments, contact actions, or private alert actions.

Buffet location and expiry remain inset fact blocks because they are the primary scanning information for that feature.
Warning states may change a badge, icon, border, or inset fact block.
Warning states must not replace the neutral background of the complete card.

## Panels, forms, and states

Private settings, submissions, sign-in prompts, and personal record lists use the same exchange panel surface and border language.
Feature-specific panels may add one restrained accent border when their purpose needs emphasis.
Primary actions use orange, secondary actions use a neutral border, and destructive actions use the danger treatment.

Loading, empty, error, and success messages use a shared state container with centered text and consistent padding.
Errors use the danger token and `role="alert"`.
Loading and mutation success messages use an appropriate live region.
State changes must never be communicated by color alone.

## Accessibility

- Maintain one `h1` in the welcome banner and one labelled `h2` for each feed or subsection.
- Use semantic `nav`, `section`, `article`, `header`, `form`, and `footer` elements.
- Keep interactive targets at least 42 px tall, with 44 px preferred for primary navigation and actions.
- Provide visible keyboard focus for links, buttons, inputs, selects, and textareas.
- Use explicit labels or accessible names for every form control.
- Keep status labels in text even when an icon or color is present.
- Preserve readable contrast against every surface.

## Responsive behavior

At 320 px, content must remain readable without horizontal page scrolling.
The tab bar remains usable within the application width, and filter controls stack into one column at 360 px or less.
At 361 px through 430 px, paired filters use two equal columns.
Above 430 px, the application remains a centered mobile-width shell rather than introducing a separate desktop composition.

## Contribution checklist

- Reuse the shared feed header, search, and select primitives.
- Use the exchange feed, filter, card, panel, and state classes before adding a new variant.
- Add semantic tokens when a reusable visual role is missing.
- Keep feature identity in content and small accents rather than a separate layout or palette.
- Test the tab at 320 px, 430 px, and a desktop viewport.
- Verify active navigation, keyboard focus, empty states, loading states, errors, and long labels.
- Run the backend, build, and end-to-end verification commands before review.
