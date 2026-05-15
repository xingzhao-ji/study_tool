export type TutorProviderName = "mock" | "codex_private_local";

import type { RetrievedChunk } from "../rag/types.js";

export type GroundingStatus =
  | "used_course_context"
  | "no_relevant_context"
  | "course_not_found"
  | "disabled";

export interface TutorSourceReference {
  fileId: string;
  sourceLabel: string;
  chunkId: string;
  pageNumber?: number;
}

export interface TutorTurn {
  regionText: string;
  marker: string;
  selectedIntent?: string | null;
  answer?: string;
  courseId?: string;
  useCourseGrounding?: boolean;
  sources?: TutorSourceReference[];
  grounded?: boolean;
  groundingStatus?: GroundingStatus;
}

export interface TutorRequest {
  regionText: string;
  marker: string;
  selectedIntent?: string | null;
  courseHint?: string;
  nearbyContext?: string;
  previousTutorState?: TutorTurn[];
  imagePath?: string;
  courseId?: string;
  useCourseGrounding?: boolean;
  retrievedContext?: RetrievedChunk[];
}

export interface TutorResponse {
  type: "intent_options" | "tutor_answer" | "error";
  options?: string[];
  answer?: string;
  confidence?: number;
  provider: TutorProviderName;
  raw?: unknown;
  sources?: TutorSourceReference[];
  grounded?: boolean;
  groundingStatus?: GroundingStatus;
}
