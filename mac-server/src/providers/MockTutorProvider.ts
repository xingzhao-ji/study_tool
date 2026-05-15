import type { TutorProvider, TutorRequest, TutorResponse } from "./TutorProvider.js";

const PARSING_INTENT_OPTIONS = [
  "Explain when FOLLOW includes FIRST",
  "Check whether my rule is correct",
  "Show a concrete example",
  "Give the next step only",
  "Find the likely misconception"
];

const GENERAL_INTENT_OPTIONS = [
  "Explain the boxed step",
  "Check whether my work is correct",
  "Give one small hint",
  "Give the next step only",
  "Find the likely misconception"
];

const MATH_INTENT_OPTIONS = [
  "Explain the rule being used",
  "Check my algebra or setup",
  "Give one small hint",
  "Show a similar example",
  "Give the next step only"
];

export class MockTutorProvider implements TutorProvider {
  readonly name = "mock" as const;

  async ask(request: TutorRequest): Promise<TutorResponse> {
    const marker = request.marker.trim();

    if (marker === "?" && !request.selectedIntent) {
      return {
        type: "intent_options",
        options: this.intentOptionsFor(request),
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
        return this.isParsingRequest(request)
          ? "Hint: focus on the symbols that can appear immediately after the boxed nonterminal. Add FIRST of that following sequence, excluding ε."
          : "Hint: name the exact rule or definition that justifies the boxed step, then apply only that rule.";
      case "next?":
        return this.isParsingRequest(request)
          ? "Next step: identify the production where this nonterminal is followed by another symbol, then compute FIRST of the remaining suffix."
          : "Next step: rewrite the boxed line with one explicit rule applied. Do not combine multiple changes yet.";
      case "why?":
        return this.isParsingRequest(request)
          ? "This works because FOLLOW tracks terminals that can appear immediately to the right of a nonterminal in some sentential form."
          : "This step is valid only if it follows from the rule or definition you are applying. Check the condition first, then the algebra or substitution.";
      case "check?":
      case "✓?":
        return this.checkAnswer(request);
      case "err?":
        return this.isParsingRequest(request)
          ? "Likely mistake: treating FIRST(B) as always flowing into FOLLOW(A). That only happens when B is immediately after A, or begins the suffix after A, in a production."
          : "Likely mistake: one condition for the rule is being skipped. Check the assumption before checking arithmetic.";
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

    if (!this.isParsingRequest(request)) {
      return this.generalAnswerForIntent(intent);
    }

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

  private generalAnswerForIntent(intent: string): string {
    if (intent.includes("check")) {
      return "First issue to check: identify the rule used in the boxed step and verify its condition. If the condition holds, then check the algebra one line at a time.";
    }

    if (intent.includes("example")) {
      return "Use a smaller parallel example with simple numbers or symbols first. Match each part of that example to the boxed step, then return to your problem.";
    }

    if (intent.includes("hint")) {
      return "Hint: circle the exact expression that changed from the previous line. That usually reveals which rule you need.";
    }

    if (intent.includes("next")) {
      return "Next step: write the rule name beside the boxed line, then perform only the next transformation that rule allows.";
    }

    if (intent.includes("misconception") || intent.includes("mistake")) {
      return "The likely misconception is applying a familiar rule before checking whether its required condition is true.";
    }

    return "The boxed step needs one explicit justification. State the rule or definition first, check its condition, then make the smallest next move.";
  }

  private checkAnswer(request: TutorRequest): string {
    const text = request.regionText.toLowerCase();
    const hasPreviousTutorContext = (request.previousTutorState?.length ?? 0) > 0;
    const contextLead = hasPreviousTutorContext ? "Using the previous tutor note: " : "";
    const mentionsFollowAndFirst = text.includes("follow") && text.includes("first");
    const excludesEpsilon = /minus\s*(ε|epsilon)|excluding\s*(ε|epsilon)|without\s*(ε|epsilon)|-\s*ε/.test(text);
    const hasFollowCondition = /(when|if).*(follows|after|suffix|immediately)/.test(text);
    const powerRuleCheck = this.checkPowerRuleDerivative(text, contextLead);

    if (powerRuleCheck) {
      return powerRuleCheck;
    }

    if (mentionsFollowAndFirst && excludesEpsilon && hasFollowCondition) {
      return `${contextLead}This is correct so far. Next, check whether the suffix after A can vanish; only then should FOLLOW of the left-hand side flow into FOLLOW(A).`;
    }

    if (/follow\s*\([^)]*\)\s*=\s*\{[^}]*(epsilon|ε)[^}]*\}/i.test(request.regionText)) {
      return `${contextLead}First issue: FOLLOW sets should not contain ε. Add terminals from FIRST of the suffix, and if that suffix can vanish, add FOLLOW of the production's left-hand side instead.`;
    }

    if (/follow\s*\([^)]*\)\s*=\s*\{\s*\$?\s*\}/i.test(request.regionText)) {
      return `${contextLead}First issue: this FOLLOW set is probably missing terminals from the suffix after the nonterminal. If B follows A, add FIRST(B) minus ε before deciding whether $ also belongs.`;
    }

