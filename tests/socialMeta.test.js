import test from "node:test";
import assert from "node:assert/strict";

import { buildSocialMetaTags, renderSocialMeta } from "../src/socialMeta.js";

test("buildSocialMetaTags renders absolute Open Graph and Twitter URLs", () => {
  const tags = buildSocialMetaTags("landing.html", "https://bugs.example.com");

  assert.match(tags, /property="og:title" content="Beta Bug Reporter"/);
  assert.match(tags, /property="og:url" content="https:\/\/bugs\.example\.com\/"/);
  assert.match(
    tags,
    /property="og:image" content="https:\/\/bugs\.example\.com\/og-image\.png"/,
  );
  assert.match(
    tags,
    /name="twitter:image" content="https:\/\/bugs\.example\.com\/og-image\.png"/,
  );
  assert.match(tags, /property="og:image:width" content="1200"/);
  assert.match(tags, /property="og:image:height" content="630"/);
});

test("renderSocialMeta replaces the template placeholder", () => {
  const html = renderSocialMeta(
    "<head>{{SOCIAL_META}}</head>",
    "dashboard.html",
    "https://bugs.example.com/",
  );

  assert.doesNotMatch(html, /SOCIAL_META/);
  assert.match(
    html,
    /property="og:url" content="https:\/\/bugs\.example\.com\/dashboard"/,
  );
});
