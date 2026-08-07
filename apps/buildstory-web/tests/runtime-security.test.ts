import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { productionRuntimeIssues } from "../lib/config/runtime";
import {
  assertHostedCliRequest,
  assertLoopbackApiRequest,
  LocalApiRequestError,
} from "../lib/ingestion/local-api";
import {
  assertSameOriginBrowserMutation,
  BrowserRequestSecurityError,
} from "../lib/security/browser-request";
import { sanitizePublicText } from "../lib/publication/sanitization";

const managedEnvironment = [
  "NODE_ENV",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "BUILDSTORY_PUBLIC_ORIGIN",
  "BUILDSTORY_ALLOWED_HOSTS",
  "BUILDSTORY_STORE",
  "BUILDSTORY_DEV_AUTH_BYPASS",
  "BUILDSTORY_LOCAL_API_ENABLED",
  "BUILDSTORY_LOG_LEVEL",
] as const;

function withEnvironment(
  values: Partial<Record<(typeof managedEnvironment)[number], string | undefined>>,
  assertion: () => void,
) {
  const previous = new Map(managedEnvironment.map((key) => [key, process.env[key]]));
  try {
    for (const key of managedEnvironment) {
      const value = values[key];
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
    assertion();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
}

test("production configuration accepts only the durable, hosted safety posture", () => {
  withEnvironment(
    {
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(48),
      AUTH_GOOGLE_ID: "google-client-id",
      AUTH_GOOGLE_SECRET: "google-client-secret",
      BUILDSTORY_PUBLIC_ORIGIN: "https://buildstory.example.com",
      BUILDSTORY_ALLOWED_HOSTS: "buildstory.example.com",
      BUILDSTORY_STORE: "d1",
      BUILDSTORY_DEV_AUTH_BYPASS: "false",
      BUILDSTORY_LOCAL_API_ENABLED: "false",
      BUILDSTORY_LOG_LEVEL: "info",
    },
    () => assert.deepEqual(productionRuntimeIssues(), []),
  );
});

test("production configuration accepts a matched GitHub pair alongside Google, and flags a half-set pair", () => {
  withEnvironment(
    {
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(48),
      AUTH_GOOGLE_ID: "google-client-id",
      AUTH_GOOGLE_SECRET: "google-client-secret",
      AUTH_GITHUB_ID: "github-client-id",
      AUTH_GITHUB_SECRET: "github-client-secret",
      BUILDSTORY_PUBLIC_ORIGIN: "https://buildstory.example.com",
      BUILDSTORY_ALLOWED_HOSTS: "buildstory.example.com",
      BUILDSTORY_STORE: "d1",
      BUILDSTORY_DEV_AUTH_BYPASS: "false",
      BUILDSTORY_LOCAL_API_ENABLED: "false",
      BUILDSTORY_LOG_LEVEL: "info",
    },
    () => assert.deepEqual(productionRuntimeIssues(), []),
  );
  withEnvironment(
    {
      NODE_ENV: "production",
      AUTH_SECRET: "x".repeat(48),
      AUTH_GOOGLE_ID: "google-client-id",
      AUTH_GOOGLE_SECRET: "google-client-secret",
      AUTH_GITHUB_ID: "github-client-id",
      AUTH_GITHUB_SECRET: undefined,
      BUILDSTORY_PUBLIC_ORIGIN: "https://buildstory.example.com",
      BUILDSTORY_ALLOWED_HOSTS: "buildstory.example.com",
      BUILDSTORY_STORE: "d1",
      BUILDSTORY_DEV_AUTH_BYPASS: "false",
      BUILDSTORY_LOCAL_API_ENABLED: "false",
      BUILDSTORY_LOG_LEVEL: "info",
    },
    () => {
      const variables = new Set(productionRuntimeIssues().map((issue) => issue.variable));
      assert.equal(variables.has("AUTH_GITHUB_SECRET"), true, "a half-set GitHub pair is flagged even though Google alone is valid");
    },
  );
});

test("production configuration fails closed on memory, local API, and host mistakes", () => {
  withEnvironment(
    {
      NODE_ENV: "production",
      AUTH_SECRET: "short",
      AUTH_GOOGLE_ID: "<placeholder>",
      AUTH_GOOGLE_SECRET: "<placeholder>",
      BUILDSTORY_PUBLIC_ORIGIN: "http://localhost:3000",
      BUILDSTORY_ALLOWED_HOSTS: "other.example.com",
      BUILDSTORY_STORE: "memory",
      BUILDSTORY_DEV_AUTH_BYPASS: "true",
      BUILDSTORY_LOCAL_API_ENABLED: "true",
    },
    () => {
      const variables = new Set(productionRuntimeIssues().map((issue) => issue.variable));
      assert.equal(variables.has("AUTH_SECRET"), true);
      assert.equal(variables.has("AUTH_GOOGLE_ID"), true);
      assert.equal(variables.has("BUILDSTORY_PUBLIC_ORIGIN"), true);
      assert.equal(variables.has("BUILDSTORY_STORE"), true);
      assert.equal(variables.has("BUILDSTORY_DEV_AUTH_BYPASS"), true);
      assert.equal(variables.has("BUILDSTORY_LOCAL_API_ENABLED"), true);
    },
  );
});

test("creator writes require an exact same-origin browser request", () => {
  assert.doesNotThrow(() =>
    assertSameOriginBrowserMutation(
      new Request("https://buildstory.example.com/api/creator/reports/one", {
        method: "PATCH",
        headers: { origin: "https://buildstory.example.com" },
      }),
    ),
  );
  assert.throws(
    () =>
      assertSameOriginBrowserMutation(
        new Request("https://buildstory.example.com/api/creator/reports/one", {
          method: "PATCH",
          headers: { origin: "https://evil.example.com" },
        }),
      ),
    (error) =>
      error instanceof BrowserRequestSecurityError &&
      error.code === "cross_site_request_refused",
  );
});

test("the local scanner API is opt-in and rejects a different loopback origin", () => {
  withEnvironment(
    { NODE_ENV: "development", BUILDSTORY_LOCAL_API_ENABLED: "false" },
    () => {
      assert.throws(
        () => assertLoopbackApiRequest(new Request("http://localhost:3000/api/v1/cli/connect")),
        (error) =>
          error instanceof LocalApiRequestError && error.code === "local_api_disabled",
      );
    },
  );
  withEnvironment(
    { NODE_ENV: "development", BUILDSTORY_LOCAL_API_ENABLED: "true" },
    () => {
      assert.doesNotThrow(() =>
        assertLoopbackApiRequest(
          new Request("http://localhost:3000/api/v1/cli/connect", {
            headers: { origin: "http://localhost:3000" },
          }),
        ),
      );
      assert.throws(
        () =>
          assertLoopbackApiRequest(
            new Request("http://localhost:3000/api/v1/cli/connect", {
              headers: { origin: "http://localhost:4000" },
            }),
          ),
        (error) =>
          error instanceof LocalApiRequestError &&
          error.code === "cross_site_request_refused",
      );
    },
  );
});

test("the hosted CLI API is opt-in and accepts requests only on the configured public origin", () => {
  withEnvironment({ NODE_ENV: "development", BUILDSTORY_PUBLIC_ORIGIN: "https://buildstory.example.com" }, () => {
    assert.throws(
      () => assertHostedCliRequest(new Request("https://buildstory.example.com/api/v1/cli/connect")),
      (error) =>
        error instanceof LocalApiRequestError && error.code === "hosted_cli_unavailable",
    );
  });
  withEnvironment({ NODE_ENV: "production", BUILDSTORY_PUBLIC_ORIGIN: undefined }, () => {
    assert.throws(
      () => assertHostedCliRequest(new Request("https://buildstory.example.com/api/v1/cli/connect")),
      (error) =>
        error instanceof LocalApiRequestError && error.code === "hosted_cli_unavailable",
    );
  });
  withEnvironment(
    { NODE_ENV: "production", BUILDSTORY_PUBLIC_ORIGIN: "https://buildstory.example.com" },
    () => {
      assert.doesNotThrow(() =>
        assertHostedCliRequest(
          new Request("https://buildstory.example.com/api/v1/cli/connect", {
            headers: { origin: "https://buildstory.example.com" },
          }),
        ),
      );
      assert.throws(
        () => assertHostedCliRequest(new Request("https://evil.example.com/api/v1/cli/connect")),
        (error) =>
          error instanceof LocalApiRequestError && error.code === "cli_host_not_allowed",
      );
      assert.throws(
        () =>
          assertHostedCliRequest(
            new Request("https://buildstory.example.com/api/v1/cli/connect", {
              headers: { origin: "https://evil.example.com" },
            }),
          ),
        (error) =>
          error instanceof LocalApiRequestError &&
          error.code === "cross_site_request_refused",
      );
    },
  );
});

test("web and scanner packages share the same ProjectSnapshot schema semantics", async () => {
  const [webSchema, scannerSchema] = await Promise.all([
    readFile(new URL("../lib/ingestion/project-snapshot.schema.json", import.meta.url), "utf8"),
    readFile(
      new URL("../../../packages/buildstory-scanner/schema/project-snapshot.schema.json", import.meta.url),
      "utf8",
    ),
  ]);
  assert.deepEqual(JSON.parse(webSchema), JSON.parse(scannerSchema));
});

test("public text sanitization removes secrets, remote locations, and local paths", () => {
  const input = [
    "https://private.example.invalid/repository",
    "git@github.com:private/repository.git",
    "C:\\Users\\builder\\private\\source.ts",
    "/home/builder/private/source.ts",
    "token=sk-proj-abcdefghijklmnopqrstuvwxyz123456",
  ].join(" ");
  const sanitized = sanitizePublicText(input, 4_000);
  assert.ok(sanitized.findings.length >= 4);
  assert.doesNotMatch(sanitized.value, /private\.example|github\.com|Users|\/home\/|sk-proj/i);
});
