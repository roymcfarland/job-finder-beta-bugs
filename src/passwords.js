import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scrypt(password, salt, HASH_LENGTH);

  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, salt, encodedHash] = String(storedHash).split("$");

  if (algorithm !== "scrypt" || !salt || !encodedHash) {
    return false;
  }

  const derivedKey = await scrypt(password, salt, HASH_LENGTH);
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

  return "";
}
