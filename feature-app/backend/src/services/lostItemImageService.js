import sharp from "sharp";

export const LOST_ITEM_PHOTO_LIMITS = Object.freeze({
  count: 3,
  fileBytes: 5 * 1024 * 1024,
  outputBytes: 5 * 1024 * 1024,
  pixels: 12_000_000,
  edge: 6000,
});

const formats = new Set(["jpeg", "png", "webp"]);
const mimeByFormat = Object.freeze({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" });

function reject(message) {
  throw Object.assign(new Error(message), { status: 422, code: "UNSAFE_LOST_ITEM_PHOTO" });
}

export async function sanitizeLostItemPhoto(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) reject("Lost-Item photo data is required.");
  if (file.size > LOST_ITEM_PHOTO_LIMITS.fileBytes) reject("Each Lost-Item photo must not exceed 5 MB.");
  let metadata;
  try {
    metadata = await sharp(file.buffer, { animated: true, failOn: "warning", limitInputPixels: LOST_ITEM_PHOTO_LIMITS.pixels }).metadata();
  } catch {
    reject("Lost-Item photo content is malformed or unsafe.");
  }
  if (!formats.has(metadata.format) || mimeByFormat[metadata.format] !== file.mimetype) reject("Lost-Item photo type does not match its content.");
  if ((metadata.pages || 1) !== 1) reject("Animated Lost-Item photos are not allowed.");
  if (!metadata.width || !metadata.height || metadata.width > LOST_ITEM_PHOTO_LIMITS.edge || metadata.height > LOST_ITEM_PHOTO_LIMITS.edge || metadata.width * metadata.height > LOST_ITEM_PHOTO_LIMITS.pixels) {
    reject("Lost-Item photo dimensions exceed the safe limit.");
  }
  let result;
  try {
    result = await sharp(file.buffer, { animated: false, failOn: "warning", limitInputPixels: LOST_ITEM_PHOTO_LIMITS.pixels })
      .rotate()
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    reject("Lost-Item photo could not be safely re-encoded.");
  }
  if (result.data.length > LOST_ITEM_PHOTO_LIMITS.outputBytes) reject("Sanitized Lost-Item photo exceeds the safe output limit.");
  return { bytes: result.data, mimeType: "image/webp", width: result.info.width, height: result.info.height, byteSize: result.data.length };
}

export async function sanitizeLostItemPhotos(files = []) {
  if (files.length > LOST_ITEM_PHOTO_LIMITS.count) reject("A Lost-Item Post accepts at most three photos.");
  return Promise.all(files.map(sanitizeLostItemPhoto));
}