    if (mentionsFollowAndFirst) {
      return `${contextLead}First issue: make the condition explicit. Add FIRST of the suffix after A, excluding ε; FIRST(B) flows into FOLLOW(A) only when B starts that suffix in a production.`;
    }

    return `${contextLead}First issue to check: compare this line with the exact rule used in the previous step. Verify the condition, remove any impossible symbol, then keep only the next correction.`;
  }

  private checkPowerRuleDerivative(text: string, contextLead: string): string | null {
    const compact = text.replace(/\s+/g, "");
    const match = compact.match(/d\/dx\(?x\^(\d+)\)?=([+-]?\d*)x\^(\d+)/);

    if (!match) {
      return null;
    }

    const exponent = Number.parseInt(match[1], 10);
    const coefficientText = match[2];
    const coefficient = coefficientText === "" || coefficientText === "+"
      ? 1
      : coefficientText === "-"
        ? -1
        : Number.parseInt(coefficientText, 10);
    const newExponent = Number.parseInt(match[3], 10);
    const expectedCoefficient = exponent;
    const expectedExponent = exponent - 1;

    if (coefficient === expectedCoefficient && newExponent === expectedExponent) {
      return `${contextLead}This is correct so far. Next, use the result in the larger expression or simplify any remaining terms.`;
    }

    if (newExponent === expectedExponent) {
      return `${contextLead}First issue: with the power rule, multiply by the old exponent. For x^${exponent}, the coefficient should be ${expectedCoefficient}.`;
    }

    if (coefficient === expectedCoefficient) {
      return `${contextLead}First issue: with the power rule, reduce the exponent by 1. For x^${exponent}, the new exponent should be ${expectedExponent}.`;
    }

    return `${contextLead}First issue: apply both parts of the power rule. Multiply by ${expectedCoefficient} and reduce the exponent to ${expectedExponent}.`;
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

  private intentOptionsFor(request: TutorRequest): string[] {
    const text = this.requestText(request);

    if (this.isParsingRequest(request)) {
      return PARSING_INTENT_OPTIONS;
    }

    if (/calculus|integral|derivative|limit|algebra|equation|substitution|matrix|vector|sin|cos|ln|log/.test(text)) {
      return MATH_INTENT_OPTIONS;
    }

    return GENERAL_INTENT_OPTIONS;
  }

  private isParsingRequest(request: TutorRequest): boolean {
    const text = this.requestText(request);
    return /follow|first|grammar|parser|parsing|production|nonterminal|terminal/.test(text);
  }

  private requestText(request: TutorRequest): string {
    return [
      request.regionText,
      request.courseHint ?? "",
      request.nearbyContext ?? "",
      request.selectedIntent ?? ""
    ]
      .join(" ")
      .toLowerCase();
  }
}
