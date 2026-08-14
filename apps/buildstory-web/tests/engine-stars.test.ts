import assert from "node:assert/strict";
import test from "node:test";
import { formatStarCount } from "../lib/github/engine-stars";

test("formatStarCount keeps small counts exact and compact larger ones", () => {
  assert.equal(formatStarCount(0), "0");
  assert.equal(formatStarCount(12), "12");
  assert.equal(formatStarCount(999), "999");
  assert.equal(formatStarCount(1000), "1k");
  assert.equal(formatStarCount(1234), "1.2k");
  assert.equal(formatStarCount(10500), "11k");
});
