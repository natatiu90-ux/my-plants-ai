"use client";

const dbName = "plant-care-photo-storage";
const storeName = "photos";
export const temporaryPhotoSchemaVersion = "2";
const maxFileSize = 10 * 1024 * 1024;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
const supportedExtensions = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);

export type IndexedDbPhotoStorageDiagnostic = {
  stage: "open_db" | "start_transaction" | "put" | "transaction_error" | "transaction_abort" | "unknown";
  exceptionName?: string;
  exceptionMessage?: string;
  exceptionStack?: string;
  domExceptionCode?: number;
  transactionMode: IDBTransactionMode;
  databaseName: string;
  objectStoreName: string;
  key: string;
  blobSize: number;
  blobType: string;
  openDbSucceeded: boolean;
  transactionStarted: boolean;
  putReached: boolean;
  transactionOnAbortFired: boolean;
  transactionError?: {
    name?: string;
    message?: string;
    code?: number;
  } | null;
  requestError?: {
    name?: string;
    message?: string;
    code?: number;
  } | null;
  dbVersion?: number;
  objectStoreExists?: boolean;
  sourceConstructorName?: string;
  storedRepresentation?: "blob" | "array_buffer_record";
  storedConstructorName?: string;
  storedInstanceofFile?: boolean;
  fallbackUsed?: boolean;
  putValue?: {
    constructorName?: string;
    instanceofBlob: boolean;
    instanceofFile: boolean;
    objectToString: string;
    typeOfValue: string;
    blobInstanceofBlob: boolean;
    blobInstanceofFile: boolean;
    blobConstructorName?: string;
    blobSize?: number;
    blobType?: string;
    arrayBufferSucceeded?: boolean;
    arrayBufferError?: {
      name?: string;
      message?: string;
      code?: number;
    };
    newBlobSucceeded?: boolean;
    newBlobError?: {
      name?: string;
      message?: string;
      code?: number;
    };
    structuredCloneBlobSucceeded?: boolean;
    structuredCloneBlobError?: {
      name?: string;
      message?: string;
      code?: number;
    };
    structuredCloneValueSucceeded?: boolean;
    structuredCloneValueError?: {
      name?: string;
      message?: string;
      code?: number;
    };
    properties?: {
      name: string;
      typeOfValue: string;
      constructorName?: string;
      objectToString: string;
      isBlob: boolean;
      isFile: boolean;
    }[];
  };
};

type TemporaryPhotoRecord = {
  kind: "temporary_photo_array_buffer";
  bytes: ArrayBuffer;
  type: string;
  size: number;
};

function errorDetails(error: unknown): { name?: string; message?: string; stack?: string; code?: number } {
  const value = error as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown } | null | undefined;
  return {
    name: typeof value?.name === "string" ? value.name : error instanceof Error ? error.name : undefined,
    message: typeof value?.message === "string" ? value.message : error instanceof Error ? error.message : undefined,
    stack: typeof value?.stack === "string" ? value.stack : error instanceof Error ? error.stack : undefined,
    code: typeof value?.code === "number" ? value.code : undefined
  };
}

async function inspectIndexedDbPutValue(value: unknown) {
  const blob = value;
  const putValue: NonNullable<IndexedDbPhotoStorageDiagnostic["putValue"]> = {
    constructorName: value?.constructor?.name,
    instanceofBlob: value instanceof Blob,
    instanceofFile: value instanceof File,
    objectToString: Object.prototype.toString.call(value),
    typeOfValue: typeof value,
    blobInstanceofBlob: blob instanceof Blob,
    blobInstanceofFile: blob instanceof File,
    blobConstructorName: blob?.constructor?.name,
    blobSize: blob instanceof Blob ? blob.size : undefined,
    blobType: blob instanceof Blob ? blob.type : undefined
  };

  if (blob instanceof Blob) {
    try {
      await blob.arrayBuffer();
      putValue.arrayBufferSucceeded = true;
    } catch (error) {
      putValue.arrayBufferSucceeded = false;
      putValue.arrayBufferError = errorDetails(error);
    }

    try {
      new Blob([blob]);
      putValue.newBlobSucceeded = true;
    } catch (error) {
      putValue.newBlobSucceeded = false;
      putValue.newBlobError = errorDetails(error);
    }

    try {
      structuredClone(blob);
      putValue.structuredCloneBlobSucceeded = true;
    } catch (error) {
      putValue.structuredCloneBlobSucceeded = false;
      putValue.structuredCloneBlobError = errorDetails(error);
    }
  }

  try {
    structuredClone(value);
    putValue.structuredCloneValueSucceeded = true;
  } catch (error) {
    putValue.structuredCloneValueSucceeded = false;
    putValue.structuredCloneValueError = errorDetails(error);
  }

  if (value && typeof value === "object") {
    putValue.properties = Reflect.ownKeys(value).map((key) => {
      const propertyValue = (value as Record<PropertyKey, unknown>)[key];
      return {
        name: typeof key === "symbol" ? key.toString() : key,
        typeOfValue: typeof propertyValue,
        constructorName: propertyValue?.constructor?.name,
        objectToString: Object.prototype.toString.call(propertyValue),
        isBlob: propertyValue instanceof Blob,
        isFile: propertyValue instanceof File
      };
    });
  }

  return putValue;
}

