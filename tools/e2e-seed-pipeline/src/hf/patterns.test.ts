import test from "node:test";
import assert from "node:assert/strict";
import { selectAllowedFiles } from "./patterns.js";

test("selects allowed files and ignores unsafe weight artifacts", () => {
  const selected = selectAllowedFiles({
    repoId: "owner/model",
    revision: "main",
    maxBytes: 1_000,
    allowedPatterns: ["README.md", "config.json", "*.json", "tokenizer.json"],
    ignorePatterns: ["pytorch_model.bin", "*.safetensors"],
    files: [
      { path: "README.md", size: 100 },
      { path: "config.json", size: 150 },
      { path: "tokenizer.json", size: 200 },
      { path: "model.safetensors", size: 900 },
    ],
  });

  assert.deepEqual(
    selected.map((file) => file.path),
    ["config.json", "README.md", "tokenizer.json"],
  );
});

test("rejects selections that exceed the max byte guard", () => {
  assert.throws(
    () =>
      selectAllowedFiles({
        repoId: "owner/model",
        revision: "main",
        maxBytes: 100,
        allowedPatterns: ["README.md", "config.json"],
        ignorePatterns: [],
        files: [
          { path: "README.md", size: 80 },
          { path: "config.json", size: 50 },
        ],
      }),
    /above max/,
  );
});

test("rejects unknown sizes because dry-run must be bounded", () => {
  assert.throws(
    () =>
      selectAllowedFiles({
        repoId: "owner/model",
        revision: "main",
        maxBytes: 100,
        allowedPatterns: ["README.md"],
        ignorePatterns: [],
        files: [{ path: "README.md" }],
      }),
    /without sizes/,
  );
});
