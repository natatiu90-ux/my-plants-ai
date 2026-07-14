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

function isCompatibleStoredPhoto(value: unknown): value is Blob {
  return value instanceof Blob && value.size > 0 && (!value.type || supportedTypes.has(value.type));
}

export const PhotoStorageRepository = {
  async savePhoto(file: File): Promise<{ id: string; localUrl: string }> {
    const id = `local-photo-${Date.now()}-${crypto.randomUUID()}`;
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch (error) {
      throw new IndexedDbPhotoStorageError(createIndexedDbDiagnostic(id, file, { stage: "open_db" }, error), error);
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const rejectOnce = (diagnostic: IndexedDbPhotoStorageDiagnostic, error?: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new IndexedDbPhotoStorageError(diagnostic, error));
      };

      let diagnostic = createIndexedDbDiagnostic(id, file, {
        openDbSucceeded: true,
        dbVersion: db.version,
        objectStoreExists: db.objectStoreNames.contains(storeName)
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
        rejectOnce(createIndexedDbDiagnostic(id, file, {
          ...diagnostic,
          stage: "start_transaction"
        }, error), error);
        return;
      }

      try {
        request = transaction.objectStore(storeName).put(file, id);
        diagnostic = {
          ...diagnostic,
          stage: "put",
          putReached: true
        };
      } catch (error) {
        rejectOnce(createIndexedDbDiagnostic(id, file, {
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
            id,
            file,
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
        resolve();
      };
    });

    return { id, localUrl: URL.createObjectURL(file) };
  },

  async replacePhoto(id: string, file: File): Promise<void> {
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getPhoto(id: string): Promise<Blob | null> {
    const db = await openDb();

    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(isCompatibleStoredPhoto(request.result) ? request.result : null);
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
