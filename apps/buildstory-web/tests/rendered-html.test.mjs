import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);

async function render(pathname) {
  const url = new URL(workerUrl);
  url.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function request(pathname, init = {}) {
  const url = new URL(workerUrl);
  url.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}-${Math.random()}`);
  const { default: worker } = await import(url.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders public routes through the shared shell", async () => {
  // This smoke test runs the compiled Worker directly with no D1 binding, so
  // /explore and /p/:slug exercise their durable-store-unavailable path
  // rather than real published content - that degraded rendering (not a
  // crash, no leaked internal detail) is exactly what's under test here.
  // Full published-story rendering needs a real D1 binding; see
  // tests/local-api.test.ts and tests/d1-runtime-smoke.mjs for D1-backed
  // coverage of the underlying store and publication logic.
  const routes = [
    ["/", /Every build has/],
    ["/about", /Every build has/],
    ["/explore", /What are people/],
    ["/leaderboard", /Ranked on estimated/],
    ["/terms", /Build badges/],
    ["/signin", /AUTHENTICATION DISABLED/],
    ["/p/some-story-slug", /TEMPORARILY UNAVAILABLE/],
  ];

  for (const [pathname, expected] of routes) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, expected);
    assert.match(response.headers.get("content-security-policy") ?? "", /script-src 'self'(?: 'sha256-[A-Za-z0-9+/]+=*)+/i);
    assert.match(response.headers.get("content-security-policy") ?? "", /img-src 'self' blob: data: https:/i);
    assert.match(html, /<script src="\/theme-boot\.js">/i);
    assert.equal((html.match(/class="site-header"/g) ?? []).length, 1, pathname);
    assert.equal((html.match(/class="site-footer"/g) ?? []).length, 1, pathname);
    assert.match(html, /Skip to content/);
    assert.doesNotMatch(html, /Creator sign in/);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
    assert.doesNotMatch(html, /(?:Â|â€¦|â†|Ã—|ðŸ)/, `${pathname} contains mojibake`);
  }
});

test("anonymous visitors see the full primary navigation, including discovery links", async () => {
  const response = await render("/");
  const html = await response.text();
  const primaryNav = html.match(/<nav class="primary-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  assert.match(html, /Every build has/);
  assert.match(primaryNav, /How it works/);
  assert.match(primaryNav, /Manifesto/);
  assert.match(primaryNav, />Explore</);
  assert.match(primaryNav, />Leaderboard</);
});

test("ships site-specific social metadata", async () => {
  const response = await render("/");
  const html = await response.text();
  assert.match(html, /Buildstory/);
  assert.match(html, /og\.jpg/);
  assert.match(html, /summary_large_image/);
});

test("landing page leads with private report generation and evidence-backed facts", async () => {
  const response = await render("/about");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Your AI build, decoded\./);
  assert.match(html, /A private report for every AI-assisted build/);
  assert.match(html, /href="\/signin\?callbackUrl=%2Fstudio%2Fconnect"[^>]*>Generate my report/);
  assert.match(html, /href="\/u\/arjun-mishra\/vibe-social"[^>]*>View a real report/);
  assert.match(html, /Private by default/);
  assert.match(html, /Publishing is optional/);
  assert.match(html, /27%/);
  assert.match(html, /58 tools/);
  assert.match(html, /38h 50m/);
  assert.match(html, /54/);
  assert.match(html, /8/);
  assert.match(html, /Redacted locally/);
  assert.doesNotMatch(html, /A community for the people building with AI/);
  assert.doesNotMatch(html, /Contrast FM/);
});

test("public build-story pages never leak internal error or private-report detail", async () => {
  // With no D1 bound, this exercises the durable-store-unavailable fallback.
  // The invariant under test - no internal detail or private-report markup
  // ever reaches a public response - holds regardless of which path a
  // request takes, so it's still meaningful coverage without a real D1
  // binding. Coverage of an actual published story's field-selection
  // boundary lives in tests/local-api.test.ts (data layer, D1-backed via
  // Miniflare) pending a D1-bound rendering test.
  const response = await render("/p/some-story-slug");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /durable database is unavailable/i);
  assert.doesNotMatch(html, /D1IngestionError|production_dependency_unavailable/i);
  assert.doesNotMatch(html, /sha256:15b9a8c0d17f/i);
  assert.doesNotMatch(html, /github\.com\/.*orbit-notes/i);
  assert.doesNotMatch(html, /Repair duplicated notes after reconnect/i);
  assert.doesNotMatch(html, /dev:mina-park|google:[a-z0-9_-]+/i);
  assert.doesNotMatch(html, /PRIVATE · ONLY YOU CAN SEE THIS/i);
});

test("renders an explicit disabled auth state and protects creator surfaces", async () => {
  const signIn = await render("/signin");
  assert.equal(signIn.status, 200);
  assert.match(await signIn.text(), /AUTHENTICATION DISABLED/i);

  const dashboard = await request("/dashboard", { redirect: "manual" });
  assert.equal(dashboard.status, 308);
  assert.equal(dashboard.headers.get("location"), "http://localhost/studio");

  const dashboardRedirects = [
    ["/dashboard/connect", "http://localhost/studio/connect"],
    ["/dashboard/settings", "http://localhost/studio/settings"],
    ["/dashboard/reports/abc", "http://localhost/studio/reports/abc"],
    ["/dashboard/feed", "http://localhost/"],
  ];
  for (const [pathname, location] of dashboardRedirects) {
    const response = await request(pathname, { redirect: "manual" });
    assert.equal(response.status, 308, pathname);
    assert.equal(response.headers.get("location"), location, pathname);
  }

  const creatorApi = await request("/api/creator/upload-sessions", {
    headers: { accept: "application/json" },
  });
  assert.equal(creatorApi.status, 401);
  assert.match(await creatorApi.text(), /creator sign-in required/i);
});

test("production scanner claim boundary ignores browser identity and stays disabled", async () => {
  const response = await request("/api/scanner/upload-sessions/unknown/claim", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "authjs.session-token=browser-cookie-must-not-authorize-scanner",
    },
    body: JSON.stringify({ userCode: "NOPE-NOPE" }),
  });
  assert.equal(response.status, 404);
  assert.match(await response.text(), /local_api_disabled/i);
});
