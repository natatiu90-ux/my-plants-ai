"use client";

const dbName = "plant-care-photo-storage";
const storeName = "photos";
export const temporaryPhotoSchemaVersion = "2";
const maxFileSize = 10 * 1024 * 1024;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
const supportedExtensions = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);

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
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
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
