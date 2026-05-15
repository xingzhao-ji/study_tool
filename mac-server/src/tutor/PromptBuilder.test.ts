import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCheckPrompt, buildTutorPrompt } from "./PromptBuilder.js";

describe("PromptBuilder", () => {
  it("includes compact previous tutor context for follow-up checks", () => {
    const prompt = buildCheckPrompt({
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

    assert.match(prompt, /Previous tutor context:/);
    assert.match(prompt, /marker=\?/);
    assert.match(prompt, /intent=Explain when FOLLOW includes FIRST/);
    assert.match(prompt, /tutor=Add FIRST\(B\) minus ε when B follows A\./);
  });

  it("limits previous context to recent compact turns", () => {
    const prompt = buildTutorPrompt({
      regionText: "line 4",
      marker: "next?",
      previousTutorState: [
        { regionText: "old line", marker: "hint?", answer: "old answer" },
        { regionText: "line 1", marker: "why?", answer: "answer 1" },
        { regionText: "line 2", marker: "next?", answer: "answer 2" },
        {
          regionText: "line 3",
          marker: "check?",
          answer: "x".repeat(260)
        }
      ]
    });

    assert.doesNotMatch(prompt, /old line/);
    assert.match(prompt, /line 1/);
    assert.match(prompt, /line 2/);
    assert.match(prompt, /xxx\.\.\./);
  });
});
