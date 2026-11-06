/**
 * File storage: files sent to the storage group are indexed in D1 so they can
 * be found later with inline search. Only the owner, only that group.
 */
import { isOwner } from "./auth.js";
import { sendMessage } from "./telegram.js";

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

export function hasFile(message) {
  return Boolean(message.document || message.video || message.audio || message.photo);
}

function pickFile(message) {
  if (message.document) return message.document;
  if (message.video) return message.video;
  if (message.audio) return message.audio;
  if (message.photo?.length) return message.photo[message.photo.length - 1];
  return null;
}

export function getExtension(file) {
  if (file.file_name?.includes(".")) {
    return file.file_name.split(".").pop().toLowerCase();
  }
  if (file.mime_type && MIME_EXTENSIONS[file.mime_type]) {
    return MIME_EXTENSIONS[file.mime_type];
  }
  return "unknown";
}

/**
 * Display name for a saved file. Photos and files without a name get a stable
 * name derived from the file id instead of a timestamp.
 */
export function resolveFileName(file, isPhoto) {
  if (file.file_name) return file.file_name;
  const suffix = String(file.file_id).slice(-8);
  if (isPhoto) return `photo_${suffix}.jpg`;
  const ext = getExtension(file);
  return ext === "unknown" ? `file_${suffix}` : `file_${suffix}.${ext}`;
}

/** Category is the first #hashtag in the file caption, if any. */
export function extractCategory(caption) {
  const match = caption?.match(/#(\S+)/);
  return match ? match[1].toLowerCase() : null;
}

async function alreadySaved(db, fileId) {
  const existing = await db
    .prepare("SELECT 1 FROM files WHERE file_id = ? LIMIT 1")
    .bind(fileId)
    .all();
  return (existing.results || []).length > 0;
}

/**
 * Index one file message. Returns true when a new row was saved.
 * Silently ignores messages from other chats, from non-owners, and files
 * that are already indexed.
 */
export async function saveFileMessage(message, env) {
  if (!env.STORAGE_GROUP_ID) return false;
  if (String(message.chat.id) !== String(env.STORAGE_GROUP_ID)) return false;
  if (!isOwner(message.from?.id, env)) return false;

  const file = pickFile(message);
  if (!file) return false;

  const isPhoto = Boolean(message.photo?.length) && !message.document && !message.video && !message.audio;
  const fileName = resolveFileName(file, isPhoto);
  const fileId = file.file_id;
  // Derive the extension from the final name, so a photo (which carries no
  // mime_type) is stored as jpg like its name says.
  const ext = getExtension({ file_name: fileName, mime_type: file.mime_type });
  const category = extractCategory(message.caption);

  try {
    if (await alreadySaved(env.DB, fileId)) return false;

    await env.DB.prepare(
      "INSERT INTO files (file_id, file_name, file_extension, category) VALUES (?, ?, ?, ?)"
    )
      .bind(fileId, fileName, ext, category)
      .run();

    await sendMessage(message.chat.id, `✅ Saved: ${fileName}`, env, {
      reply_to_message_id: message.message_id,
    });
    return true;
  } catch (err) {
    console.error("Failed to save file:", err.message);
    return false;
  }
}
