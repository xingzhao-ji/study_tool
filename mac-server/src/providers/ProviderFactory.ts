import { CodexPrivateLocalProvider } from "./CodexPrivateLocalProvider.js";
import { MockTutorProvider } from "./MockTutorProvider.js";
import type { TutorProvider, TutorProviderName } from "./TutorProvider.js";

export interface ProviderFactoryOptions {
  providerName?: string | null;
  codexTimeoutMs?: number | string | null;
}

export interface TutorProviderDescriptor {
  name: TutorProviderName;
  status: "available" | "not_implemented";
  description: string;
}

export const TUTOR_PROVIDER_DESCRIPTORS: TutorProviderDescriptor[] = [
  {
    name: "mock",
    status: "available",
    description: "Rule-based local mock tutor for Milestones 0-3."
  },
  {
    name: "codex_private_local",
    status: "available",
    description: "Opt-in local Codex CLI provider. No auth-file inspection or private config reads."
  }
];

export function resolveProviderName(providerName: string | null | undefined): TutorProviderName {
  const normalized = providerName?.trim();

  if (!normalized) {
    return "mock";
  }

  if (normalized === "mock" || normalized === "codex_private_local") {
    return normalized;
  }

  throw new Error(`Unsupported tutor provider "${providerName}"`);
}

export function createTutorProvider(options: ProviderFactoryOptions = {}): TutorProvider {
  const providerName = resolveProviderName(options.providerName);

  if (providerName === "codex_private_local") {
    return new CodexPrivateLocalProvider({
      timeoutMs: resolveCodexTimeoutMs(options.codexTimeoutMs)
    });
  }

  return new MockTutorProvider();
}

export function resolveCodexTimeoutMs(timeoutMs: number | string | null | undefined): number {
  if (timeoutMs === null || timeoutMs === undefined || timeoutMs === "") {
    return 45_000;
  }

  const parsed = typeof timeoutMs === "number" ? timeoutMs : Number.parseInt(timeoutMs, 10);

  if (!Number.isFinite(parsed) || parsed < 1_000) {
    throw new Error(`Invalid CODEX_TIMEOUT_MS "${timeoutMs}". Use a number >= 1000.`);
  }

  return parsed;
}
