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
    `Nearby context: ${request.nearbyContext ?? "none"}`
  ].join("\n");
}