async function serializeTemporaryPhoto(input: Blob) {
  const type = input.type || "image/jpeg";
  const bytes = await input.arrayBuffer();
  const blob = new Blob([bytes], { type });
  const record: TemporaryPhotoRecord = {
    kind: "temporary_photo_array_buffer",
    bytes: bytes.slice(0),
    type,
    size: bytes.byteLength
  };

  return {
    blob,
    record,
    sourceConstructorName: input.constructor.name
  };
}

export function deserializeTemporaryPhoto(value: unknown): Blob | null {
  if (value instanceof Blob && value.size > 0 && (!value.type || supportedTypes.has(value.type))) {
    return new Blob([value], { type: value.type || "image/jpeg" });
  }

  if (
    value &&
    typeof value === "object" &&
    (value as TemporaryPhotoRecord).kind === "temporary_photo_array_buffer" &&
    (value as TemporaryPhotoRecord).bytes instanceof ArrayBuffer
  ) {
    const record = value as TemporaryPhotoRecord;
    const type = record.type || "image/jpeg";
    if (!supportedTypes.has(type)) {
      return null;
    }

    return new Blob([record.bytes], { type });
  }

  return null;
}

export class IndexedDbPhotoStorageError extends Error {
  diagnostic: IndexedDbPhotoStorageDiagnostic;

