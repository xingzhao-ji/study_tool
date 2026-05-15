import { randomUUID } from "node:crypto";
import type { TutorRequest, TutorResponse, TutorTurn } from "../types/tutor.js";

export interface DetectedQuestion {
  id: string;
  regionText: string;
  marker: string;
  selectedIntent?: string | null;
  courseHint?: string;
  nearbyContext?: string;
  courseId?: string;
  useCourseGrounding?: boolean;
  confidence: number;
  createdAt: string;
}

export interface TutorSessionTurn extends TutorTurn {
  id: string;
  detectedQuestionId: string;
  courseHint?: string;
  nearbyContext?: string;
  provider: TutorResponse["provider"];
  type: TutorResponse["type"];
  options?: string[];
  confidence?: number;
  courseId?: string;
  useCourseGrounding?: boolean;
  sources?: TutorResponse["sources"];
  grounded?: TutorResponse["grounded"];
  groundingStatus?: TutorResponse["groundingStatus"];
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
  courseId?: string;
  useCourseGrounding?: boolean;
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
      courseId: input.courseId,
      useCourseGrounding: input.useCourseGrounding,
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
      courseHint: detectedQuestion.courseHint,
      nearbyContext: detectedQuestion.nearbyContext,
      courseId: detectedQuestion.courseId,
      useCourseGrounding: detectedQuestion.useCourseGrounding,
      provider: tutorResponse.provider,
      answer: tutorResponse.answer,
      type: tutorResponse.type,
      options: tutorResponse.options,
      confidence: tutorResponse.confidence,
      sources: tutorResponse.sources,
      grounded: tutorResponse.grounded,
      groundingStatus: tutorResponse.groundingStatus,
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
      answer: turn.answer,
      courseId: turn.courseId,
      useCourseGrounding: turn.useCourseGrounding,
      sources: turn.sources,
      grounded: turn.grounded,
      groundingStatus: turn.groundingStatus
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

  undoLatest(): TutorSession {
    const latestDetectionId = this.session.latest?.detectedQuestion.id ?? this.session.detections.at(-1)?.id;

    if (!latestDetectionId) {
      return this.session;
    }

    this.session = {
      ...this.session,
      detections: this.session.detections.filter((detection) => detection.id !== latestDetectionId),
      turns: this.session.turns.filter((turn) => turn.detectedQuestionId !== latestDetectionId),
      latest: null
    };
    this.session.latest = this.latestFromLastTurn();
    return this.session;
  }

  private latestFromLastTurn(): TutorSessionLatest | null {
    const turn = this.session.turns.at(-1);

    if (!turn) {
      return null;
    }

    const detectedQuestion = this.session.detections.find((detection) => detection.id === turn.detectedQuestionId);

    if (!detectedQuestion) {
      return null;
    }

    return {
      detectedQuestion,
      tutorResponse: {
        type: "tutor_answer",
        answer: turn.answer,
        options: turn.options,
        confidence: turn.confidence,
        provider: turn.provider,
        sources: turn.sources,
        grounded: turn.grounded,
        groundingStatus: turn.groundingStatus
      }
    };
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
    courseId: detectedQuestion.courseId,
    useCourseGrounding: detectedQuestion.useCourseGrounding,
    previousTutorState
  };
}
