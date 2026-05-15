import type { TutorRequest } from "../types/tutor.js";

export function buildIntentPrompt(request: TutorRequest): string {
  return [
    "The user boxed handwritten study content and wrote an ambiguous question marker.",
    "List likely tutoring intentions instead of answering directly.",
    formatRequestContext(request)
  ].join("\n\n");
}

export function buildTutorPrompt(request: TutorRequest): string {
  return [
    "Give a concise step-by-step tutor response for the selected intent or marker.",
    "Do not over-solve unless the user asks for a full solution.",
    formatRequestContext(request)
  ].join("\n\n");
}

export function buildCheckPrompt(request: TutorRequest): string {
  return [
    "Check the boxed work for correctness.",
    "Identify the first concrete issue before giving a full correction.",
    formatRequestContext(request)
  ].join("\n\n");
}

function formatRequestContext(request: TutorRequest): string {
  return [
    `Region text: ${request.regionText}`,
    `Marker: ${request.marker}`,
    `Selected intent: ${request.selectedIntent ?? "none"}`,
    `Course hint: ${request.courseHint ?? "none"}`,
    `Nearby context: ${request.nearbyContext ?? "none"}`,
    `Course ID: ${request.courseId ?? "none"}`,
    `Use course grounding: ${request.useCourseGrounding ? "yes" : "no"}`,
    formatRetrievedContext(request),
    formatPreviousTutorState(request)
  ].join("\n");
}

function formatRetrievedContext(request: TutorRequest): string {
  if (!request.useCourseGrounding) {
    return "Uploaded course material: disabled";
  }

  const chunks = request.retrievedContext?.slice(0, 5) ?? [];

  if (chunks.length === 0) {
    return [
      "Uploaded course material: no relevant chunks retrieved",
      "Grounding policy: say exactly that there is not enough support in the uploaded course material before giving any outside-course explanation."
    ].join("\n");
  }

  const lines = chunks.map((chunk, index) => {
    const page = chunk.pageNumber ? ` p.${chunk.pageNumber}` : "";
    return [
      `[${index + 1}] ${chunk.sourceLabel}${page} (score ${chunk.score})`,
      compactLine(chunk.text)
    ].join("\n");
  });

  return [
    "Uploaded course material:",
    ...lines,
    "Grounding policy: prioritize these retrieved chunks. Cite only these source labels. If they do not support the answer, say: I do not see enough support for this in the uploaded course material."
  ].join("\n");
}

function formatPreviousTutorState(request: TutorRequest): string {
  const previousTurns = request.previousTutorState?.slice(-3) ?? [];

  if (previousTurns.length === 0) {
    return "Previous tutor context: none";
  }

  const lines = previousTurns.map((turn, index) => {
    const marker = turn.marker || "none";
    const intent = turn.selectedIntent ?? "none";
    const region = compactLine(turn.regionText);
    const answer = compactLine(turn.answer ?? "none");
    return `${index + 1}. marker=${marker}; intent=${intent}; boxed=${region}; tutor=${answer}`;
  });

  return ["Previous tutor context:", ...lines].join("\n");
}

function compactLine(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();

  if (singleLine.length <= 220) {
    return singleLine;
  }

  return `${singleLine.slice(0, 217)}...`;
}
