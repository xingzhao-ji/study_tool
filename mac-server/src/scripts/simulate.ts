import assert from "node:assert/strict";
import { MockTutorProvider } from "../providers/MockTutorProvider.js";

const provider = new MockTutorProvider();

const ambiguousResponse = await provider.ask({
  regionText: "FOLLOW(A) includes FIRST(B)",
  marker: "?",
  courseHint: "CS 132 parsing",
  nearbyContext: "FIRST and FOLLOW sets"
});

assert.equal(ambiguousResponse.type, "intent_options");
printResponse("Intent options response", ambiguousResponse);

const answerResponse = await provider.ask({
  regionText: "FOLLOW(A) includes FIRST(B)",
  marker: "?",
  selectedIntent: "Explain when FOLLOW includes FIRST",
  courseHint: "CS 132 parsing",
  nearbyContext: "FIRST and FOLLOW sets"
});

assert.equal(answerResponse.type, "tutor_answer");
printResponse("Tutor answer response", answerResponse);

const followUpCheckResponse = await provider.ask({
  regionText: "FOLLOW(A) = { FIRST(B), ε, $ }",
  marker: "check?",
  courseHint: "CS 132 parsing",
  nearbyContext: "Checking whether my FOLLOW set is correct",
  previousTutorState: [
    {
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "?",
      selectedIntent: "Explain when FOLLOW includes FIRST",
      answer: answerResponse.answer
    }
  ]
});

assert.equal(followUpCheckResponse.type, "tutor_answer");
assert.match(followUpCheckResponse.answer ?? "", /should not contain ε/);
printResponse("Follow-up check response", followUpCheckResponse);

const algebraCheckResponse = await provider.ask({
  regionText: "x = 5",
  marker: "✓?",
  courseHint: "Algebra",
  nearbyContext: "Solve 2x + 3 = 13"
});

assert.equal(algebraCheckResponse.type, "tutor_answer");
assert.match(algebraCheckResponse.answer ?? "", /correct so far/i);
printResponse("Algebra check response", algebraCheckResponse);

function printResponse(label: string, response: unknown) {
  console.log(`${label}:`);
  console.log(JSON.stringify(response, null, 2));
}
