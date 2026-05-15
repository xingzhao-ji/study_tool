export type TutorProviderName = "mock" | "codex_private_local";

export interface TutorTurn {
  regionText: string;
  marker: string;
  selectedIntent?: string | null;
  answer?: string;
}

export interface TutorRequest {
  regionText: string;
  marker: string;
  selectedIntent?: string | null;
  courseHint?: string;
  nearbyContext?: string;
  previousTutorState?: TutorTurn[];
  imagePath?: string;
}

export interface TutorResponse {
  type: "intent_options" | "tutor_answer" | "error";
  options?: string[];
  answer?: string;
  confidence?: number;
  provider: TutorProviderName;
  raw?: unknown;
}
