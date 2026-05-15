import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTutorProvider, resolveProviderName } from "./ProviderFactory.js";

describe("ProviderFactory", () => {
  it("defaults to the mock provider", () => {
    assert.equal(resolveProviderName(undefined), "mock");
    assert.equal(resolveProviderName(""), "mock");
    assert.equal(createTutorProvider({ providerName: undefined }).name, "mock");
  });

  it("creates the codex_private_local placeholder without reading private config", () => {
    const provider = createTutorProvider({ providerName: "codex_private_local" });

    assert.equal(provider.name, "codex_private_local");
  });

  it("rejects unknown provider names", () => {
    assert.throws(
      () => resolveProviderName("remote_llm"),
      /Unsupported tutor provider "remote_llm"/
    );
  });
});
