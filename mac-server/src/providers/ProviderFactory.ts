import { CodexPrivateLocalProvider } from "./CodexPrivateLocalProvider.js";
import { MockTutorProvider } from "./MockTutorProvider.js";
import type { TutorProvider, TutorProviderName } from "./TutorProvider.js";

export interface ProviderFactoryOptions {
  providerName?: string | null;
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
    description: "Rule-based local mock tutor for Milestones 0-2."
  },
  {
    name: "codex_private_local",
    status: "not_implemented",
    description: "Design placeholder only. No Codex auth, shellout, or private file access."
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
    return new CodexPrivateLocalProvider();
  }

  return new MockTutorProvider();
}
