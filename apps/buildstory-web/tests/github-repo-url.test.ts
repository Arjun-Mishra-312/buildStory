import assert from "node:assert/strict";
import test from "node:test";
import { parseGithubRepoUrl } from "../lib/github/repo-url";

test("parseGithubRepoUrl extracts owner/repo from a github.com https URL, stripping a trailing .git", () => {
  assert.deepEqual(parseGithubRepoUrl("https://github.com/octocat/Hello-World"), { owner: "octocat", repo: "Hello-World" });
  assert.deepEqual(parseGithubRepoUrl("https://github.com/octocat/Hello-World.git"), { owner: "octocat", repo: "Hello-World" });
  assert.deepEqual(parseGithubRepoUrl("https://github.com/octocat/Hello-World/"), { owner: "octocat", repo: "Hello-World" });
  assert.deepEqual(parseGithubRepoUrl("https://github.com/octocat/Hello-World/tree/main"), { owner: "octocat", repo: "Hello-World" });
});

test("parseGithubRepoUrl refuses non-github hosts, non-https, and malformed paths", () => {
  assert.equal(parseGithubRepoUrl("https://gitlab.com/octocat/Hello-World"), null);
  assert.equal(parseGithubRepoUrl("http://github.com/octocat/Hello-World"), null, "non-https is refused");
  assert.equal(parseGithubRepoUrl("https://github.com/octocat"), null, "missing repo segment");
  assert.equal(parseGithubRepoUrl("https://github.com/"), null);
  assert.equal(parseGithubRepoUrl("git@github.com:octocat/Hello-World.git"), null, "scp-like syntax is not a URL");
  assert.equal(parseGithubRepoUrl("javascript:alert(1)"), null);
  assert.equal(parseGithubRepoUrl("not a url"), null);
  assert.equal(parseGithubRepoUrl("https://github.com/<script>/Hello-World"), null, "invalid owner characters are refused");
});
