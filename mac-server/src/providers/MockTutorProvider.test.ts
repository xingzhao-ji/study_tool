import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockTutorProvider } from "./MockTutorProvider.js";

describe("MockTutorProvider", () => {
  const provider = new MockTutorProvider();

  it("keeps FOLLOW/FIRST intent options for parsing requests", async () => {
    const response = await provider.ask({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.type, "intent_options");
    assert.deepEqual(response.options, [
      "Explain when FOLLOW includes FIRST",
      "Check whether my rule is correct",
      "Show a concrete example",
      "Give the next step only",
      "Find the likely misconception"
    ]);
  });

  it("uses math intent options outside parsing examples", async () => {
    const response = await provider.ask({
      regionText: "u = x^2 + 1",
      marker: "?",
      courseHint: "Calculus"
    });

    assert.equal(response.type, "intent_options");
    assert.deepEqual(response.options, [
      "Explain the rule being used",
      "Check my algebra or setup",
      "Give one small hint",
      "Show a similar example",
      "Give the next step only"
    ]);
  });

  it("does not answer generic selected intents with parsing-specific text", async () => {
    const response = await provider.ask({
      regionText: "u = x^2 + 1",
      marker: "?",
      selectedIntent: "Explain the rule being used",
      courseHint: "Calculus"
    });

    assert.equal(response.type, "tutor_answer");
    assert.doesNotMatch(response.answer ?? "", /FOLLOW|FIRST/);
    assert.match(response.answer ?? "", /rule|definition/i);
  });

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

  it("recognizes a correct FIRST/FOLLOW condition before suggesting another step", async () => {
    const response = await provider.ask({
      regionText: "FOLLOW(A) gets FIRST(B) minus ε when B follows A",
      marker: "check?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /correct so far/i);
    assert.doesNotMatch(response.answer ?? "", /First issue/i);
  });

  it("flags a missing coefficient in a power-rule derivative", async () => {
    const response = await provider.ask({
      regionText: "d/dx x^3 = x^2",
      marker: "check?",
      courseHint: "Calculus"
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /First issue/i);
    assert.match(response.answer ?? "", /multiply by the old exponent/i);
  });

  it("recognizes a correct power-rule derivative", async () => {
    const response = await provider.ask({
      regionText: "d/dx x^3 = 3x^2",
      marker: "✓?",
      courseHint: "Calculus"
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /correct so far/i);
  });

  it("recognizes a correct linear equation solution", async () => {
    const response = await provider.ask({
      regionText: "x = 5",
      marker: "✓?",
      courseHint: "Algebra",
      nearbyContext: "Solve 2x + 3 = 13"
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /correct so far/i);
    assert.match(response.answer ?? "", /substituting x = 5/i);
    assert.doesNotMatch(response.answer ?? "", /First issue/i);
  });

  it("flags an incorrect linear equation solution with the substitution result", async () => {
    const response = await provider.ask({
      regionText: "x = 4",
      marker: "check?",
      courseHint: "Algebra",
      nearbyContext: "Solve 2x + 3 = 13"
    });

    assert.equal(response.type, "tutor_answer");
    assert.match(response.answer ?? "", /First issue/i);
    assert.match(response.answer ?? "", /left side becomes 11/i);
    assert.match(response.answer ?? "", /x = 5/i);
  });
});
