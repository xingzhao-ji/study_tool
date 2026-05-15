import type { TutorSession, TutorSessionTurn } from "./TutorStateStore.js";

export function formatSessionMarkdown(session: TutorSession): string {
  const lines = [
    "# Goodnotes Companion Tutor Session",
    "",
    `Session: ${session.id}`,
    ""
  ];

  if (session.turns.length === 0) {
    lines.push("No tutor answers yet.", "");
    return lines.join("\n");
  }

  session.turns.forEach((turn, index) => {
    lines.push(...formatTurn(turn, index));
  });

  return lines.join("\n").trimEnd() + "\n";
}

function formatTurn(turn: TutorSessionTurn, index: number): string[] {
  const titleParts = [`${index + 1}. ${turn.marker}`];

  if (turn.selectedIntent) {
    titleParts.push(turn.selectedIntent);
  }

  const lines = [
    `## ${titleParts.join(" - ")}`,
    "",
    `Created: ${turn.createdAt}`,
    `Course: ${turn.courseHint || "none"}`,
    `Provider: ${turn.provider}`,
    `Confidence: ${formatConfidence(turn.confidence)}`,
    "",
    "Boxed text:",
    "",
    "```text",
    safeFenceText(turn.regionText),
    "```",
    "",
    "Tutor answer:",
    "",
    safeFenceText(turn.answer || "No answer recorded."),
    ""
  ];

  if (turn.nearbyContext) {
    lines.splice(7, 0, `Nearby context: ${turn.nearbyContext}`, "");
  }

  return lines;
}

function safeFenceText(value: string): string {
  return value.replace(/```/g, "'''").trim();
}

function formatConfidence(confidence: number | undefined): string {
  return confidence === undefined ? "unknown" : `${Math.round(confidence * 100)}%`;
}
