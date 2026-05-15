import { MockTutorProvider } from "../providers/MockTutorProvider.js";

const provider = new MockTutorProvider();

const ambiguousResponse = await provider.ask({
  regionText: "FOLLOW(A) includes FIRST(B)",
  marker: "?",
  courseHint: "CS 132 parsing"
});

console.log("Intent options response:");
console.log(JSON.stringify(ambiguousResponse, null, 2));

const answerResponse = await provider.ask({
  regionText: "FOLLOW(A) includes FIRST(B)",
  marker: "?",
  selectedIntent: "Explain when FOLLOW includes FIRST",
  courseHint: "CS 132 parsing"
});

console.log("Tutor answer response:");
console.log(JSON.stringify(answerResponse, null, 2));
