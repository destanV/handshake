import test from "node:test";
import assert from "node:assert/strict";
import { License, Source } from "@handshake/types";
import { hfModelFixtures } from "./hf-models.js";
import { mapHfLicense } from "../hf/license.js";

test("curated fixture has the default 25 model count", () => {
  assert.equal(hfModelFixtures.length, 25);
});

test("curated fixtures use licenses that can be mapped without License.Other", () => {
  for (const fixture of hfModelFixtures) {
    assert.notEqual(fixture.expectedLicense, License.Other, fixture.repoId);
    assert.equal(mapHfLicense(fixture.expectedLicense), fixture.expectedLicense, fixture.repoId);
    assert.ok(fixture.description.length >= 20, fixture.repoId);
  }
});

test("handshake parent fixtures point only to earlier fixtures", () => {
  const seen = new Set<string>();
  for (const fixture of hfModelFixtures) {
    for (const parent of fixture.parents ?? []) {
      if (parent.source === Source.Handshake) {
        assert.ok(seen.has(parent.repoId), `${fixture.repoId} parent ${parent.repoId} must appear earlier`);
      }
    }
    seen.add(fixture.repoId);
  }
});
