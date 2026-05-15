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
});
