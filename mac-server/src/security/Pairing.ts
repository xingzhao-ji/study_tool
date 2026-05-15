import { randomBytes } from "node:crypto";

export interface PairingConfigInput {
  host: string;
  envToken?: string;
}

export interface PairingConfig {
  required: boolean;
  token?: string;
  generated: boolean;
}

export function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function createPairingConfig(input: PairingConfigInput): PairingConfig {
  if (isLocalHost(input.host)) {
    return {
      required: false,
      generated: false
    };
  }

  const token = input.envToken?.trim() || randomBytes(6).toString("hex");

  return {
    required: true,
    token,
    generated: !input.envToken?.trim()
  };
}
