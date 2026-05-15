import type { TutorProvider, TutorRequest, TutorResponse } from "./TutorProvider.js";
import { buildCheckPrompt, buildIntentPrompt, buildTutorPrompt } from "../tutor/PromptBuilder.js";

export class CodexPrivateLocalProvider implements TutorProvider {
  readonly name = "codex_private_local" as const;

  async ask(request: TutorRequest): Promise<TutorResponse> {
    return {
      type: "error",
      answer: "CodexPrivateLocalProvider is a Milestone 2 integration boundary only and is not implemented yet.",
      provider: this.name,
      raw: {
        intentPrompt: buildIntentPrompt(request),
        tutorPrompt: buildTutorPrompt(request),
        checkPrompt: buildCheckPrompt(request),
        privacy: "No shellout, auth lookup, filesystem inspection, or external provider call was performed."
      }
    };
  }
}
