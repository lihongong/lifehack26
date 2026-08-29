import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMarketplaceMessage,
  stripContactDetails,
  validateCorrectedMarketplaceFields,
} from "../backend/src/sourceFeeds/marketplaceMessageParser.js";
import { normalizeTelegramUpdate } from "../backend/src/sourceFeeds/sourceFeedDomain.js";

const examples = [
  ["Study", "Casio calculator", 18, "Barely used calculator for exams."],
  ["Room & Living", "Compact desk lamp", 12, "Warm lamp for a study desk."],
  ["Transport", "Bicycle helmet", 25, "Adjustable helmet in good condition."],
  ["Electronics", "USB-C monitor", 160, "Portable monitor with cable."],
];

test("labeled Marketplace messages parse deterministically across the supported taxonomy", () => {
  for (const [category, title, price, description] of examples) {
    const parsed = parseMarketplaceMessage(`Title: ${title}\nCategory: ${category}\nPrice: S$${price}\nDescription: ${description}`);
    assert.deepEqual(parsed, { issues: [], candidate: { title, category, price, description } });
  }
});

test("controlled fallbacks parse WTS item lines, SGD prices, and free items", () => {
  assert.deepEqual(parseMarketplaceMessage("WTS\nBicycle lock\n$20\nStrong folding lock, two keys included."), {
    issues: [],
    candidate: {
      title: "Bicycle lock",
      category: "Transport",
      price: 20,
      description: "Strong folding lock, two keys included.",
    },
  });
  assert.deepEqual(parseMarketplaceMessage("WTS: Study notes\nFree\nPrinted economics notes in a folder."), {
    issues: [],
    candidate: {
      title: "Study notes",
      category: "Study",
      price: 0,
      description: "Printed economics notes in a folder.",
    },
  });
  assert.deepEqual(parseMarketplaceMessage("WTS\n24-inch monitor for S$100\nIncludes a USB-C cable and stand."), {
    issues: [],
    candidate: {
      title: "24-inch monitor",
      category: "Electronics",
      price: 100,
      description: "Includes a USB-C cable and stand.",
    },
  });
});

test("invalid, ambiguous, and unpriced negotiable messages return parser issue codes", () => {
  assert.deepEqual(parseMarketplaceMessage("Title: Bicycle phone holder\nPrice: $12.50\nDescription: Mount a phone on a bicycle.").issues.sort(), [
    "category_ambiguous",
    "price_must_be_whole_sgd",
  ]);
  assert.ok(parseMarketplaceMessage("Title: Wooden organiser\nPrice: Negotiable\nDescription: Useful item.").issues.includes("price_negotiable_without_amount"));
  assert.ok(parseMarketplaceMessage("Hello everyone").issues.includes("price_missing"));
});

test("contact-like source text is removed before candidates or normalized Listings are produced", () => {
  const source = "Title: Laptop charger\nCategory: Electronics\nPrice: $22\nDescription: Works well. Email seller@example.com or call +65 8123 4567.\nTelegram: @private_handle";
  const parsed = parseMarketplaceMessage(source);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.candidate.description.includes("seller@example.com"), false);
  assert.equal(parsed.candidate.description.includes("8123"), false);
  assert.equal(JSON.stringify(parsed).includes("private_handle"), false);
  assert.equal(stripContactDetails("Use https://t.me/private_handle or @private_handle"), "Use or");
});

test("stable Listing identity depends on the feed and Telegram message id, not editable content", () => {
  const envelope = (updateId, event, text, editDate) => normalizeTelegramUpdate({
    update_id: updateId,
    [event]: {
      message_id: 42,
      date: 1787997000,
      ...(editDate ? { edit_date: editDate } : {}),
      chat: { username: "nus_marketplace_demo" },
      from: { id: "private-author", first_name: "Private Name", username: "private_username" },
      text,
    },
  }, { feedId: "telegram-marketplace-demo", fictional: true });
  const created = envelope(1, "message", "Title: Study calculator\nCategory: Study\nPrice: $20\nDescription: Original description.");
  const edited = envelope(2, "edited_message", "Title: Updated calculator title\nCategory: Study\nPrice: $18\nDescription: Updated description.", 1787997300);
  assert.equal(created.listing.id, edited.listing.id);
  assert.equal(JSON.stringify(created).includes("Private Name"), false);
  assert.equal(JSON.stringify(created).includes("private_username"), false);
});

test("Moderator corrections use the same taxonomy and safe-content validation", () => {
  assert.deepEqual(validateCorrectedMarketplaceFields({
    title: "Corrected bicycle holder",
    category: "Transport",
    price: 12,
    description: "Secure handlebar mount. Contact @private_handle",
  }), {
    title: "Corrected bicycle holder",
    category: "Transport",
    price: 12,
    description: "Secure handlebar mount. Contact",
  });
  assert.throws(() => validateCorrectedMarketplaceFields({ title: "Item", category: "Other", price: 1.5, description: "Description" }), /category_invalid, price_invalid/);
});
