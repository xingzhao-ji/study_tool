import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CodexPrivateLocalProvider } from "./CodexPrivateLocalProvider.js";

describe("CodexPrivateLocalProvider", () => {
  it("returns an explicit not-implemented response with generated prompts only", async () => {
    const provider = new CodexPrivateLocalProvider();

    const response = await provider.ask({
      regionText: "FOLLOW(A) includes FIRST(B)",
      marker: "check?",
      courseHint: "CS 132 parsing"
    });

    assert.equal(response.type, "error");
    assert.equal(response.provider, "codex_private_local");
    assert.match(response.answer ?? "", /not implemented/i);
    assert.deepEqual(Object.keys(response.raw as Record<string, unknown>).sort(), [
      "checkPrompt",
      "intentPrompt",
      "privacy",
      "tutorPrompt"
    ]);
    assert.match(
      String((response.raw as { privacy: string }).privacy),
      /No shellout, auth lookup, filesystem inspection, or external provider call was performed/
    );
  });
});
