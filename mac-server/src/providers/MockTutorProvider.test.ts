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

  it("checks follow-up work against previous tutor context", async () => {
    const response = await provider.ask({
      regionText: "FOLLOW(A) = {$}",
      marker: "check?",
      courseHint: "CS 132 parsing",
      previousTutorState: [
        {
          regionText: "FOLLOW(A) includes FIRST(B)",
          marker: "?",
          selectedIntent: "Explain when FOLLOW includes FIRST",
          answer: "Add FIRST(B) minus ε when B follows A."
        }
      ]
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /previous tutor note/i);
    assert.match(response.answer ?? "", /missing terminals/i);
    assert.match(response.answer ?? "", /FIRST\(B\) minus ε/i);
  });

  it("flags epsilon inside a FOLLOW set", async () => {
    const response = await provider.ask({
      regionText: "FOLLOW(A) = { ε, $ }",
      marker: "✓?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /should not contain ε/i);
  });
});
