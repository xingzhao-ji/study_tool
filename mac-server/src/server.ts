import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import type { TutorProvider } from "./providers/TutorProvider.js";
import { TUTOR_PROVIDER_DESCRIPTORS } from "./providers/ProviderFactory.js";
import {
  InMemoryTutorStateStore,
  requestFromDetection,
  type DetectionInput
} from "./session/TutorStateStore.js";
import type { PairingConfig } from "./security/Pairing.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, "../public");

const askSchema = z.object({
  regionText: z.string().min(1),
  marker: z.string().min(1),
  selectedIntent: z.string().min(1).nullable().optional(),
  courseHint: z.string().optional(),
  nearbyContext: z.string().optional(),
  previousTutorState: z
    .array(
      z.object({
        regionText: z.string(),
        marker: z.string(),
        selectedIntent: z.string().nullable().optional(),
        answer: z.string().optional()
      })
    )
    .optional(),
  imagePath: z.string().optional()
});

const detectionSchema = z.object({
  regionText: z.string().min(1),
  marker: z.string().min(1),
  courseHint: z.string().optional(),
  nearbyContext: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

const selectIntentSchema = z.object({
  questionId: z.string().optional(),
  selectedIntent: z.string().min(1)
});

export interface ServerOptions {
  pairing?: PairingConfig;
}

export function createApp(
  provider: TutorProvider,
  stateStore = new InMemoryTutorStateStore(),
  options: ServerOptions = {}
): Express {
  const app = express();

  app.use(express.static(publicDir));
  app.use(express.json({ limit: "1mb" }));

  app.get("/pairing", (_request: Request, response: Response) => {
    response.json({
      required: options.pairing?.required ?? false
    });
  });

  app.use((request: Request, response: Response, next) => {
    const pairing = options.pairing;

    if (!pairing?.required) {
      next();
      return;
    }

    const token = request.header("x-pairing-token");

    if (token && token === pairing.token) {
      next();
      return;
    }

    response.status(401).json({
      type: "error",
      answer: "Pairing token required for LAN access.",
      provider: provider.name
    });
  });

  app.get("/health", (_request: Request, response: Response) => {
    response.json({
      ok: true,
      service: "goodnotes-companion-tutor",
      provider: provider.name
    });
  });

  app.get("/providers", (_request: Request, response: Response) => {
    response.json({
      activeProvider: provider.name,
      providers: TUTOR_PROVIDER_DESCRIPTORS
    });
  });

  app.post("/ask", async (request: Request, response: Response) => {
    const parsed = askSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: "Invalid tutor request body.",
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    try {
      const tutorResponse = await provider.ask(parsed.data);
      response.json(tutorResponse);
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Tutor provider failed while handling the request.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.post("/simulate-detection", async (request: Request, response: Response) => {
    const parsed = detectionSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: "Invalid detection request body.",
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    try {
      const detectedQuestion = stateStore.addDetection(parsed.data as DetectionInput);
      const previousTutorState = stateStore.previousTutorState();
      const tutorResponse = await provider.ask(
        requestFromDetection(detectedQuestion, previousTutorState)
      );
      stateStore.recordResponse(detectedQuestion, tutorResponse);
      response.json({
        sessionId: stateStore.getSession().id,
        detectedQuestion,
        tutorResponse
      });
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Tutor provider failed while handling the simulated detection.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.post("/select-intent", async (request: Request, response: Response) => {
    const parsed = selectIntentSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        type: "error",
        answer: "Invalid intent selection body.",
        provider: provider.name,
        raw: parsed.error.format()
      });
      return;
    }

    const questionId = parsed.data.questionId ?? stateStore.latestDetection()?.id;

    if (!questionId) {
      response.status(404).json({
        type: "error",
        answer: "No detected question is available for intent selection.",
        provider: provider.name
      });
      return;
    }

    const detectedQuestion = stateStore.applySelectedIntent(questionId, parsed.data.selectedIntent);

    if (!detectedQuestion) {
      response.status(404).json({
        type: "error",
        answer: `Detected question "${questionId}" was not found.`,
        provider: provider.name
      });
      return;
    }

    try {
      const tutorResponse = await provider.ask(
        requestFromDetection(detectedQuestion, stateStore.previousTutorState())
      );
      stateStore.recordResponse(detectedQuestion, tutorResponse);
      response.json({
        sessionId: stateStore.getSession().id,
        detectedQuestion,
        tutorResponse
      });
    } catch (error) {
      response.status(500).json({
        type: "error",
        answer: "Tutor provider failed while handling the selected intent.",
        provider: provider.name,
        raw: error instanceof Error ? error.message : error
      });
    }
  });

  app.get("/latest", (_request: Request, response: Response) => {
    response.json({
      sessionId: stateStore.getSession().id,
      latest: stateStore.getLatest()
    });
  });

  app.get("/session", (_request: Request, response: Response) => {
    response.json(stateStore.getSession());
  });

  app.post("/clear-session", (_request: Request, response: Response) => {
    response.json({
      session: stateStore.clear()
    });
  });

  return app;
}