  constructor(diagnostic: IndexedDbPhotoStorageDiagnostic, cause?: unknown) {
    super(diagnostic.exceptionMessage ?? "IndexedDB photo storage failed.");
    this.name = "IndexedDbPhotoStorageError";
    this.diagnostic = diagnostic;
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

function createIndexedDbDiagnostic(
  key: string,
  file: Blob,
  overrides: Partial<IndexedDbPhotoStorageDiagnostic> = {},
  error?: unknown
): IndexedDbPhotoStorageDiagnostic {
  const details = errorDetails(error);
  return {
    stage: "unknown",
    transactionMode: "readwrite",
    databaseName: dbName,
    objectStoreName: storeName,
    key,
    blobSize: file.size,
    blobType: file.type,
    openDbSucceeded: false,
    transactionStarted: false,
    putReached: false,
    transactionOnAbortFired: false,
    exceptionName: details.name,
    exceptionMessage: details.message,
    exceptionStack: details.stack,
    domExceptionCode: details.code,
    transactionError: null,
    requestError: null,
    ...overrides
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function validateImageFile(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  return file.size <= maxFileSize && (supportedTypes.has(file.type) || Boolean(extension && supportedExtensions.has(extension)));
}

function putValueInNewTransaction(db: IDBDatabase, key: string, source: Blob, value: Blob | TemporaryPhotoRecord, fallbackUsed: boolean): Promise<IndexedDbPhotoStorageDiagnostic> {
  return new Promise<IndexedDbPhotoStorageDiagnostic>((resolve, reject) => {
    let settled = false;
    const rejectOnce = (diagnostic: IndexedDbPhotoStorageDiagnostic, error?: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new IndexedDbPhotoStorageError(diagnostic, error));
    };

    void (async () => {
      const putValue = await inspectIndexedDbPutValue(value);
      const storedRepresentation = value instanceof Blob ? "blob" : "array_buffer_record";
      let diagnostic = createIndexedDbDiagnostic(key, source, {
        openDbSucceeded: true,
        dbVersion: db.version,
        objectStoreExists: db.objectStoreNames.contains(storeName),
        sourceConstructorName: source.constructor.name,
        storedRepresentation,
        storedConstructorName: value.constructor.name,
        storedInstanceofFile: value instanceof File,
        fallbackUsed,
        putValue
      });
      let transaction: IDBTransaction;
      let request: IDBRequest<IDBValidKey>;

      try {
        transaction = db.transaction(storeName, "readwrite");
        diagnostic = {
          ...diagnostic,
          stage: "start_transaction",
          transactionStarted: true
        };
      } catch (error) {
        rejectOnce(createIndexedDbDiagnostic(key, source, {
          ...diagnostic,
          stage: "start_transaction"
        }, error), error);
        return;
      }

      try {
        request = transaction.objectStore(storeName).put(value, key);
        diagnostic = {
          ...diagnostic,
          stage: "put",
          putReached: true
        };
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive.
        }
        rejectOnce(createIndexedDbDiagnostic(key, source, {
          ...diagnostic,
          stage: "put"
        }, error), error);
        return;
      }

      request.onerror = () => {
        diagnostic = {
          ...diagnostic,
          requestError: errorDetails(request.error),
          exceptionName: errorDetails(request.error).name,
          exceptionMessage: errorDetails(request.error).message,
          exceptionStack: errorDetails(request.error).stack,
          domExceptionCode: errorDetails(request.error).code
        };
      };

      transaction.onabort = () => {
        const transactionError = errorDetails(transaction.error);
        const requestError = errorDetails(request.error);
        rejectOnce(
          createIndexedDbDiagnostic(
            key,
            source,
            {
              ...diagnostic,
              stage: "transaction_abort",
              transactionOnAbortFired: true,
              transactionError,
              requestError,
              exceptionName: transactionError.name ?? requestError.name ?? diagnostic.exceptionName,
              exceptionMessage: transactionError.message ?? requestError.message ?? diagnostic.exceptionMessage,
              exceptionStack: transactionError.stack ?? requestError.stack ?? diagnostic.exceptionStack,
              domExceptionCode: transactionError.code ?? requestError.code ?? diagnostic.domExceptionCode
            },
            transaction.error ?? request.error
          ),
          transaction.error ?? request.error
        );
      };

      transaction.onerror = () => {
        diagnostic = {
          ...diagnostic,
          stage: "transaction_error",
          transactionError: errorDetails(transaction.error),
          requestError: errorDetails(request.error)
        };
      };

      transaction.oncomplete = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve({
          ...diagnostic,
          stage: "put"
        });
      };
    })().catch((error) => {
      rejectOnce(createIndexedDbDiagnostic(key, source, { stage: "unknown" }, error), error);
    });
  });
}

async function putSerializedTemporaryPhoto(db: IDBDatabase, key: string, source: Blob) {
  const serialized = await serializeTemporaryPhoto(source);
  try {
    return await putValueInNewTransaction(db, key, source, serialized.blob, false);
  } catch (blobError) {
    console.warn("indexeddb_blob_put_failed_using_arraybuffer_fallback", {
      key,
      sourceConstructorName: serialized.sourceConstructorName,
      message: blobError instanceof Error ? blobError.message : "Unknown error"
    });
    return await putValueInNewTransaction(db, key, source, serialized.record, true);
  }
}

export const PhotoStorageRepository = {
  async savePhoto(file: File): Promise<{ id: string; localUrl: string; diagnostic?: IndexedDbPhotoStorageDiagnostic }> {
    const id = `local-photo-${Date.now()}-${crypto.randomUUID()}`;
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch (error) {
      throw new IndexedDbPhotoStorageError(createIndexedDbDiagnostic(id, file, { stage: "open_db" }, error), error);
    }
    const diagnostic = await putSerializedTemporaryPhoto(db, id, file);

    return { id, localUrl: URL.createObjectURL(file), diagnostic };
  },

  async replacePhoto(id: string, file: File): Promise<void> {
    const db = await openDb();
    await putSerializedTemporaryPhoto(db, id, file);
  },

  async getPhoto(id: string): Promise<Blob | null> {
    const db = await openDb();

    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(deserializeTemporaryPhoto(request.result));
      request.onerror = () => reject(request.error);
    });

    if (!blob) {
      await this.deletePhoto(id).catch(() => {});
    }

    return blob;
  },

  async deletePhoto(id: string): Promise<void> {
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async clearTemporaryPhotos(): Promise<void> {
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async listPhotoIds(): Promise<string[]> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAllKeys();
      request.onsuccess = () => resolve(request.result.map(String));
      request.onerror = () => reject(request.error);
    });
  }
};
