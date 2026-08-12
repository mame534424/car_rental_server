import multer from "multer";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from "../constants";
import { ApiError } from "../utils/ApiError";

const storage = multer.memoryStorage();

export const uploadIdDocument = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        ApiError.badRequest(
          `Unsupported file type. Allowed: ${ALLOWED_DOCUMENT_MIME_TYPES.join(", ")}`
        )
      );
    }
    cb(null, true);
  },
}).single("identificationDocument");
