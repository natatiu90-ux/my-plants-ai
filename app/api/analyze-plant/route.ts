import OpenAI from "openai";
import { NextResponse } from "next/server";
import convertHeic from "heic-convert";
import sharp from "sharp";
import { selectSpeciesCareProfile, speciesProfilesPromptContext, speciesTraitsForAnalysis } from "@/lib/species-profiles";
import { RECOMMENDATION_PROMPT_VERSION } from "@/lib/recommendation-version";

export const runtime = "nodejs";

const maxPhotos = 5;
const maxPhotoSize = 10 * 1024 * 1024;
const optimizedImageMaxSide = 1200;
const optimizedJpegQuality = 82;
const targetOptimizedBytes = 600 * 1024;
const openAIRequestTimeoutMs = 90_000;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const allowedExtensions = new Set(["jpg", "jpeg", "png", "heic", "heif"]);
const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

type ImageDiagnostic = {
  debugId: string | null;
  source: string;
  fileName: string;
  mimeType: string;
  extension: string | null;
  byteSize: number;
  decodedWidth: number | null;
  decodedHeight: number | null;
  exifOrientation: number | null;
  normalizedWidth: number | null;
  normalizedHeight: number | null;
  decodingSucceeded: boolean;
  conversionSucceeded: boolean;
  conversionStatus: "pending" | "converted" | "image_conversion_failed" | "invalid_output";
  detectedFormat: string;
  finalMimeType: string | null;
  finalByteSize: number | null;
  includedInOpenAIRequest: boolean;
  errorCode?: string;
  errorMessage?: string;
  client?: {
    mimeType: string;
    extension: string | null;
    byteSize: number | null;
    decodingSucceeded: boolean | null;
    width: number | null;
    height: number | null;
    exifOrientation: number | null;
    physicallyRotated: boolean | null;
    orientationSource: string | null;
  };
};

type AnalyzeTraceEvent = {
  stage: string;
  at: string;
  data?: Record<string, unknown>;
};

type AnalysisHypothesisPayload = {
  type?: string;
  confidence?: number;
  canUserAnswerChangeRecommendation?: boolean;
  clarificationQuestion?: unknown;
};

type AnalysisPayload = {
  detectedSpecies?: unknown;
  commonName?: unknown;
  scientificName?: unknown;
  condition?: unknown;
  recommendations?: { type?: string; priority?: string; en?: string; ru?: string }[];
  careRightNow?: { type?: string; priority?: string; action?: { en?: string; ru?: string }; reason?: { en?: string; ru?: string } }[];
  aboutSpecies?: { bullets?: unknown } | null;
  clarificationQuestions?: { hypothesis?: string }[];
  alternativeCauses?: unknown[];
  hypotheses?: AnalysisHypothesisPayload[];
  speciesReasoning?: unknown;
  recommendationImpact?: {
    impactLevel?: "none" | "minor" | "moderate" | "major";
    changeSummary?: { en?: string | null; ru?: string | null };
  };
};

const localizedStringSchema = {
  type: "object",
  additionalProperties: false,
  properties: { en: { type: "string" }, ru: { type: "string" } },
  required: ["en", "ru"]
} as const;

const localizedNullableStringSchema = {
  type: "object",
  additionalProperties: false,
  properties: { en: { type: ["string", "null"] }, ru: { type: ["string", "null"] } },
  required: ["en", "ru"]
} as const;

function traceEvent(trace: AnalyzeTraceEvent[], stage: string, data?: Record<string, unknown>) {
  const event = { stage, at: new Date().toISOString(), ...(data ? { data } : {}) };
  trace.push(event);
  console.info("analyze_plant_trace", event);
}

function sanitizeError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: "Unknown error",
      stack: null,
      code: null,
      status: null,
      type: null
    };
  }

  const errorLike = error as Error & { code?: unknown; status?: unknown; type?: unknown; response?: { status?: unknown } };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack ?? null,
    code: typeof errorLike.code === "string" || typeof errorLike.code === "number" ? errorLike.code : null,
    status:
      typeof errorLike.status === "string" || typeof errorLike.status === "number"
        ? errorLike.status
        : typeof errorLike.response?.status === "string" || typeof errorLike.response?.status === "number"
          ? errorLike.response.status
          : null,
    type: typeof errorLike.type === "string" ? errorLike.type : null
  };
}

