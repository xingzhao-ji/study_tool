import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryTutorStateStore } from "./TutorStateStore.js";
import { formatSessionMarkdown } from "./SessionMarkdown.js";

describe("formatSessionMarkdown", () => {
  it("exports a compact markdown study note from in-memory turns", () => {
    const store = new InMemoryTutorStateStore("markdown-session");
    const detection = store.addDetection({
      regionText: "FOLLOW(A) = {```}",
      marker: "check?",
      courseHint: "CS 132 parsing",
      nearbyContext: "S -> A B"
    });
    store.recordResponse(detection, {
      type: "tutor_answer",
      answer: "First issue: FOLLOW sets should not contain ε.",
      confidence: 0.7,
      provider: "mock"
    });

    const markdown = formatSessionMarkdown(store.getSession());

    assert.match(markdown, /^# Goodnotes Companion Tutor Session/);
    assert.match(markdown, /Session: markdown-session/);
    assert.match(markdown, /## 1\. check\?/);
    assert.match(markdown, /Course: CS 132 parsing/);
    assert.match(markdown, /Provider: mock/);
    assert.match(markdown, /Confidence: 70%/);
    assert.match(markdown, /Nearby context: S -> A B/);
    assert.match(markdown, /FOLLOW\(A\) = \{'''\}/);
    assert.match(markdown, /First issue: FOLLOW sets should not contain ε\./);
    assert.doesNotMatch(markdown, /data:image/);
  });

  it("handles an empty session without private files or artifacts", () => {
    const store = new InMemoryTutorStateStore("empty-session");
    const markdown = formatSessionMarkdown(store.getSession());

    assert.match(markdown, /No tutor answers yet\./);
    assert.doesNotMatch(markdown, /screenshot|frame|OCR log/i);
  });
});
