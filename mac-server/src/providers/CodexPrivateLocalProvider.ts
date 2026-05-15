import type { TutorProvider, TutorRequest, TutorResponse } from "./TutorProvider.js";

export class CodexPrivateLocalProvider implements TutorProvider {
  readonly name = "codex_private_local" as const;

  async ask(_request: TutorRequest): Promise<TutorResponse> {
    return {
      type: "error",
      answer: "CodexPrivateLocalProvider is not implemented in Milestones 0-1. It does not access Codex auth, local config, or private files.",
      provider: this.name
    };
  }
}
