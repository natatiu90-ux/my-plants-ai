import OpenAI from "openai";
import { NextResponse } from "next/server";
import convertHeic from "heic-convert";
import sharp from "sharp";

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

function diagnosticResponse(message: string, status = 400, diagnostics?: ImageDiagnostic[]) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(process.env.NODE_ENV !== "production" && diagnostics ? { diagnostics } : {})
    },
    { status }
  );
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const message = process.env.NODE_ENV === "development" ? "OPENAI_API_KEY is not configured." : "Plant analysis is unavailable.";
    return diagnosticResponse(message, 503);
  }

  const formData = await request.formData();
  const files = formData.getAll("photos").filter((value): value is File => value instanceof File);
  const locale = String(formData.get("locale") ?? "en");
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
  const diagnostics: ImageDiagnostic[] = files.map((file, index) => ({
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

  if (!files.length) {
    return diagnosticResponse("At least one image is required.");
  }

  if (files.length > maxPhotos) {
    return diagnosticResponse(`Use ${maxPhotos} photos or fewer.`, 400, diagnostics);
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
      return diagnosticResponse("One or more images are unsupported or too large.", 400, diagnostics);
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
          return optimizedImage;
        } catch (error) {
          diagnostics[index].conversionStatus = error instanceof Error && error.message === "invalid_output" ? "invalid_output" : "image_conversion_failed";
          diagnostics[index].errorCode = diagnostics[index].conversionStatus;
          diagnostics[index].errorMessage = error instanceof Error ? error.message : "Image conversion failed.";
          console.warn("Plant analysis image conversion failed", diagnostics[index]);
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
    const inputContent = [
      {
        type: "input_text",
        text: [
          "You are helping with houseplant care from user-provided photos.",
          "Return only cautious, advisory plant-care analysis.",
          "When possible, provide commonName as a short human-readable plant name in English and Russian, and scientificName as Latin botanical name only.",
          "Separate visible observations from cautious inferences and user actions needed to verify.",
          "Do not claim measured soil moisture, root health when roots are not visible, pests that are not clearly visible, or exact disease diagnoses without sufficient visual evidence.",
          "For watering, prefer nextAction check_soil over water unless dry soil is directly visible or user-provided context confirms dryness.",
          `User locale: ${locale}. Photo types in order: ${photoTypes.join(", ") || "unknown"}.`
        ].join("\n")
      },
      ...optimizedImages.map((image) => ({ type: "input_image", image_url: image.dataUrl }))
    ];

    openAIRequestStartedAt = Date.now();
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
    console.info("openai_request_completed", {
      model: response.model ?? model,
      imageCount: optimizedImages.length,
      durationMs: Date.now() - openAIRequestStartedAt
    });

    const text = response.output_text;
    const analysis = JSON.parse(text);

    return NextResponse.json({
      ok: true,
      analysis,
      model: response.model ?? model,
      ...(process.env.NODE_ENV !== "production" ? { diagnostics } : {})
    });
  } catch (error) {
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
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
      openAIStatus: status,
      openAIErrorCode: code,
      durationMs,
      diagnostics
    });
    const hasConversionFailure = diagnostics.some((diagnostic) => diagnostic.errorCode === "image_conversion_failed" || diagnostic.errorCode === "invalid_output");
    return diagnosticResponse(
      hasConversionFailure ? "image_conversion_failed" : isOpenAITimeout ? "ai_analysis_timed_out" : "Plant analysis failed.",
      hasConversionFailure ? 422 : isOpenAITimeout ? 504 : 502,
      diagnostics
    );
  } finally {
    clearTimeout(timeout);
  }
}