const schema = {
  name: "plant_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      detectedSpecies: { type: ["string", "null"] },
      commonName: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: { en: { type: ["string", "null"] }, ru: { type: ["string", "null"] } },
        required: ["en", "ru"]
      },
      scientificName: { type: ["string", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      condition: { type: "string", enum: ["healthy", "check_soon", "needs_attention", "unknown"] },
      statusLabel: {
        type: "object",
        additionalProperties: false,
        properties: { en: { type: "string" }, ru: { type: "string" } },
        required: ["en", "ru"]
      },
      summary: {
        type: "object",
        additionalProperties: false,
        properties: { en: { type: "string" }, ru: { type: "string" } },
        required: ["en", "ru"]
      },
      visibleObservations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { en: { type: "string" }, ru: { type: "string" } },
          required: ["en", "ru"]
        }
      },
      nextAction: { type: "string", enum: ["water", "check_soil", "take_photo", "none"] },
      nextCheckInDays: { type: ["number", "null"], minimum: 0, maximum: 30 },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["watering", "light", "location", "humidity", "repotting", "monitoring", "other"] },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            en: { type: "string" },
            ru: { type: "string" }
          },
          required: ["type", "priority", "en", "ru"]
        }
      },
      careRightNow: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["watering", "light", "location", "humidity", "repotting", "monitoring", "inspection", "none", "other"] },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            action: localizedStringSchema,
            reason: localizedStringSchema
          },
          required: ["type", "priority", "action", "reason"]
        }
      },
      aboutSpecies: {
        type: "object",
        additionalProperties: false,
        properties: {
          profileId: { type: ["string", "null"] },
          displayName: { type: ["string", "null"] },
          preferredLight: localizedStringSchema,
          wateringPattern: localizedStringSchema,
          humidity: localizedStringSchema,
          temperature: localizedStringSchema,
          growthBehavior: localizedStringSchema,
          commonMistakes: { type: "array", maxItems: 3, items: localizedStringSchema },
          normalBehaviors: { type: "array", maxItems: 3, items: localizedStringSchema },
          warningSigns: { type: "array", maxItems: 3, items: localizedStringSchema },
          beginnerTips: { type: "array", maxItems: 3, items: localizedStringSchema },
          bullets: { type: "array", maxItems: 6, items: localizedStringSchema }
        },
        required: [
          "profileId",
          "displayName",
          "preferredLight",
          "wateringPattern",
          "humidity",
          "temperature",
          "growthBehavior",
          "commonMistakes",
          "normalBehaviors",
          "warningSigns",
          "beginnerTips",
          "bullets"
        ]
      },
      clarificationQuestions: {
        type: "array",
        maxItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            hypothesis: { type: "string", enum: ["soil_condition", "repotting", "root_condition", "drainage", "direct_sun", "pests"] },
            question: localizedNullableStringSchema,
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: localizedNullableStringSchema,
                  status: { type: "string", enum: ["confirmed", "ruled_out", "unknown"] },
                  result: { type: "string" }
                },
                required: ["label", "status", "result"]
              }
            },
            reasonForAsking: localizedNullableStringSchema,
            expectedImpact: localizedStringSchema
          },
          required: ["hypothesis", "question", "options", "reasonForAsking", "expectedImpact"]
        }
      },
      reasoning: {
        type: "object",
        additionalProperties: false,
        properties: {
          currentSituation: localizedStringSchema,
          speciesTraitsApplied: { type: "array", maxItems: 4, items: localizedStringSchema },
          diagnosisLogic: localizedStringSchema,
          whyThisMatters: localizedStringSchema
        },
        required: ["currentSituation", "speciesTraitsApplied", "diagnosisLogic", "whyThisMatters"]
      },
      recommendationImpact: {
        type: "object",
        additionalProperties: false,
        properties: {
          impactLevel: { type: "string", enum: ["none", "minor", "moderate", "major"] },
          changeSummary: localizedNullableStringSchema
        },
        required: ["impactLevel", "changeSummary"]
      },
      alternativeCauses: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            hypothesis: { type: ["string", "null"], enum: ["soil_condition", "repotting", "root_condition", "drainage", "direct_sun", "pests", null] },
            confidence: { type: "string", enum: ["low", "medium"] },
            explanation: localizedStringSchema,
            whyLowerPriority: localizedStringSchema
          },
          required: ["hypothesis", "confidence", "explanation", "whyLowerPriority"]
        }
      },
      hypotheses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["soil_condition", "repotting", "root_condition", "drainage", "direct_sun", "pests"] },
            status: { type: "string", enum: ["supported", "possible", "unlikely", "resolved"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            evidence: { type: "array", items: { type: "string" } },
            missingEvidence: { type: "array", items: { type: "string" } },
            canUserAnswerChangeRecommendation: { type: "boolean" },
            clarificationQuestion: {
              type: ["object", "null"],
              additionalProperties: false,
              properties: {
                question: {
                  type: "object",
                  additionalProperties: false,
                  properties: { en: { type: ["string", "null"] }, ru: { type: ["string", "null"] } },
                  required: ["en", "ru"]
                },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      label: {
                        type: "object",
                        additionalProperties: false,
                        properties: { en: { type: ["string", "null"] }, ru: { type: ["string", "null"] } },
                        required: ["en", "ru"]
                      },
                      status: { type: "string", enum: ["confirmed", "ruled_out", "unknown"] },
                      result: { type: "string" }
                    },
                    required: ["label", "status", "result"]
                  }
                },
                reasonForAsking: {
                  type: "object",
                  additionalProperties: false,
                  properties: { en: { type: ["string", "null"] }, ru: { type: ["string", "null"] } },
                  required: ["en", "ru"]
                }
              },
              required: ["question", "options", "reasonForAsking"]
            }
          },
          required: ["type", "status", "confidence", "evidence", "missingEvidence", "canUserAnswerChangeRecommendation", "clarificationQuestion"]
        }
      },
      uncertainties: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { en: { type: "string" }, ru: { type: "string" } },
          required: ["en", "ru"]
        }
      }
    },
    required: [
      "detectedSpecies",
      "commonName",
      "scientificName",
      "confidence",
      "condition",
      "statusLabel",
      "summary",
      "visibleObservations",
      "nextAction",
      "nextCheckInDays",
      "recommendations",
      "careRightNow",
      "aboutSpecies",
      "clarificationQuestions",
      "reasoning",
      "recommendationImpact",
      "alternativeCauses",
      "hypotheses",
      "uncertainties"
    ]
  },
  strict: true
};

