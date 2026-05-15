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
    formatPreviousTutorState(request)
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
