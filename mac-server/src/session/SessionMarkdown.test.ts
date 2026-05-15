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

  it("includes grounded course source labels when present", () => {
    const store = new InMemoryTutorStateStore("source-session");
    const detection = store.addDetection({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing",
      courseId: "course-1",
      useCourseGrounding: true
    });
    detection.selectedIntent = "Explain when FOLLOW includes FIRST";
    store.recordResponse(detection, {
      type: "tutor_answer",
      answer: "From uploaded course material: add FIRST(beta) except epsilon.",
      confidence: 0.8,
      provider: "mock",
      grounded: true,
      groundingStatus: "used_course_context",
      sources: [
        {
          fileId: "file-1",
          chunkId: "chunk-1",
          sourceLabel: "Lecture 4 Parsing.pdf p.12",
          pageNumber: 12
        }
      ]
    });

    const markdown = formatSessionMarkdown(store.getSession());

    assert.match(markdown, /Course ID: course-1/);
    assert.match(markdown, /Grounding: used_course_context/);
    assert.match(markdown, /Sources:/);
    assert.match(markdown, /Lecture 4 Parsing\.pdf p\.12/);
    assert.match(markdown, /chunk-1/);
  });

  it("handles an empty session without private files or artifacts", () => {
    const store = new InMemoryTutorStateStore("empty-session");
    const markdown = formatSessionMarkdown(store.getSession());

    assert.match(markdown, /No tutor answers yet\./);
    assert.doesNotMatch(markdown, /screenshot|frame|OCR log/i);
  });
});
