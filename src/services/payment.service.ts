import { randomUUID } from "crypto";
import { STORAGE_BUCKET, supabase } from "../config/supabase";
import { SIGNED_URL_EXPIRY_SECONDS } from "../constants";
import { ApiError } from "../utils/ApiError";

export async function uploadPaymentReceipt(
  file: Express.Multer.File,
  bookingId: string
): Promise<string> {
  const ext = file.originalname.split(".").pop() || "bin";

  const path = `payment-receipts/${new Date()
    .toISOString()
    .slice(0, 10)}/${bookingId}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw ApiError.internal(
      `Failed to upload payment receipt: ${error.message}`
    );
  }

  return path;
}

export async function getSignedPaymentReceiptUrl(
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw ApiError.internal(
      `Failed to generate payment receipt URL: ${
        error?.message ?? "unknown error"
      }`
    );
  }

  return data.signedUrl;
}