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

  const metadata = [
    `Created: ${turn.createdAt}`,
    `Course: ${turn.courseHint || "none"}`
  ];

  if (turn.courseId) {
    metadata.push(`Course ID: ${turn.courseId}`);
  }

  metadata.push(`Provider: ${turn.provider}`, `Confidence: ${formatConfidence(turn.confidence)}`);

  if (turn.groundingStatus) {
    metadata.push(`Grounding: ${turn.groundingStatus}`);
  }

  if (turn.nearbyContext) {
    metadata.push(`Nearby context: ${turn.nearbyContext}`);
  }

  const lines = [
    `## ${titleParts.join(" - ")}`,
    "",
    ...metadata,
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

  if (turn.sources?.length) {
    lines.push("Sources:", "");

    for (const source of turn.sources) {
      lines.push(`- ${source.sourceLabel} (${source.chunkId})`);
    }

    lines.push("");
  }

  return lines;
}

function safeFenceText(value: string): string {
  return value.replace(/```/g, "'''").trim();
}

function formatConfidence(confidence: number | undefined): string {
  return confidence === undefined ? "unknown" : `${Math.round(confidence * 100)}%`;
}
