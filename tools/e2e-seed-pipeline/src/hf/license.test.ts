import test from "node:test";
import assert from "node:assert/strict";
import { License } from "@handshake/types";
import { assertExpectedLicense, mapHfLicense, resolveAllowedLicense } from "./license.js";

test("maps supported Hugging Face licenses to Handshake licenses", () => {
  assert.equal(mapHfLicense("license:apache-2.0"), License.Apache2);
  assert.equal(mapHfLicense("MIT"), License.MIT);
  assert.equal(mapHfLicense("cc-by-nc-4.0"), License.CcByNc4);
  assert.equal(mapHfLicense("llama3"), License.Llama3);
});

test("rejects unknown or missing Hugging Face licenses", () => {
  assert.equal(mapHfLicense("unknown-license"), null);
  assert.throws(
    () => resolveAllowedLicense({ repoId: "example/model", tags: [], files: [] }),
    /Unsupported or missing Hugging Face license/,
  );
});

test("checks fixture expected license against Hugging Face metadata", () => {
  assert.equal(
    assertExpectedLicense(
      {
        repoId: "example/model",
        tags: ["license:mit"],
        files: [],
      },
      License.MIT,
    ),
    License.MIT,
  );
  assert.throws(
    () =>
      assertExpectedLicense(
        {
          repoId: "example/model",
          tags: ["license:apache-2.0"],
          files: [],
        },
        License.MIT,
      ),
    /License mismatch/,
  );
});
