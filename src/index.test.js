import { test } from "node:test";
import assert from "node:assert/strict";
import { name, version } from "./index.js";

test("exports the package name", () => {
  assert.equal(name, "@fudic/core");
});

test("exports a semver-looking version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
});