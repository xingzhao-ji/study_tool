import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPairingConfig, isLocalHost } from "./Pairing.js";

describe("pairing security", () => {
  it("does not require a pairing token for localhost", () => {
    assert.equal(isLocalHost("127.0.0.1"), true);
    assert.equal(isLocalHost("localhost"), true);
    assert.equal(createPairingConfig({ host: "127.0.0.1" }).required, false);
  });

  it("requires an explicit or generated token for LAN hosts", () => {
    const explicit = createPairingConfig({ host: "0.0.0.0", envToken: "abc123" });
    const generated = createPairingConfig({ host: "0.0.0.0" });

    assert.equal(explicit.required, true);
    assert.equal(explicit.token, "abc123");
    assert.equal(generated.required, true);
    assert.ok(generated.token);
  });
});
