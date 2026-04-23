export function createRateLimitStore({ limit, windowMs }) {
  const buckets = new Map();

  return {
    consume(key, now = Date.now()) {
      const history = buckets.get(key) ?? [];
      const freshEntries = history.filter((timestamp) => now - timestamp < windowMs);

      if (freshEntries.length >= limit) {
        const retryAfterMs = windowMs - (now - freshEntries[0]);

        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      freshEntries.push(now);
      buckets.set(key, freshEntries);
      pruneExpiredBuckets(buckets, now, windowMs);

      return {
        allowed: true,
        retryAfterSeconds: 0,
      };
    },
  };
}

function pruneExpiredBuckets(buckets, now, windowMs) {
  for (const [key, timestamps] of buckets.entries()) {
    if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
      buckets.delete(key);
    }
  }
}
