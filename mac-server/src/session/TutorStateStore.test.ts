import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryTutorStateStore } from "./TutorStateStore.js";

describe("InMemoryTutorStateStore", () => {
  it("records detections, responses, and clears state", () => {
    const store = new InMemoryTutorStateStore("test-session");
    const detection = store.addDetection({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing",
      nearbyContext: ""
    });

    store.recordResponse(detection, {
      type: "intent_options",
      options: ["Explain", "Check", "Example"],
      provider: "mock"
    });

    assert.equal(store.getSession().id, "test-session");
    assert.equal(store.getSession().detections.length, 1);
    assert.equal(store.getLatest()?.detectedQuestion.id, detection.id);

    store.clear();

    assert.equal(store.getSession().detections.length, 0);
    assert.equal(store.getLatest(), null);
  });

  it("remembers active course settings across session clears", () => {
    const store = new InMemoryTutorStateStore("test-session");

    store.setCourseSettings({
      activeCourseId: "course-1",
      useCourseGrounding: true
    });

    assert.equal(store.getSession().activeCourseId, "course-1");
    assert.equal(store.getSession().useCourseGrounding, true);

    store.clear();

    assert.equal(store.getSession().activeCourseId, "course-1");
    assert.equal(store.getSession().useCourseGrounding, true);
  });

  it("undoes the latest detection and restores the previous answered turn", () => {
    const store = new InMemoryTutorStateStore("test-session");
    const first = store.addDetection({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing"
    });
    store.recordResponse(first, {
      type: "tutor_answer",
      answer: "first answer",
      provider: "mock"
    });
    const second = store.addDetection({
      regionText: "FOLLOW(A) = {$}",
      marker: "check?",
      courseHint: "CS 132 parsing"
    });
    store.recordResponse(second, {
      type: "tutor_answer",
      answer: "second answer",
      provider: "mock"
    });

    const session = store.undoLatest();

    assert.equal(session.detections.length, 1);
    assert.equal(session.turns.length, 1);
    assert.equal(session.latest?.detectedQuestion.id, first.id);
    assert.equal(session.latest?.tutorResponse.answer, "first answer");
  });

  it("undoes an unanswered intent-options detection without removing the previous turn", () => {
    const store = new InMemoryTutorStateStore("test-session");
    const answered = store.addDetection({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      courseHint: "CS 132 parsing"
    });
    store.recordResponse(answered, {
      type: "tutor_answer",
      answer: "previous answer",
      provider: "mock"
    });
    const unanswered = store.addDetection({
      regionText: "new boxed work",
      marker: "?",
      courseHint: "CS 132 parsing"
    });
    store.recordResponse(unanswered, {
      type: "intent_options",
      options: ["Explain", "Check", "Example"],
      provider: "mock"
    });

    const session = store.undoLatest();

    assert.equal(session.detections.length, 1);
    assert.equal(session.turns.length, 1);
    assert.equal(session.latest?.detectedQuestion.id, answered.id);
    assert.equal(session.latest?.tutorResponse.answer, "previous answer");
  });
});
