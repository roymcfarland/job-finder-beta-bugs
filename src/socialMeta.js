const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const SOCIAL_IMAGE = Object.freeze({
  path: "/og-image.png",
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "Atlas Bug Reporter dashboard preview",
});

const PAGE_META = Object.freeze({
  "landing.html": {
    title: "Atlas Bug Reporter",
    description:
      "Sign in to send clean bug reports, keep beta feedback organized, and pick up where you left off.",
    path: "/",
  },
  "dashboard.html": {
    title: "Atlas Bug Dashboard",
    description:
      "Submit structured bug reports for Atlas and track beta feedback in one focused dashboard.",
    path: "/dashboard",
  },
  "admin.html": {
    title: "Atlas Admin",
    description:
      "Review Atlas beta feedback, manage tester access, and resolve reports from one admin workspace.",
    path: "/admin",
  },
  "reset-password.html": {
    title: "Atlas Password Reset",
    description: "Reset your Atlas bug reporter password securely.",
    path: "/reset-password",
  },
});

export function renderSocialMeta(template, fileName, baseUrl) {
  return template.replace(
    "{{SOCIAL_META}}",
    buildSocialMetaTags(fileName, baseUrl),
  );
}

export function buildSocialMetaTags(fileName, baseUrl) {
  const page = PAGE_META[fileName] ?? PAGE_META["landing.html"];
  const pageUrl = absoluteUrl(baseUrl, page.path);
  const imageUrl = absoluteUrl(baseUrl, SOCIAL_IMAGE.path);
  const tags = [
    ["link", "rel", "canonical", "href", pageUrl],
    ["meta", "property", "og:type", "content", "website"],
    ["meta", "property", "og:site_name", "content", "Atlas Bug Reporter"],
    ["meta", "property", "og:title", "content", page.title],
    ["meta", "property", "og:description", "content", page.description],
    ["meta", "property", "og:url", "content", pageUrl],
    ["meta", "property", "og:image", "content", imageUrl],
    ["meta", "property", "og:image:type", "content", SOCIAL_IMAGE.type],
    ["meta", "property", "og:image:width", "content", String(SOCIAL_IMAGE.width)],
    ["meta", "property", "og:image:height", "content", String(SOCIAL_IMAGE.height)],
    ["meta", "property", "og:image:alt", "content", SOCIAL_IMAGE.alt],
    ["meta", "name", "twitter:card", "content", "summary_large_image"],
    ["meta", "name", "twitter:title", "content", page.title],
    ["meta", "name", "twitter:description", "content", page.description],
    ["meta", "name", "twitter:image", "content", imageUrl],
    ["meta", "name", "twitter:image:alt", "content", SOCIAL_IMAGE.alt],
    ["meta", "name", "theme-color", "content", "#f4f7fb"],
  ];

  return tags.map(formatTag).join("\n    ");
}

function formatTag([tagName, ...attributeParts]) {
  const attributes = [];

  for (let index = 0; index < attributeParts.length; index += 2) {
    attributes.push(
      `${attributeParts[index]}="${escapeAttribute(attributeParts[index + 1])}"`,
    );
  }

  return `<${tagName} ${attributes.join(" ")} />`;
}

function absoluteUrl(baseUrl, pathname) {
  const base = parseBaseUrl(baseUrl);
  return new URL(pathname, `${base.origin}/`).toString();
}

function parseBaseUrl(baseUrl) {
  try {
    return new URL(baseUrl);
  } catch {
    return new URL(DEFAULT_BASE_URL);
  }
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