async function optimizeImageForAnalysis(file: File) {
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const isHeicLike = file.type === "image/heic" || file.type === "image/heif" || extensionFromName(file.name) === "heic" || extensionFromName(file.name) === "heif";
  let sharpInput = inputBuffer;

  try {
    await sharp(sharpInput, { failOn: "none" }).metadata();
  } catch (error) {
    if (!isHeicLike) {
      throw error;
    }

    const convertedBuffer = await convertHeic({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 0.92
    });
    sharpInput = Buffer.from(convertedBuffer);
  }

  const inputMetadata = await sharp(sharpInput, { failOn: "none" }).metadata();
  if (
    inputMetadata.format === "jpeg" &&
    (!inputMetadata.orientation || inputMetadata.orientation === 1) &&
    inputBuffer.byteLength <= targetOptimizedBytes &&
    Math.max(inputMetadata.width ?? 0, inputMetadata.height ?? 0) <= optimizedImageMaxSide
  ) {
    return {
      dataUrl: `data:image/jpeg;base64,${inputBuffer.toString("base64")}`,
      originalBytes: file.size,
      optimizedBytes: inputBuffer.byteLength,
      inputWidth: inputMetadata.width ?? null,
      inputHeight: inputMetadata.height ?? null,
      exifOrientation: inputMetadata.orientation ?? null,
      normalizedWidth: inputMetadata.width ?? null,
      normalizedHeight: inputMetadata.height ?? null,
      finalMimeType: "image/jpeg"
    };
  }

  const candidates = [
    { maxSide: optimizedImageMaxSide, quality: optimizedJpegQuality },
    { maxSide: optimizedImageMaxSide, quality: 80 },
    { maxSide: 1000, quality: 80 }
  ];
  let optimizedBuffer: Buffer | null = null;

  for (const candidate of candidates) {
    optimizedBuffer = await sharp(sharpInput, { failOn: "none" })
      .rotate()
      .resize({
        width: candidate.maxSide,
        height: candidate.maxSide,
        fit: "inside",
        withoutEnlargement: true
      })
      .flatten({ background: "#ffffff" })
      .jpeg({
        quality: candidate.quality,
        mozjpeg: true
      })
      .toBuffer();

    if (optimizedBuffer.byteLength <= targetOptimizedBytes) {
      break;
    }
  }

  const outputMetadata = await sharp(optimizedBuffer!, { failOn: "none" }).metadata();
  if (outputMetadata.format !== "jpeg") {
    throw new Error("invalid_output");
  }

  return {
    dataUrl: `data:image/jpeg;base64,${optimizedBuffer!.toString("base64")}`,
    originalBytes: file.size,
    optimizedBytes: optimizedBuffer!.byteLength,
    inputWidth: inputMetadata.width ?? null,
    inputHeight: inputMetadata.height ?? null,
    exifOrientation: inputMetadata.orientation ?? null,
    normalizedWidth: outputMetadata.width ?? null,
    normalizedHeight: outputMetadata.height ?? null,
    finalMimeType: "image/jpeg"
  };
}

function extensionFromName(fileName: string) {
  return fileName.includes(".") ? fileName.split(".").pop()?.toLocaleLowerCase() ?? null : null;
}

function detectedFormat(file: File) {
  const extension = extensionFromName(file.name);
  if (file.type) {
    return file.type.replace("image/", "").toLocaleLowerCase();
  }
  return extension ?? "unknown";
}

function diagnosticResponse(message: string, status = 400, diagnostics?: ImageDiagnostic[], stage?: string, trace?: AnalyzeTraceEvent[], originalError?: ReturnType<typeof sanitizeError>) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(stage ? { stage } : {}),
      ...(trace ? { trace } : {}),
      ...(originalError ? { originalError } : {}),
      ...(process.env.NODE_ENV !== "production" && diagnostics ? { diagnostics } : {})
    },
    { status }
  );
}

function hasClarificationQuestion(hypothesis: AnalysisHypothesisPayload) {
  return Boolean(hypothesis.clarificationQuestion && typeof hypothesis.clarificationQuestion === "object");
}

