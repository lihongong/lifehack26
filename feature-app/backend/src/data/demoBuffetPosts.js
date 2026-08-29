import { resolveZoneAlias } from "./nusZones.js";

const minutes = (value) => value * 60_000;

export function createDemoBuffetPosts(anchor) {
  const at = (offset) => new Date(anchor.getTime() + minutes(offset)).toISOString();
  const post = ({ locationAlias, ...values }) => ({ ...values, zoneId: resolveZoneAlias(locationAlias)?.id || null, reportedLocation: locationAlias });
  return Object.freeze([
    post({ id: "utown-pastries", title: "Pastries and fruit cups", description: "Assorted pastries and sealed fruit cups beside the lift lobby.", locationAlias: "ERC", sourceTime: at(-10), collectionDeadline: at(50), source: "NUS Buffet Response demo", fictional: true }),
    post({ id: "science-bentos", title: "Vegetarian bento boxes", description: "A small stack of unopened vegetarian bentos remains after a seminar.", locationAlias: "LT27", sourceTime: at(-25), collectionDeadline: null, source: "NUS Buffet Response demo", fictional: true }),
    post({ id: "business-sandwiches", title: "Sandwich platters", description: "Wrapped sandwiches are available on the second-floor common table.", locationAlias: "BIZ2", sourceTime: at(-50), collectionDeadline: null, source: "NUS Buffet Response demo", fictional: true }),
    post({ id: "fass-fruit", title: "Fresh fruit and bottled water", description: "Whole fruit and unopened water bottles from a student event.", locationAlias: "AS5", sourceTime: at(-90), collectionDeadline: at(30), source: "NUS Buffet Response demo", fictional: true }),
    post({ id: "unclear-snacks", title: "Snack boxes near a red bridge", description: "Several snack boxes remain, but the submitted location could not be mapped safely.", locationAlias: "near the red bridge", sourceTime: at(-20), collectionDeadline: at(40), source: "NUS Buffet Response demo", fictional: true }),
    post({ id: "expired-tea", title: "Tea reception leftovers", description: "Fictional expired fixture used to verify automatic removal.", locationAlias: "CLB", sourceTime: at(-150), collectionDeadline: null, source: "NUS Buffet Response demo", fictional: true }),
  ]);
}
