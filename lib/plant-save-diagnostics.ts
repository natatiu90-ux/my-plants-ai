export type PlantCreationStage =
  | "create_plant"
  | "read_temporary_blob"
  | "upload_storage"
  | "insert_photo_row"
  | "assign_cover"
  | "create_milestone"
  | "create_watering_event"
  | "save_analysis"
  | "reload_plant"
  | "cleanup"
  | "unknown";

export type PlantCreationDiagnostic = {
  stage: PlantCreationStage;
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  plantId?: string;
  photoStorageId?: string;
  parsedTemporaryStorageId?: string;
  photoIndex?: number;
  blobFound?: boolean;
  blobMimeType?: string | null;
  blobSize?: number | null;
  authenticatedUserIdSuffix?: string | null;
  insertedOwnerIdSuffix?: string | null;
  storagePathPrefix?: string | null;
  rollbackResult?: string | null;
  standaloneMode?: "standalone" | "browser";
  appBuildVersion?: string;
  previousAppBuildVersion?: string | null;
  authStatus?: "authenticated" | "unauthenticated" | "unknown";
  userIdSuffix?: string | null;
};

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return undefined;
}

function safeErrorFields(error: unknown) {
  const value = (typeof error === "object" && error ? error : {}) as ErrorLike;
  return {
    message: error instanceof Error ? error.message : stringValue(value.message) ?? "Unknown error",
    code: stringValue(value.code),
    details: stringValue(value.details),
    hint: stringValue(value.hint),
    status: numberValue(value.status) ?? numberValue(value.statusCode)
  };
}

export class PlantCreationError extends Error {
  diagnostic: PlantCreationDiagnostic;

  constructor(diagnostic: PlantCreationDiagnostic, cause?: unknown) {
    super(diagnostic.message);
    this.name = "PlantCreationError";
    this.diagnostic = diagnostic;
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

export function plantCreationDiagnosticFromError(
  error: unknown,
  fallback: Omit<PlantCreationDiagnostic, "message"> & { message?: string }
): PlantCreationDiagnostic {
  if (error instanceof PlantCreationError) {
    return error.diagnostic;
  }

  const safe = safeErrorFields(error);
  return {
    ...fallback,
    message: fallback.message ?? safe.message,
    code: fallback.code ?? safe.code,
    details: fallback.details ?? safe.details,
    hint: fallback.hint ?? safe.hint,
    status: fallback.status ?? safe.status
  };
}

export function plantCreationError(
  error: unknown,
  fallback: Omit<PlantCreationDiagnostic, "message"> & { message?: string }
) {
  return new PlantCreationError(plantCreationDiagnosticFromError(error, fallback), error);
}
