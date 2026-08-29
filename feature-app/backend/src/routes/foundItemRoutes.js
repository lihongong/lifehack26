import multer from "multer";
import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requirePolicyAcceptance } from "../middleware/requirePolicyAcceptance.js";
import { LOST_ITEM_PHOTO_LIMITS, sanitizeLostItemPhotos } from "../services/lostItemImageService.js";
import {
  createFoundItemReport,
  getParticipantFoundItemPhoto,
  getPublicFoundItemPhoto,
  getPublicFoundItemReportPhoto,
  listParticipantFoundItemReports,
  listPublicFoundItemReports,
  listPublicFoundItems,
  replaceFoundItemReport,
  withdrawFoundItemReport,
} from "../services/foundItemService.js";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: LOST_ITEM_PHOTO_LIMITS.count, fileSize: LOST_ITEM_PHOTO_LIMITS.fileBytes, fields: 20, fieldSize: 10_000 },
  fileFilter: (_request, file, callback) => acceptedTypes.has(file.mimetype)
    ? callback(null, true)
    : callback(Object.assign(new Error("Found-Item photos must be JPEG, PNG, or WebP."), { status: 422, code: "UNSAFE_LOST_ITEM_PHOTO" })),
});

function receivePhotos(request, response, next) {
  upload.array("photos", LOST_ITEM_PHOTO_LIMITS.count)(request, response, (caught) => {
    if (!caught) return next();
    if (caught instanceof multer.MulterError) return next(Object.assign(new Error(caught.code === "LIMIT_FILE_SIZE" ? "Each Found-Item photo must not exceed 5 MB." : "Found-Item photo upload limits were exceeded."), { status: 422, code: "UNSAFE_LOST_ITEM_PHOTO" }));
    next(caught);
  });
}

function retainedPhotoIds(value) {
  if (value == null || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error("Retained photo IDs must be a JSON array of strings."), { status: 422 });
  }
}

function sendPhoto(response, photo, cacheControl) {
  response.set({ "content-type": photo.mimeType, "content-length": String(photo.bytes.length), "cache-control": cacheControl, "x-content-type-options": "nosniff", "content-disposition": "inline" });
  response.send(photo.bytes);
}

export function foundItemRoutes({ database, clock, lostItemCipher }) {
  const router = Router();
  const requirePostingPolicy = requirePolicyAcceptance({ database, action: "posting" });
  router.get("/found-item-reports", (request, response) => response.json({ reports: listPublicFoundItemReports(database, request.query) }));
  router.get("/found-items", (request, response) => response.json({ items: listPublicFoundItems(database, request.query) }));
  router.get("/found-item-report-photos/:photoId", (request, response) => sendPhoto(response, getPublicFoundItemReportPhoto(database, lostItemCipher, request.params.photoId), "public, max-age=300"));
  router.get("/found-item-photos/:photoId", (request, response) => sendPhoto(response, getPublicFoundItemPhoto(database, lostItemCipher, request.params.photoId), "public, max-age=300"));
  router.post("/found-item-reports", requireParticipant, requirePostingPolicy, receivePhotos, async (request, response) => {
    const photos = await sanitizeLostItemPhotos(request.files);
    response.status(201).json({ report: createFoundItemReport(database, lostItemCipher, request.participant, request.body, photos, clock.now()) });
  });
  router.get("/me/found-item-reports", requireParticipant, (request, response) => response.json({ reports: listParticipantFoundItemReports(database, lostItemCipher, request.participant.participant_id) }));
  router.put("/me/found-item-reports/:reportId", requireParticipant, requirePostingPolicy, receivePhotos, async (request, response) => {
    const photos = await sanitizeLostItemPhotos(request.files);
    response.json({ report: replaceFoundItemReport(database, lostItemCipher, request.participant.participant_id, request.params.reportId, request.body, retainedPhotoIds(request.body?.retainedPhotoIds), photos, clock.now()) });
  });
  router.post("/me/found-item-reports/:reportId/withdraw", requireParticipant, (request, response) => {
    withdrawFoundItemReport(database, request.participant.participant_id, request.params.reportId, clock.now());
    response.status(204).end();
  });
  router.get("/me/found-item-reports/:reportId/photos/:photoId", requireParticipant, (request, response) => sendPhoto(response,
    getParticipantFoundItemPhoto(database, lostItemCipher, request.participant.participant_id, request.params.reportId, request.params.photoId), "private, no-store"));
  return router;
}
