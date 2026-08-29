const categoryKeywords = Object.freeze({
  "Study": ["book", "textbook", "notes", "calculator", "stationery", "notebook"],
  "Room & Living": ["lamp", "chair", "table", "shelf", "fan", "bedding", "appliance"],
  "Transport": ["bicycle", "bike", "helmet", "lock", "scooter"],
  "Electronics": ["monitor", "laptop", "phone", "keyboard", "mouse", "charger", "headphones"],
});

export const marketplaceCategories = Object.freeze(Object.keys(categoryKeywords));

const fieldPattern = /^(title|category|price|description)\s*:\s*(.*)$/i;
const contactLabelPattern = /^(contact|seller|telegram|whatsapp|phone|email|dm|pm)\b/i;
const contactValuePatterns = [
  /(?:https?:\/\/)?(?:t\.me|wa\.me)\/\S+/gi,
  /@[a-z0-9_]{4,}/gi,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  /(?:\+?\d[\d\s-]{7,}\d)/g,
];

function clean(value, maximum) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, maximum) : null;
}

export function stripContactDetails(value) {
  let result = String(value ?? "");
  for (const pattern of contactValuePatterns) result = result.replace(pattern, "");
  return clean(result, 2000);
}

function parsePrice(value) {
  const normalized = String(value ?? "").trim();
  if (/^free\b/i.test(normalized)) return { value: 0 };
  if (/negotiable/i.test(normalized) && !/\d/.test(normalized)) return { issue: "price_negotiable_without_amount" };
  const match = normalized.match(/s?\$\s*(\d+(?:\.\d{1,2})?)/i) || normalized.match(/^(\d+(?:\.\d{1,2})?)\b/);
  if (!match) return { issue: "price_missing" };
  const number = Number(match[1]);
  if (!Number.isInteger(number) || number < 0) return { issue: "price_must_be_whole_sgd" };
  return { value: number };
}

function exactCategory(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s*&\s*/g, " & ");
  return marketplaceCategories.find((category) => category.toLowerCase() === normalized) || null;
}

function inferCategory(value) {
  const haystack = String(value ?? "").toLowerCase();
  const matches = marketplaceCategories.filter((category) =>
    categoryKeywords[category].some((keyword) => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(haystack)),
  );
  if (matches.length === 1) return { value: matches[0] };
  return { issue: matches.length ? "category_ambiguous" : "category_missing" };
}

function candidateResult({ title, category, price, description }) {
  const candidate = {};
  if (title) candidate.title = title;
  if (category) candidate.category = category;
  if (price !== undefined) candidate.price = price;
  if (description) candidate.description = description;
  return candidate;
}

export function validateCorrectedMarketplaceFields(input) {
  const title = clean(input?.title, 160);
  const category = exactCategory(input?.category);
  const description = stripContactDetails(input?.description);
  const issues = [];
  if (!title) issues.push("title_missing");
  if (!category) issues.push("category_invalid");
  if (!Number.isInteger(input?.price) || input.price < 0) issues.push("price_invalid");
  if (!description) issues.push("description_missing");
  if (issues.length) {
    throw Object.assign(new Error(`Corrected Marketplace Listing is invalid: ${issues.join(", ")}.`), { status: 422 });
  }
  return { title, category, price: input.price, description };
}

export function parseMarketplaceMessage(text) {
  const rawLines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const safeLines = rawLines
    .filter((line) => !contactLabelPattern.test(line))
    .map(stripContactDetails)
    .filter((line) => line && line !== "[contact removed]");
  const fields = new Map();
  const bodyLines = [];

  for (const line of safeLines) {
    if (/^(?:\[?wts\]?|selling)\s*:?\s*$/i.test(line)) continue;
    const field = line.match(fieldPattern);
    if (field) fields.set(field[1].toLowerCase(), clean(field[2], field[1].toLowerCase() === "description" ? 2000 : 160));
    else bodyLines.push(line);
  }

  let title = fields.get("title") || null;
  let fallbackTitleLine = null;
  if (!title) {
    const first = bodyLines.find((line) => !/^(?:price\s*:|s?\$\s*\d|free\b)/i.test(line));
    fallbackTitleLine = first || null;
    title = clean(first
      ?.replace(/^(?:\[?wts\]?|selling)\s*[:\-]?\s*/i, "")
      .replace(/\s+(?:for\s+|at\s+)?(?:s?\$\s*\d+(?:\.\d{1,2})?|free|negotiable)\s*$/i, ""), 160);
  }

  const explicitPrice = fields.get("price");
  const fallbackPrice = bodyLines.find((line) => /s?\$\s*\d|^(?:free|negotiable)\s*$|\s(?:free|negotiable)\s*$/i.test(line));
  const parsedPrice = parsePrice(explicitPrice || fallbackPrice);

  const explicitCategory = fields.get("category");
  const parsedCategory = explicitCategory
    ? { value: exactCategory(explicitCategory), issue: exactCategory(explicitCategory) ? null : "category_invalid" }
    : inferCategory(`${title || ""} ${fields.get("description") || ""} ${bodyLines.join(" ")}`);

  let description = fields.get("description") || null;
  if (!description) {
    description = clean(bodyLines.filter((line) => line !== fallbackTitleLine && line !== fallbackPrice).join(" "), 2000);
  }

  const issues = [];
  if (!title) issues.push("title_missing");
  if (parsedPrice.issue) issues.push(parsedPrice.issue);
  if (parsedCategory.issue) issues.push(parsedCategory.issue);
  if (!description) issues.push("description_missing");
  return {
    issues: [...new Set(issues)],
    candidate: candidateResult({ title, category: parsedCategory.value, price: parsedPrice.value, description }),
  };
}
