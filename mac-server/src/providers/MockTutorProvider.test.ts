import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockTutorProvider } from "./MockTutorProvider.js";

describe("MockTutorProvider", () => {
  const provider = new MockTutorProvider();

  it("treats check? and ✓? as check requests", async () => {
    const checkResponse = await provider.ask({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "check?"
    });
    const tickResponse = await provider.ask({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "✓?"
    });

    assert.equal(checkResponse.type, "tutor_answer");
    assert.equal(tickResponse.type, "tutor_answer");
    assert.equal(checkResponse.answer, tickResponse.answer);
    assert.match(checkResponse.answer ?? "", /first issue/i);
  });

  it("returns marker-specific concise tutor answers", async () => {
    const markers = ["hint?", "next?", "why?", "err?", "full?", "ex?", "simplify?"];

    for (const marker of markers) {
      const response = await provider.ask({
        regionText: "FOLLOW(A) includes FIRST(B)",
        marker,
        courseHint: "CS 132 parsing"
      });

      assert.equal(response.type, "tutor_answer");
      assert.equal(response.provider, "mock");
      assert.ok(response.answer);
    }
  });
});
