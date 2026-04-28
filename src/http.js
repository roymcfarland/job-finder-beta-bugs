export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "BodyTooLargeError";
  }
}

export class InvalidJsonError extends Error {
  constructor(message = "Payload must be a JSON object.") {
    super(message);
    this.name = "InvalidJsonError";
  }
}

/** Enough for all current API bodies; blocks runaway key lists. */
export const JSON_OBJECT_MAX_KEYS = 80;

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertPlainJsonObject(value, depth, maxDepth) {
  if (depth > maxDepth) {
    throw new InvalidJsonError("JSON is nested too deeply.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidJsonError();
  }

  const keys = Object.keys(value);
  if (keys.length > JSON_OBJECT_MAX_KEYS) {
    throw new InvalidJsonError("JSON object has too many keys.");
  }

  for (const key of keys) {
    if (FORBIDDEN_JSON_KEYS.has(key) || key.startsWith("__")) {
      throw new InvalidJsonError("JSON object contains forbidden keys.");
    }

    const entry = value[key];
    if (entry === null || typeof entry === "string" || typeof entry === "number") {
      continue;
    }
    if (typeof entry === "boolean") {
      continue;
    }
    if (typeof entry === "object") {
      if (Array.isArray(entry)) {
        throw new InvalidJsonError("JSON arrays are not allowed in the payload.");
      }
      assertPlainJsonObject(entry, depth + 1, maxDepth);
    } else {
      throw new InvalidJsonError("JSON contains unsupported value types.");
    }
  }
}

export function getClientIp(headers, fallback = "", { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwardedFor = headers["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
      return forwardedFor.split(",")[0].trim().slice(0, 120);
    }

    const realIp = headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.length > 0) {
      return realIp.trim().slice(0, 120);
    }
  }

  return (fallback || "unknown").slice(0, 120);
}

export async function readRequestBody(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > maxBytes) {
      throw new BodyTooLargeError();
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function sendNodeResponse(response, result) {
  response.statusCode = result.status;

  for (const [name, value] of Object.entries(result.headers)) {
    response.setHeader(name, value);
  }

  if (result.body === null) {
    response.end();
    return;
  }

  response.end(result.body);
}

export function getSecurityHeaders(options = {}) {
  const environment =
    options.environment ?? process.env.NODE_ENV?.trim().toLowerCase() ?? "development";
  const headers = {
    "content-security-policy":
      "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; connect-src 'self'; font-src 'self' https://fonts.gstatic.com; object-src 'none'; frame-src 'none'; manifest-src 'self'",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
  };

  if (environment === "production") {
    headers["strict-transport-security"] =
      "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}

export function getMimeType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  if (filePath.endsWith(".ico")) {
    return "image/x-icon";
  }

  return "application/octet-stream";
}

export function parseJsonObject(rawBody, { maxNestingDepth = 4 } = {}) {
  if (!rawBody) {
    throw new InvalidJsonError();
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidJsonError();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidJsonError();
  }

  assertPlainJsonObject(parsed, 0, maxNestingDepth);

  return parsed;
}

export function isJsonContentType(contentType) {
  if (typeof contentType !== "string") {
    return false;
  }

  // Accept application/json with optional parameters (charset, etc.) and the
  // less common application/*+json variant.
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  return mediaType === "application/json" || /\+json$/.test(mediaType);
}

export function jsonResponse(status, payload, headers = {}) {
  return {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  };
}

export function redirectResponse(location, status = 302, headers = {}) {
  return {
    status,
    headers: {
      ...headers,
      location,
    },
    body: null,
  };
}

export function methodNotAllowedResponse(headers, allow) {
  return jsonResponse(
    405,
    { error: "Method not allowed." },
    {
      ...headers,
      allow,
    },
  );
}

export function buildApiHeaders(allowedOrigin, requestOrigin, options = {}) {
  const isAllowed = allowedOrigin && requestOrigin === allowedOrigin;
  const corsHeaders = isAllowed
    ? {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-credentials": "true",
        vary: "Origin",
      }
    : {};

  return {
    ...getSecurityHeaders(options),
    ...corsHeaders,
    "cache-control": "no-store",
  };
}

export function parseCookies(cookieHeader = "") {
  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      continue;
    }
  }

  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  // `__Host-` prefixed cookies require Secure, Path=/, and no Domain. If the
  // caller forgot the Secure flag, force it on so we never emit an invalid
  // cookie that browsers will silently drop.
  const requiresHostPrefix = typeof name === "string" && name.startsWith("__Host-");
  const path = options.path ?? "/";

  if (requiresHostPrefix && path !== "/") {
    throw new Error("__Host- cookies must be set with Path=/");
  }

  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${path}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure || requiresHostPrefix) {
    parts.push("Secure");
  }

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}
