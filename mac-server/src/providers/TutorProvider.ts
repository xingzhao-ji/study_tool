import type { TutorProviderName, TutorRequest, TutorResponse } from "../types/tutor.js";

export type { TutorProviderName, TutorRequest, TutorResponse, TutorTurn } from "../types/tutor.js";

export interface TutorProvider {
  name: TutorProviderName;
  ask(request: TutorRequest): Promise<TutorResponse>;
}
