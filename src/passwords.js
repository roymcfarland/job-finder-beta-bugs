import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_LENGTH = 64;

// scrypt cost is roughly proportional to password length, so cap inputs to
// avoid CPU/memory denial-of-service from huge submitted passwords.
export const MAX_PASSWORD_LENGTH = 256;

export async function hashPassword(password) {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(
      `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
    );
  }

  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(password, salt, HASH_LENGTH);

  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }

  const [algorithm, salt, encodedHash] = String(storedHash).split("$");

  if (algorithm !== "scrypt" || !salt || !encodedHash) {
    return false;
  }

  let derivedKey;
  try {
    derivedKey = await scrypt(password, salt, HASH_LENGTH);
  } catch {
    return false;
  }

  const expectedHash = Buffer.from(encodedHash, "base64url");

  return (
    expectedHash.length === derivedKey.length &&
    timingSafeEqual(expectedHash, Buffer.from(derivedKey))
  );
}

export function validatePassword(password, minimumLength) {
  if (typeof password !== "string" || password.length < minimumLength) {
    return `Use at least ${minimumLength} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }

  return "";
}
