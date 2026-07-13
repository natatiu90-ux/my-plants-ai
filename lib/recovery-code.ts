import crypto from "crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRecoveryCode(code: string) {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function hashRecoveryCode(code: string) {
  return crypto.createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function generateRecoveryCode() {
  const bytes = crypto.randomBytes(12);
  let value = "";
  for (let index = 0; index < 12; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}
