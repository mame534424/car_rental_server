import { randomUUID } from "crypto";
import { env } from "../config/env";

/**
 * Mock Chapa-shaped payment gateway.
 *
 * This mirrors the interface a real Chapa integration would have:
 * - initialize(): create a checkout session, return a checkout URL + tx ref
 * - verify(): confirm a transaction reference actually succeeded
 *
 * Swapping in the real Chapa SDK later means replacing only the internals
 * of these two functions — callers (controllers) don't change.
 */

export interface InitializeResult {
  transactionReference: string;
  checkoutUrl: string;
}

export async function initializeCheckout(params: {
  amount: number;
  customerEmail?: string;
  customerName: string;
}): Promise<InitializeResult> {
  const transactionReference = `mock-chapa-${randomUUID()}`;
  // In production this would be the real Chapa-hosted checkout page URL.
  const checkoutUrl = `${env.BACKEND_URL}/api/payments/mock-checkout/${transactionReference}`;

  return { transactionReference, checkoutUrl };
}

export async function verifyTransaction(
  _transactionReference: string
): Promise<{ success: boolean }> {
  // Mock: always succeeds. Real Chapa integration would call their
  // GET /v1/transaction/verify/{tx_ref} endpoint here.
  return { success: true };
}
