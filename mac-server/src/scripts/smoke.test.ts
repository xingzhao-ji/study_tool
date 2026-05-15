import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runSmoke } from "./smoke.js";

describe("smoke script", () => {
  it("exercises the route-level MVP tutor flow", async () => {
    const lines: string[] = [];

    await runSmoke((line) => lines.push(line));

    assert.ok(lines.includes("Smoke test passed"));
    assert.ok(lines.some((line) => line.includes("POST /ask ? -> intent_options")));
    assert.ok(lines.some((line) => line.includes("POST /frame empty -> validation error")));
    assert.ok(lines.some((line) => line.includes("POST /frame manual -> intent_options")));
    assert.ok(lines.some((line) => line.includes("POST /clear-session -> reset")));
  });
});