function applySpeciesAwareQuestionLimits(analysis: AnalysisPayload) {
  const profile = selectSpeciesCareProfile({
    detectedSpecies: analysis.detectedSpecies,
    scientificName: analysis.scientificName,
    commonName: analysis.commonName
  });
  const selectedQuestions: string[] = [];
  const removedQuestions: string[] = [];
  const healthyAnalysis = analysis.condition === "healthy";

  if (Array.isArray(analysis.hypotheses)) {
    let keptQuestions = 0;

    for (const hypothesis of analysis.hypotheses) {
      if (!hasClarificationQuestion(hypothesis)) {
        continue;
      }

      const confidence = typeof hypothesis.confidence === "number" ? hypothesis.confidence : 0;
      const canChangeCare = hypothesis.canUserAnswerChangeRecommendation === true;
      const canAsk =
        canChangeCare &&
        keptQuestions < 2 &&
        confidence >= 0.45 &&
        (!healthyAnalysis || confidence >= 0.75);

      if (canAsk) {
        keptQuestions += 1;
        selectedQuestions.push(String(hypothesis.type ?? "unknown"));
      } else {
        removedQuestions.push(String(hypothesis.type ?? "unknown"));
        hypothesis.clarificationQuestion = null;
        hypothesis.canUserAnswerChangeRecommendation = false;
      }
    }
  }

  if (Array.isArray(analysis.careRightNow)) {
    analysis.careRightNow = analysis.careRightNow.slice(0, 3);
    analysis.recommendations = analysis.careRightNow.map((item) => ({
      type: item.type,
      priority: item.priority,
      en: item.action?.en,
      ru: item.action?.ru
    }));
  }

  if (analysis.aboutSpecies && Array.isArray(analysis.aboutSpecies.bullets)) {
    analysis.aboutSpecies.bullets = analysis.aboutSpecies.bullets.slice(0, 6);
  }

  if (Array.isArray(analysis.clarificationQuestions)) {
    const selectedQuestionTypes = new Set(selectedQuestions);
    analysis.clarificationQuestions = analysis.clarificationQuestions.filter((question) => selectedQuestionTypes.has(String(question.hypothesis))).slice(0, 2);
  }

  if (Array.isArray(analysis.alternativeCauses)) {
    analysis.alternativeCauses = analysis.alternativeCauses.slice(0, 3);
  }

  analysis.speciesReasoning = {
    profileId: profile?.id ?? "general_houseplant",
    displayName: profile?.displayName ?? null,
    traitsApplied: speciesTraitsForAnalysis(profile),
    questionSelection: {
      maxQuestions: 2,
      selectedQuestions,
      removedQuestions,
      rule: "Questions must be species-relevant and able to change recommendation, urgency, action, or next check date."
    }
  };

  return analysis;
}

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function parseBoolean(value: FormDataEntryValue | null) {
  if (value !== "true" && value !== "false") {
    return null;
  }
  return value === "true";
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const trace: AnalyzeTraceEvent[] = [];
  traceEvent(trace, "request_received", {
    method: request.method,
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length")
  });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const message = process.env.NODE_ENV === "development" ? "OPENAI_API_KEY is not configured." : "Plant analysis is unavailable.";
    traceEvent(trace, "missing_openai_api_key");
    return diagnosticResponse(message, 503, undefined, "configure_openai", trace);
  }

  let failureStage = "read_form_data";
  const formData = await request.formData();
  traceEvent(trace, "form_data_read");
  const files = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const locale = String(formData.get("locale") ?? "en");
  const currentCommonName = String(formData.get("currentCommonName") ?? "");
  const currentScientificName = String(formData.get("currentScientificName") ?? "");
  const currentDetectedSpecies = String(formData.get("currentDetectedSpecies") ?? "");
  const currentLightCondition = String(formData.get("currentLightCondition") ?? "");
  const environmentContext = String(formData.get("environmentContext") ?? "");
  const analysisMode = String(formData.get("analysisMode") ?? "initial_or_photo_analysis");
  const previousAnalysis = String(formData.get("previousAnalysis") ?? "");
  const photoTypes = formData.getAll("photoTypes").map(String);
  const photoSources = formData.getAll("photoSources").map(String);
  const clientFileNames = formData.getAll("clientFileNames").map(String);
  const clientMimeTypes = formData.getAll("clientMimeTypes").map(String);
  const clientExtensions = formData.getAll("clientExtensions").map(String);
  const clientByteSizes = formData.getAll("clientByteSizes");
  const clientDecodeSucceeded = formData.getAll("clientDecodeSucceeded");
  const clientWidths = formData.getAll("clientWidths");
  const clientHeights = formData.getAll("clientHeights");
  const clientExifOrientations = formData.getAll("clientExifOrientations");
  const clientPhysicallyRotated = formData.getAll("clientPhysicallyRotated");
  const clientOrientationSources = formData.getAll("clientOrientationSources").map(String);
  const clientDebugIds = formData.getAll("clientDebugIds").map(String);
  const diagnostics: ImageDiagnostic[] = files.map((file, index) => ({
    debugId: clientDebugIds[index] || null,
    source: photoSources[index] ?? "unknown",
    fileName: file.name || clientFileNames[index] || "unknown",
    mimeType: file.type,
    extension: extensionFromName(file.name || clientFileNames[index] || ""),
    byteSize: file.size,
    decodedWidth: null,
    decodedHeight: null,
    exifOrientation: null,
    normalizedWidth: null,
    normalizedHeight: null,
    decodingSucceeded: false,
    conversionSucceeded: false,
    conversionStatus: "pending",
    detectedFormat: detectedFormat(file),
    finalMimeType: null,
    finalByteSize: null,
    includedInOpenAIRequest: false,
    client: {
      mimeType: clientMimeTypes[index] ?? "",
      extension: clientExtensions[index] || null,
      byteSize: parseNumber(clientByteSizes[index] ?? null),
      decodingSucceeded: parseBoolean(clientDecodeSucceeded[index] ?? null),
      width: parseNumber(clientWidths[index] ?? null),
      height: parseNumber(clientHeights[index] ?? null),
      exifOrientation: parseNumber(clientExifOrientations[index] ?? null),
      physicallyRotated: parseBoolean(clientPhysicallyRotated[index] ?? null),
      orientationSource: clientOrientationSources[index] || null
    }
  }));
  traceEvent(trace, "request_payload_parsed", {
    imageCount: files.length,
    locale,
    analysisMode,
    hasCurrentPlantContext: Boolean(currentCommonName || currentScientificName || currentDetectedSpecies),
    hasEnvironmentContext: Boolean(environmentContext),
    photoTypes,
    photoSources,
    files: diagnostics.map((diagnostic) => ({
      index: diagnostics.indexOf(diagnostic),
      fileName: diagnostic.fileName,
      mimeType: diagnostic.mimeType,
      extension: diagnostic.extension,
      byteSize: diagnostic.byteSize,
      clientByteSize: diagnostic.client?.byteSize,
      clientWidth: diagnostic.client?.width,
      clientHeight: diagnostic.client?.height,
      clientExifOrientation: diagnostic.client?.exifOrientation,
      clientPhysicallyRotated: diagnostic.client?.physicallyRotated
    }))
  });

  if (!files.length) {
    traceEvent(trace, "validate_input_failed", { reason: "no_images" });
    return diagnosticResponse("At least one image is required.", 400, undefined, "validate_input", trace);
  }

  if (files.length > maxPhotos) {
    traceEvent(trace, "validate_input_failed", { reason: "too_many_images", imageCount: files.length });
    return diagnosticResponse(`Use ${maxPhotos} photos or fewer.`, 400, diagnostics, "validate_input", trace);
  }

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const extension = diagnostics[index].extension;
    const hasSupportedType = allowedTypes.has(file.type);
    const hasSupportedExtension = Boolean(extension && allowedExtensions.has(extension));

    if (file.size > maxPhotoSize || (!hasSupportedType && !hasSupportedExtension)) {
      diagnostics[index].errorCode = "unsupported_or_too_large";
      diagnostics[index].errorMessage = "Unsupported image type or image exceeds 10 MB.";
      console.warn("Plant analysis image rejected", diagnostics[index]);
      traceEvent(trace, "validate_input_failed", { reason: "unsupported_or_too_large", index, mimeType: file.type, byteSize: file.size });
      return diagnosticResponse("One or more images are unsupported or too large.", 400, diagnostics, "validate_input", trace);
    }
  }

  const controller = new AbortController();
  let didOpenAITimeOut = false;
  let openAIRequestStartedAt: number | null = null;
  const timeout = setTimeout(() => {
    didOpenAITimeOut = true;
    controller.abort();
  }, openAIRequestTimeoutMs);

  try {
    failureStage = "server_image_optimization";
    traceEvent(trace, "server_image_optimization_started", { imageCount: files.length });
    const client = new OpenAI({ apiKey });
    const optimizedImages = await Promise.all(
      files.map(async (file, index) => {
        try {
          const optimizedImage = await optimizeImageForAnalysis(file);
          diagnostics[index].decodedWidth = optimizedImage.inputWidth;
          diagnostics[index].decodedHeight = optimizedImage.inputHeight;
          diagnostics[index].exifOrientation = optimizedImage.exifOrientation;
          diagnostics[index].normalizedWidth = optimizedImage.normalizedWidth;
          diagnostics[index].normalizedHeight = optimizedImage.normalizedHeight;
          diagnostics[index].decodingSucceeded = Boolean(optimizedImage.inputWidth && optimizedImage.inputHeight);
          diagnostics[index].conversionSucceeded = true;
          diagnostics[index].conversionStatus = "converted";
          diagnostics[index].finalMimeType = optimizedImage.finalMimeType;
          diagnostics[index].finalByteSize = optimizedImage.optimizedBytes;
          diagnostics[index].includedInOpenAIRequest = true;
          traceEvent(trace, "server_image_optimization_completed", {
            index,
            originalBytes: optimizedImage.originalBytes,
            optimizedBytes: optimizedImage.optimizedBytes,
            inputWidth: optimizedImage.inputWidth,
            inputHeight: optimizedImage.inputHeight,
            normalizedWidth: optimizedImage.normalizedWidth,
            normalizedHeight: optimizedImage.normalizedHeight,
            finalMimeType: optimizedImage.finalMimeType
          });
          return optimizedImage;
        } catch (error) {
          diagnostics[index].conversionStatus = error instanceof Error && error.message === "invalid_output" ? "invalid_output" : "image_conversion_failed";
          diagnostics[index].errorCode = diagnostics[index].conversionStatus;
          diagnostics[index].errorMessage = error instanceof Error ? error.message : "Image conversion failed.";
          console.warn("Plant analysis image conversion failed", diagnostics[index]);
          traceEvent(trace, "server_image_optimization_failed", { index, originalError: sanitizeError(error) });
          throw error;
        }
      })
    );
    console.info("Plant analysis images optimized", {
      count: optimizedImages.length,
      originalBytes: optimizedImages.reduce((total, image) => total + image.originalBytes, 0),
      optimizedBytes: optimizedImages.reduce((total, image) => total + image.optimizedBytes, 0),
      images: diagnostics.map((diagnostic) => ({
        source: diagnostic.source,
        debugId: diagnostic.debugId,
        fileName: diagnostic.fileName,
        mimeType: diagnostic.mimeType,
        extension: diagnostic.extension,
        byteSize: diagnostic.byteSize,
        decodedWidth: diagnostic.decodedWidth,
        decodedHeight: diagnostic.decodedHeight,
        exifOrientation: diagnostic.exifOrientation,
        clientExifOrientation: diagnostic.client?.exifOrientation,
        clientPhysicallyRotated: diagnostic.client?.physicallyRotated,
        clientOrientationSource: diagnostic.client?.orientationSource,
        normalizedWidth: diagnostic.normalizedWidth,
        normalizedHeight: diagnostic.normalizedHeight,
        conversionStatus: diagnostic.conversionStatus,
        finalMimeType: diagnostic.finalMimeType,
        finalByteSize: diagnostic.finalByteSize,
        includedInOpenAIRequest: diagnostic.includedInOpenAIRequest
      }))
    });
    failureStage = "prepare_openai_payload";
    traceEvent(trace, "prepare_openai_payload_started");
    const inputContent = [
      {
        type: "input_text",
        text: [
          "You are helping with houseplant care from user-provided photos.",
          "Return only cautious, advisory plant-care analysis.",
          "Write like an experienced, calm plant caretaker: warm, confident, concise, practical, reassuring, and observant.",
          "Never talk to the user about prompts, AI reasoning, recommendation generation, database context, internal updates, or processing steps. Talk only about the plant, its leaves, soil, light, care, and what to do next.",
          "Avoid robotic phrases such as 'I updated recommendations because', 'recommendations were reduced to', 'no urgent measures are needed', 'context was updated', or 'AI thinks'. Prefer practical plant-centered wording.",
          "Every recommendation should naturally answer: what is happening, why that seems likely, and what the owner should do. Avoid repeating the user's inputs as raw facts.",
          "When possible, provide commonName as a short human-readable plant name in English and Russian, and scientificName as Latin botanical name only.",
          "First identify the likely species, then reason from that plant's actual biology instead of applying a universal houseplant checklist.",
          "Use the structured species profiles below as decision support. They are not encyclopedia text for the user; use them to rank hypotheses, choose actions, and decide which questions are worth asking.",
          "Never output generic plant encyclopedia facts. Every species fact shown to the user must connect to this plant's current photos, current diagnosis, current action, or previous user answers.",
          "Return the new recommendation model as independent sections: careRightNow, aboutSpecies, clarificationQuestions, reasoning, and alternativeCauses.",
          `Recommendation prompt version: ${RECOMMENDATION_PROMPT_VERSION}.`,
          "careRightNow is only for what the user should do now in the current state. Maximum 3 short actionable items. Do not include generic species facts there.",
          "aboutSpecies is not a general species profile. It is a compact set of contextual teaching points for this exact plant. Include up to 6 concise bullets, and each bullet must help the owner make a decision about this plant now.",
          "Bad aboutSpecies bullet: 'Monstera likes indirect light.' Good: 'Because your Monstera already shows slightly dry edges, avoid direct midday sun.'",
          "Bad aboutSpecies bullet: 'Succulents tolerate drought.' Good: 'Since the soil is still moist, waiting before watering is the safest option for this succulent.'",
          "clarificationQuestions must be derived after species reasoning, not before it. They should mirror the useful clarification questions in hypotheses.",
          "reasoning explains how the current situation and species biology led to the recommendation. Keep it concise and useful.",
          "alternativeCauses should include only plausible lower-priority possibilities, not a long generic differential list.",
          "Species-aware question rule: every clarification question must be both relevant for this species and able to change the recommendation, urgency, current action, or next check date.",
          "Ask at most two clarification questions. Choose the questions with the highest expected care impact. Do not ask generic pests, drainage, roots, sun, or soil questions just because they are possible.",
          "Question copy should briefly teach why the question matters for this plant when helpful, not simply collect a raw fact.",
          "Recommendations should explain why the advice matters for the species. For example, dry soil is often normal for succulents, but more important for moisture-loving plants.",
          "For succulents and cacti, do not ask whether the soil is dry as a problem by itself. Prefer asking whether the soil stays wet for several days after watering when moisture risk matters.",
          "For Calathea or prayer plants, prioritize humidity, water quality, and direct sunlight before pests unless pests are visually suggested.",
          "For Monstera, explain dry tips or scorch through bright-indirect-light needs when the photo supports light stress; do not translate 'likes bright light' into harsh direct sun.",
          "When old damaged leaves, dry edges, scorch, or cosmetic marks are visible, clearly distinguish old irreversible tissue from new active symptoms. Explain that old damaged tissue will not recover when relevant.",
          "When recommending observation, be concrete: say what improvement looks like, what deterioration looks like, and how new growth should be used to judge progress.",
          "The most likely explanation must connect visible observations to species biology, recent plant history, and current context. Do not jump from observation directly to action.",
          "The most likely explanation must also say why it is more likely than the main plausible alternatives when confidence is limited. Use cautious wording instead of certainty if drought stress, mechanical damage, repotting stress, and light stress are all possible.",
          "Light recommendations must be operational. Compare advice to the current light context when provided: if the current place is acceptable, say to keep it unless new symptoms appear; if a change is needed, say exactly what to change, such as moving farther from direct rays without putting the plant in shade.",
          "Use structured home and room context when provided. Treat user-entered home/room data as stronger evidence than photo guesses about permanent light, humidity, air conditioning, and location.",
          "Priority of context: user-entered home/room environment first, then plant history and answers, then photo evidence, then AI inference.",
          "When room or home settings are explicit, never overwrite them with photo inference. If the room says low light, do not claim the plant already receives bright indirect light unless photo evidence strongly contradicts the stored setting; explain the uncertainty instead.",
          "Direct sun context distinguishes none, morning, midday, evening, most_of_day, and unsure. Treat midday/most_of_day as higher scorch risk than evening sun; do not treat evening sun as identical to midday sun.",
          "When refreshing recommendations after environment changes, do not ask baseline questions again. Use stored watering, repotting, soil, room, location, and home data as facts.",
          "For recommendation refreshes, explain the practical outcome for this plant. Do not say what changed inside the app or AI. If the photos are too old or insufficient for current visual condition, say that a fresh photo would help check the plant today rather than pretending the visual state changed.",
          "For recommendation refreshes, classify semantic recommendation impact as none, minor, moderate, or major. Compare the meaning of current actions, urgency, and care direction, not prose wording.",
          "recommendationImpact.changeSummary should be one short localized, plant-centered explanation of the practical impact. Good examples: 'После уточнения условий ухода серьёзных изменений не появилось.', 'Теперь совет лучше соответствует месту, где стоит растение.', 'Главное сейчас — не спешить с поливом.' Bad examples: 'I updated recommendations because...', 'The advice has been reduced to...', 'Recommendations were generated with new context.'",
          "Do not invent rooms, cities, humidity, air conditioning, direct sun, or plant position. If environment data conflicts with photo evidence, mention the uncertainty and ask at most one high-impact clarification.",
          "Compare the detected species needs to the stored room conditions. If the room conditions already fit the plant, say to keep them unchanged instead of giving generic light advice.",
          "For Haworthia and similar succulents, wet soil and abrupt direct sun are usually more important risks than short-term dry soil; old damaged leaves may remain marked while new growth shows recovery.",
          "Do not repeat species descriptions unless the trait directly supports the current recommendation for this plant.",
          "If a species trait does not change what the owner should do, watch, avoid, or ask next for this plant, omit it.",
          "Do not satisfy the response with generic reassurance alone. A summary may start calmly, but the recommendation must contain at least one species-specific observation target and at least one context-specific action or non-action.",
          "If there is no urgent action, still be useful: explain exactly what to observe next, what improvement would look like, what deterioration would look like, and what not to do when relevant.",
          "Use saved care data instead of re-asking. If watering, repotting, soil condition, room, home, or location is already present in context or previous answers, treat it as known unless it is contradictory or stale enough to change care.",
          "For healthy or observe states, avoid filler such as 'keep observing' by itself. Tie observation to the detected species, room light/direct sun, watering or repotting history, season/location, or photo age.",
          "When evidence is limited, say the next useful check instead of producing empty generic text. Do not invent symptoms to make advice sound specific.",
          "Keep legacy recommendations aligned with careRightNow. Do not put aboutSpecies facts into legacy recommendations.",
          "Separate visible observations from cautious inferences and user actions needed to verify.",
          "Create hypothesis-driven clarification data for these canonical hypothesis types only: soil_condition, repotting, root_condition, drainage, direct_sun, pests.",
          "Healthy-looking plants should have a positive status and no pest, repotting, drainage, root, or soil question unless there is concrete visual evidence that the answer would change the recommendation.",
          "For each hypothesis, include evidence, missingEvidence, confidence, and whether a user answer can materially change the conclusion, urgency, action, or next check date.",
          "If a clarification question is useful, ask only a direct practical question with answer options. Do not use passive AI limitation text as uncertainty.",
          "Prefer conclusions over raw facts. Explain what an observation or user answer means for care.",
          "If the plant looks healthy, do not manufacture problems. Say no urgent issues are visible and avoid unnecessary clarification questions.",
          "Recommendations should feel like an expert changing their mind when new evidence or answers rule out a previous possibility.",
          "Pay attention to photo types: overview for overall form/light response, leaf close-up for pests/damage, pot/soil for soil-zone clues, roots only for root observations, problem for visible damage.",
          "Do not claim measured soil moisture, root health when roots are not visible, pests that are not clearly visible, or exact disease diagnoses without sufficient visual evidence.",
          "For watering, prefer nextAction check_soil over water unless dry soil is directly visible or user-provided context confirms dryness.",
          `User locale: ${locale}. Photo types in order: ${photoTypes.join(", ") || "unknown"}.`,
          `Analysis mode: ${analysisMode}.`,
          `Current plant context, if this is a follow-up photo analysis: commonName="${currentCommonName || "unknown"}", scientificName="${currentScientificName || "unknown"}", detectedSpecies="${currentDetectedSpecies || "unknown"}", light="${currentLightCondition || "unknown"}".`,
          `Structured home and room context: ${environmentContext || "No structured home or room context was provided."}`,
          `Previous analysis, if available: ${previousAnalysis || "No previous analysis was provided."}`,
          `Species care profiles: ${speciesProfilesPromptContext()}`
        ].join("\n")
      },
      ...optimizedImages.map((image) => ({ type: "input_image", image_url: image.dataUrl }))
    ];
    traceEvent(trace, "prepare_openai_payload_completed", {
      imageCount: optimizedImages.length,
      textBlocks: 1,
      imageUrls: optimizedImages.map((image, index) => ({
        index,
        mimePrefix: image.dataUrl.slice(0, 23),
        dataUrlLength: image.dataUrl.length,
        optimizedBytes: image.optimizedBytes,
        width: image.normalizedWidth,
        height: image.normalizedHeight
      })),
      schemaName: schema.name,
      schemaHasHypotheses: Boolean(schema.schema.properties.hypotheses),
      schemaRequired: schema.schema.required
    });

    openAIRequestStartedAt = Date.now();
    failureStage = "openai_request";
    traceEvent(trace, "openai_request_started", {
      model,
      imageCount: optimizedImages.length,
      timeoutMs: openAIRequestTimeoutMs
    });
    console.info("openai_request_started", {
      model,
      imageCount: optimizedImages.length,
      timeoutMs: openAIRequestTimeoutMs
    });

    const response = await client.responses.create(
      {
        model,
        input: [{ role: "user", content: inputContent as never }],
        text: {
          format: {
            type: "json_schema",
            ...schema
          }
        }
      } as never,
      { signal: controller.signal }
    );
    traceEvent(trace, "openai_response_received", {
      model: response.model ?? model,
      durationMs: Date.now() - openAIRequestStartedAt,
      outputTextLength: response.output_text?.length ?? null
    });
    console.info("openai_request_completed", {
      model: response.model ?? model,
      imageCount: optimizedImages.length,
      durationMs: Date.now() - openAIRequestStartedAt
    });

    failureStage = "parse_openai_response";
    traceEvent(trace, "json_parse_started");
    const text = response.output_text;
    const analysis = JSON.parse(text);
    traceEvent(trace, "json_parse_completed", {
      hasDetectedSpecies: Boolean(analysis?.detectedSpecies),
      hasRecommendations: Array.isArray(analysis?.recommendations),
      recommendationCount: Array.isArray(analysis?.recommendations) ? analysis.recommendations.length : null,
      hasHypotheses: Array.isArray(analysis?.hypotheses),
      hypothesisCount: Array.isArray(analysis?.hypotheses) ? analysis.hypotheses.length : null,
      condition: analysis?.condition ?? null
    });
    traceEvent(trace, "schema_validation_completed", {
      source: "openai_structured_outputs",
      schemaName: schema.name,
      strict: schema.strict
    });
    failureStage = "species_reasoning_postprocess";
    const speciesAwareAnalysis = applySpeciesAwareQuestionLimits(analysis);
    traceEvent(trace, "species_reasoning_postprocess_completed", {
      profileId:
        typeof speciesAwareAnalysis.speciesReasoning === "object" && speciesAwareAnalysis.speciesReasoning && "profileId" in speciesAwareAnalysis.speciesReasoning
          ? (speciesAwareAnalysis.speciesReasoning as { profileId?: unknown }).profileId
          : null,
      selectedQuestions:
        typeof speciesAwareAnalysis.speciesReasoning === "object" && speciesAwareAnalysis.speciesReasoning && "questionSelection" in speciesAwareAnalysis.speciesReasoning
          ? (speciesAwareAnalysis.speciesReasoning as { questionSelection?: { selectedQuestions?: unknown } }).questionSelection?.selectedQuestions ?? null
          : null
    });
    traceEvent(trace, "response_returned", {
      ok: true,
      analysisMode,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      analysis: speciesAwareAnalysis,
      model: response.model ?? model,
      trace,
      ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {})
    });
  } catch (error) {
    const originalError = sanitizeError(error);
    const status = typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : undefined;
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
    const isOpenAITimeout =
      didOpenAITimeOut ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.message.toLocaleLowerCase().includes("aborted")));
    const durationMs = openAIRequestStartedAt ? Date.now() - openAIRequestStartedAt : null;
    if (isOpenAITimeout) {
      console.warn("openai_request_timed_out", {
        model,
        timeoutMs: openAIRequestTimeoutMs,
        durationMs,
        imageCount: diagnostics.filter((diagnostic) => diagnostic.includedInOpenAIRequest).length
      });
    }
    console.error("Plant analysis failed", {
      stage: failureStage,
      ...originalError,
      openAIStatus: status,
      openAIErrorCode: code,
      durationMs,
      trace,
      diagnostics
    });
    traceEvent(trace, "exception_thrown", {
      stage: failureStage,
      originalError
    });
    const hasConversionFailure = diagnostics.some((diagnostic) => diagnostic.errorCode === "image_conversion_failed" || diagnostic.errorCode === "invalid_output");
    return diagnosticResponse(
      hasConversionFailure ? "image_conversion_failed" : isOpenAITimeout ? "ai_analysis_timed_out" : "Plant analysis failed.",
      hasConversionFailure ? 422 : isOpenAITimeout ? 504 : 502,
      diagnostics,
      failureStage,
      trace,
      originalError
    );
  } finally {
    clearTimeout(timeout);
  }
}
