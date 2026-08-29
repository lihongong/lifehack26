export function createClock(initialNow) {
  let override = initialNow ? new Date(initialNow) : null;
  return {
    now: () => new Date(override || Date.now()),
    set: (value) => { override = value ? new Date(value) : null; },
  };
}

export function singaporeDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
