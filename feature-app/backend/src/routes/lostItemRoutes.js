import multer from "multer";
import { Router } from "express";
import { requireParticipant } from "../middleware/requireParticipant.js";
import { requirePolicyAcceptance } from "../middleware/requirePolicyAcceptance.js";
import {
  createLostItemPost,
  getParticipantLostItemPhoto,
  getPublicLostItemPhoto,
  listParticipantLostItemPosts,
  listPublicLostItemPosts,
  replaceLostItemPost,
  withdrawLostItemPost,
} from "../services/lostItemService.js";
import { LOST_ITEM_PHOTO_LIMITS, sanitizeLostItemPhotos } from "../services/lostItemImageService.js";

const declaredTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: LOST_ITEM_PHOTO_LIMITS.count, fileSize: LOST_ITEM_PHOTO_LIMITS.fileBytes, fields: 20, fieldSize: 10_000 },
  fileFilter: (_request, file, callback) => {
    if (!declaredTypes.has(file.mimetype)) return callback(Object.assign(new Error("Lost-Item photos must be JPEG, PNG, or WebP."), { status: 422, code: "UNSAFE_LOST_ITEM_PHOTO" }));
    callback(null, true);
  },
});

function receivePhotos(request, response, next) {
  upload.array("photos", LOST_ITEM_PHOTO_LIMITS.count)(request, response, (caught) => {
    if (!caught) return next();
    if (caught instanceof multer.MulterError) {
      return next(Object.assign(new Error(caught.code === "LIMIT_FILE_SIZE" ? "Each Lost-Item photo must not exceed 5 MB." : "Lost-Item photo upload limits were exceeded."), {
        status: 422,
        code: "UNSAFE_LOST_ITEM_PHOTO",
      }));
    }
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
  response.set({
    "content-type": photo.mimeType,
    "content-length": String(photo.bytes.length),
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
  });
  response.send(photo.bytes);
}

export function lostItemRoutes({ database, clock, lostItemCipher }) {
  const router = Router();
  const requirePostingPolicy = requirePolicyAcceptance({ database, action: "posting" });

  router.get("/lost-item-posts", (request, response) => {
    response.json({ posts: listPublicLostItemPosts(database, request.query) });
  });
  router.get("/lost-item-photos/:photoId", (request, response) => {
    sendPhoto(response, getPublicLostItemPhoto(database, lostItemCipher, request.params.photoId), "public, max-age=300");
  });
  router.post("/lost-item-posts", requireParticipant, requirePostingPolicy, receivePhotos, async (request, response) => {
    const photos = await sanitizeLostItemPhotos(request.files);
    const post = createLostItemPost(database, lostItemCipher, request.participant, request.body, photos, clock.now());
    response.status(201).json({ post });
  });
  router.get("/me/lost-item-posts", requireParticipant, (request, response) => {
    response.json({ posts: listParticipantLostItemPosts(database, lostItemCipher, request.participant.participant_id) });
  });
  router.put("/me/lost-item-posts/:postId", requireParticipant, requirePostingPolicy, receivePhotos, async (request, response) => {
    const photos = await sanitizeLostItemPhotos(request.files);
    const post = replaceLostItemPost(
      database,
      lostItemCipher,
      request.participant.participant_id,
      request.params.postId,
      request.body,
      retainedPhotoIds(request.body?.retainedPhotoIds),
      photos,
      clock.now(),
    );
    response.json({ post });
  });
  router.post("/me/lost-item-posts/:postId/withdraw", requireParticipant, (request, response) => {
    withdrawLostItemPost(database, request.participant.participant_id, request.params.postId, clock.now());
    response.status(204).end();
  });
  router.get("/me/lost-item-posts/:postId/photos/:photoId", requireParticipant, (request, response) => {
    sendPhoto(
      response,
      getParticipantLostItemPhoto(database, lostItemCipher, request.participant.participant_id, request.params.postId, request.params.photoId),
      "private, no-store",
    );
  });
  return router;
}
