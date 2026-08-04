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

test("server-renders the three Buildstory routes", async () => {
  const routes = [
    ["/", /Every build has/],
    ["/explore", /What are people/],
    ["/p/orbit-notes", /AI Build Receipt/],
  ];

  for (const [pathname, expected] of routes) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, expected);
    assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
  }
});

test("ships site-specific social metadata", async () => {
  const response = await render("/");
  const html = await response.text();
  assert.match(html, /Buildstory/);
  assert.match(html, /og\.png/);
  assert.match(html, /summary_large_image/);
});

test("keeps public pages anonymous and private snapshot fields out of publication HTML", async () => {
  const response = await render("/p/orbit-notes");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Universal public access/i);
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
  assert.ok([302, 303, 307, 308].includes(dashboard.status));
  assert.match(dashboard.headers.get("location") ?? "", /\/signin\?callbackUrl=/);

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
