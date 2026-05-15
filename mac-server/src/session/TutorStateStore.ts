import { randomUUID } from "node:crypto";
import type { TutorRequest, TutorResponse, TutorTurn } from "../types/tutor.js";

export interface DetectedQuestion {
  id: string;
  regionText: string;
  marker: string;
  selectedIntent?: string | null;
  courseHint?: string;
  nearbyContext?: string;
  confidence: number;
  createdAt: string;
}

export interface TutorSessionTurn extends TutorTurn {
  id: string;
  detectedQuestionId: string;
  type: TutorResponse["type"];
  options?: string[];
  confidence?: number;
  createdAt: string;
}

export interface TutorSessionLatest {
  detectedQuestion: DetectedQuestion;
  tutorResponse: TutorResponse;
}

export interface TutorSession {
  id: string;
  detections: DetectedQuestion[];
  turns: TutorSessionTurn[];
  latest: TutorSessionLatest | null;
}

export interface DetectionInput {
  regionText: string;
  marker: string;
  courseHint?: string;
  nearbyContext?: string;
  confidence?: number;
}

export class InMemoryTutorStateStore {
  private session: TutorSession;

  constructor(sessionId: string = randomUUID()) {
    this.session = {
      id: sessionId,
      detections: [],
      turns: [],
      latest: null
    };
  }

  getSession(): TutorSession {
    return this.session;
  }

  getLatest(): TutorSessionLatest | null {
    return this.session.latest;
  }

  addDetection(input: DetectionInput): DetectedQuestion {
    const detectedQuestion: DetectedQuestion = {
      id: randomUUID(),
      regionText: input.regionText,
      marker: input.marker,
      courseHint: input.courseHint,
      nearbyContext: input.nearbyContext,
      confidence: input.confidence ?? 1,
      createdAt: new Date().toISOString()
    };

    this.session.detections.push(detectedQuestion);
    return detectedQuestion;
  }

  recordResponse(detectedQuestion: DetectedQuestion, tutorResponse: TutorResponse): TutorSessionTurn | null {
    this.session.latest = { detectedQuestion, tutorResponse };

    if (tutorResponse.type !== "tutor_answer") {
      return null;
    }

    const turn: TutorSessionTurn = {
      id: randomUUID(),
      detectedQuestionId: detectedQuestion.id,
      regionText: detectedQuestion.regionText,
      marker: detectedQuestion.marker,
      selectedIntent: detectedQuestion.selectedIntent,
      answer: tutorResponse.answer,
      type: tutorResponse.type,
      options: tutorResponse.options,
      confidence: tutorResponse.confidence,
      createdAt: new Date().toISOString()
    };

    this.session.turns.push(turn);
    return turn;
  }

  applySelectedIntent(detectedQuestionId: string, selectedIntent: string): DetectedQuestion | null {
    const detectedQuestion = this.session.detections.find((candidate) => candidate.id === detectedQuestionId);

    if (!detectedQuestion) {
      return null;
    }

    detectedQuestion.selectedIntent = selectedIntent;
    return detectedQuestion;
  }

  latestDetection(): DetectedQuestion | null {
    return this.session.detections.at(-1) ?? null;
  }

  previousTutorState(): TutorTurn[] {
    return this.session.turns.map((turn) => ({
      regionText: turn.regionText,
      marker: turn.marker,
      selectedIntent: turn.selectedIntent,
      answer: turn.answer
    }));
  }

  clear(): TutorSession {
    this.session = {
      ...this.session,
      detections: [],
      turns: [],
      latest: null
    };
    return this.session;
  }
}

export function requestFromDetection(
  detectedQuestion: DetectedQuestion,
  previousTutorState: TutorTurn[]
): TutorRequest {
  return {
    regionText: detectedQuestion.regionText,
    marker: detectedQuestion.marker,
    selectedIntent: detectedQuestion.selectedIntent,
    courseHint: detectedQuestion.courseHint,
    nearbyContext: detectedQuestion.nearbyContext,
    previousTutorState
  };
}
