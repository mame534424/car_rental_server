import { randomUUID } from "crypto";
import { STORAGE_BUCKET, supabase } from "../config/supabase";
import { SIGNED_URL_EXPIRY_SECONDS } from "../constants";
import { ApiError } from "../utils/ApiError";

/**
 * Uploads a customer's ID document to the private Supabase bucket.
 * Returns the storage path (not a public URL) — the path is what we
 * persist on Customer.identificationDocumentPath.
 */
export async function uploadIdDocument(
  file: Express.Multer.File,
  customerNameHint: string
): Promise<string> {
  const ext = file.originalname.split(".").pop() || "bin";
  const safeName = customerNameHint.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
  const path = `${new Date().toISOString().slice(0, 10)}/${safeName}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    throw ApiError.internal(`Failed to upload ID document: ${error.message}`);
  }

  return path;
}

/**
 * Generates a short-lived signed URL for an admin to view a private ID document.
 */
export async function getSignedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw ApiError.internal(`Failed to generate signed URL: ${error?.message ?? "unknown error"}`);
  }

  return data.signedUrl;
}

export async function uploadPaymentReceipt(
  file: Express.Multer.File,
  bookingId: string
): Promise<string> {
  
  const ext = file.originalname.split(".").pop() || "bin";
  const safeName = bookingId.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
  const path = `${new Date().toISOString().slice(0, 10)}/${safeName}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    throw ApiError.internal(`Failed to upload payment receipt: ${error.message}`);
  }

  return path;
}

export async function getSignedPaymentReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    throw ApiError.internal(`Failed to generate signed URL: ${error?.message ?? "unknown error"}`);
  }

  return data.signedUrl;
}