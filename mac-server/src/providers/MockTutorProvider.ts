import type { TutorProvider, TutorRequest, TutorResponse } from "./TutorProvider.js";

const DEFAULT_INTENT_OPTIONS = [
  "Explain when FOLLOW includes FIRST",
  "Check whether my rule is correct",
  "Show a concrete example",
  "Give the next step only",
  "Find the likely misconception"
];

export class MockTutorProvider implements TutorProvider {
  readonly name = "mock" as const;

  async ask(request: TutorRequest): Promise<TutorResponse> {
    const marker = request.marker.trim();

    if (marker === "?" && !request.selectedIntent) {
      return {
        type: "intent_options",
        options: DEFAULT_INTENT_OPTIONS,
        provider: this.name
      };
    }

    return {
      type: "tutor_answer",
      answer: this.answerFor(request, marker),
      confidence: this.confidenceFor(marker, request.selectedIntent),
      provider: this.name
    };
  }

  private answerFor(request: TutorRequest, marker: string): string {
    if (request.selectedIntent) {
      return this.answerForIntent(request);
    }

    switch (marker) {
      case "hint?":
        return "Hint: focus on the symbols that can appear immediately after the boxed nonterminal. Add FIRST of that following sequence, excluding ε.";
      case "next?":
        return "Next step: identify the production where this nonterminal is followed by another symbol, then compute FIRST of the remaining suffix.";
      case "why?":
        return "This works because FOLLOW tracks terminals that can appear immediately to the right of a nonterminal in some sentential form.";
      case "check?":
      case "✓?":
        return this.checkAnswer(request);
      case "err?":
        return "Likely mistake: treating FIRST(B) as always flowing into FOLLOW(A). That only happens when B is immediately after A, or begins the suffix after A, in a production.";
      case "full?":
        return "Full rule: for a production X -> α A β, add FIRST(β) minus ε to FOLLOW(A). If β can derive ε, also add FOLLOW(X) to FOLLOW(A).";
      case "ex?":
        return "Example: in S -> A B, terminals in FIRST(B) can follow A, so add FIRST(B) minus ε to FOLLOW(A). If B can vanish, add FOLLOW(S) too.";
      case "simplify?":
        return "Simpler version: look right after A. Whatever terminal could come next belongs in FOLLOW(A). If nothing must come next, inherit what can follow the whole left side.";
      case "?":
        return this.answerForIntent(request);
      default:
        return "I can help with this step, but the marker is not recognized yet. Try ?, hint?, next?, why?, check?, err?, full?, ex?, or simplify?.";
    }
  }

  private answerForIntent(request: TutorRequest): string {
    const intent = request.selectedIntent?.toLowerCase() ?? "";

    if (intent.includes("check")) {
      return "The rule is close, but be precise: FOLLOW(A) receives FIRST(B) minus ε only when B starts the suffix immediately after A in a production.";
    }

    if (intent.includes("example")) {
      return "For S -> A B and FIRST(B) = {b, ε}, add b to FOLLOW(A). Because B can vanish, also add FOLLOW(S) to FOLLOW(A).";
    }

    if (intent.includes("next")) {
      return "Next step: find the production containing A, write the suffix after A, then add FIRST of that suffix excluding ε.";
    }

    if (intent.includes("misconception") || intent.includes("mistake")) {
      return "The likely misconception is that FIRST(B) always belongs to FOLLOW(A). It only flows there when B is positioned after A in a production.";
    }

    return "FOLLOW(A) can receive FIRST(B) when A is immediately followed by B or by a sequence starting with B in some production. Add terminals from FIRST(B), but do not add ε. If the symbols after A can all vanish, then FOLLOW of the left-hand side can also flow into FOLLOW(A).";
  }

  private checkAnswer(request: TutorRequest): string {
    const text = request.regionText.toLowerCase();
    const hasPreviousTutorContext = (request.previousTutorState?.length ?? 0) > 0;
    const contextLead = hasPreviousTutorContext ? "Using the previous tutor note: " : "";

    if (text.includes("ε") || text.includes("epsilon")) {
      return `${contextLead}First issue: FOLLOW sets should not contain ε. Add terminals from FIRST of the suffix, and if that suffix can vanish, add FOLLOW of the production's left-hand side instead.`;
    }

    if (/follow\s*\([^)]*\)\s*=\s*\{\s*\$?\s*\}/i.test(request.regionText)) {
      return `${contextLead}First issue: this FOLLOW set is probably missing terminals from the suffix after the nonterminal. If B follows A, add FIRST(B) minus ε before deciding whether $ also belongs.`;
    }

    if (text.includes("follow") && text.includes("first")) {
      return `${contextLead}First issue: make the condition explicit. Add FIRST of the suffix after A, excluding ε; FIRST(B) flows into FOLLOW(A) only when B starts that suffix in a production.`;
    }

    return `${contextLead}First issue to check: compare this line with the exact rule used in the previous step. Verify the condition, remove any impossible symbol, then keep only the next correction.`;
  }

  private confidenceFor(marker: string, selectedIntent?: string | null): number {
    if (selectedIntent) {
      return 0.8;
    }

    if (marker === "?" || marker === "check?" || marker === "✓?") {
      return 0.7;
    }

    return 0.65;
  }
}
