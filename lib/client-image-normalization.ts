"use client";

export type NormalizedImageResult = {
  blob: Blob;
  originalWidth: number;
  originalHeight: number;
  normalizedWidth: number;
  normalizedHeight: number;
  exifOrientation: number | null;
  orientationSource: "raw_pixels" | "browser_display";
  physicallyRotated: boolean;
};

function getUint16(view: DataView, offset: number, littleEndian: boolean) {
  return view.getUint16(offset, littleEndian);
}

function getUint32(view: DataView, offset: number, littleEndian: boolean) {
  return view.getUint32(offset, littleEndian);
}

export async function readJpegExifOrientation(blob: Blob): Promise<number | null> {
  const buffer = await blob.slice(0, Math.min(blob.size, 256 * 1024)).arrayBuffer();
  const view = new DataView(buffer);

  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }

    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) {
      break;
    }

    if (marker === 0xe1 && segmentLength >= 10) {
      const exifHeader = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
        view.getUint8(offset + 8),
        view.getUint8(offset + 9)
      );

      if (exifHeader === "Exif\u0000\u0000") {
        const tiffOffset = offset + 10;
        const byteOrder = view.getUint16(tiffOffset, false);
        const littleEndian = byteOrder === 0x4949;
        if (!littleEndian && byteOrder !== 0x4d4d) {
          return null;
        }

        const firstIfdOffset = getUint32(view, tiffOffset + 4, littleEndian);
        const ifdOffset = tiffOffset + firstIfdOffset;
        if (ifdOffset + 2 > view.byteLength) {
          return null;
        }

        const entryCount = getUint16(view, ifdOffset, littleEndian);
        for (let index = 0; index < entryCount; index += 1) {
          const entryOffset = ifdOffset + 2 + index * 12;
          if (entryOffset + 12 > view.byteLength) {
            break;
          }

          const tag = getUint16(view, entryOffset, littleEndian);
          if (tag === 0x0112) {
            const orientation = getUint16(view, entryOffset + 8, littleEndian);
            return orientation >= 1 && orientation <= 8 ? orientation : null;
          }
        }
      }
    }

    offset += 2 + segmentLength;
  }

  return null;
}

export async function inspectImageDisplay(blob: Blob): Promise<{ succeeded: boolean; width: number | null; height: number | null }> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();

  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("decode_failed"));
      image.src = objectUrl;
    });

    return {
      succeeded: true,
      width: dimensions.width,
      height: dimensions.height
    };
  } catch {
    return {
      succeeded: false,
      width: null,
      height: null
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("image_preparation_failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

type LoadedImage = {
  image: ImageBitmap | HTMLImageElement;
  orientationSource: "raw_pixels" | "browser_display";
};

async function loadBitmap(blob: Blob): Promise<LoadedImage> {
  if ("createImageBitmap" in window) {
    try {
      return {
        image: await createImageBitmap(blob, { imageOrientation: "none" }),
        orientationSource: "raw_pixels"
      };
    } catch {
      return {
        image: await createImageBitmap(blob),
        orientationSource: "browser_display"
      };
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image_preparation_failed"));
      image.src = objectUrl;
    });
    return { image, orientationSource: "browser_display" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function imageDimensions(bitmap: ImageBitmap | HTMLImageElement) {
  if (bitmap instanceof HTMLImageElement) {
    return { width: bitmap.naturalWidth, height: bitmap.naturalHeight };
  }

  return { width: bitmap.width, height: bitmap.height };
}

function closeBitmap(bitmap: ImageBitmap | HTMLImageElement) {
  if ("close" in bitmap) {
    bitmap.close();
  }
}

function drawWithOrientation(
  context: CanvasRenderingContext2D,
  image: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  orientation: number
) {
  switch (orientation) {
    case 2:
      context.translate(width, 0);
      context.scale(-1, 1);
      break;
    case 3:
      context.translate(width, height);
      context.rotate(Math.PI);
      break;
    case 4:
      context.translate(0, height);
      context.scale(1, -1);
      break;
    case 5:
      context.rotate(0.5 * Math.PI);
      context.scale(1, -1);
      break;
    case 6:
      context.translate(width, 0);
      context.rotate(0.5 * Math.PI);
      break;
    case 7:
      context.translate(width, height);
      context.rotate(0.5 * Math.PI);
      context.scale(-1, 1);
      break;
    case 8:
      context.translate(0, height);
      context.rotate(-0.5 * Math.PI);
      break;
    default:
      break;
  }

  context.drawImage(image, 0, 0);
}

export async function normalizeImageBlob(
  blob: Blob,
  options: { maxSide: number; qualities: number[]; targetBytes?: number }
): Promise<NormalizedImageResult> {
  const exifOrientation = await readJpegExifOrientation(blob);
  const orientation = exifOrientation ?? 1;
  const loaded = await loadBitmap(blob);
  const bitmap = loaded.image;

  try {
    const { width: sourceWidth, height: sourceHeight } = imageDimensions(bitmap);
    if (!sourceWidth || !sourceHeight) {
      throw new Error("image_preparation_failed");
    }

    const shouldApplyExifOrientation = loaded.orientationSource === "raw_pixels";
    const swapsDimensions = shouldApplyExifOrientation && orientation >= 5 && orientation <= 8;
    const visualWidth = swapsDimensions ? sourceHeight : sourceWidth;
    const visualHeight = swapsDimensions ? sourceWidth : sourceHeight;
    const scale = Math.min(1, options.maxSide / Math.max(visualWidth, visualHeight));
    const normalizedWidth = Math.max(1, Math.round(visualWidth * scale));
    const normalizedHeight = Math.max(1, Math.round(visualHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = normalizedWidth;
    canvas.height = normalizedHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("image_preparation_failed");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, normalizedWidth, normalizedHeight);
    context.save();
    context.scale(scale, scale);
    if (shouldApplyExifOrientation) {
      drawWithOrientation(context, bitmap, visualWidth, visualHeight, orientation);
    } else {
      context.drawImage(bitmap, 0, 0);
    }
    context.restore();

    let bestBlob: Blob | null = null;
    for (const quality of options.qualities) {
      const candidate = await canvasToJpeg(canvas, quality);
      bestBlob = candidate;
      if (!options.targetBytes || candidate.size <= options.targetBytes) {
        break;
      }
    }

    if (!bestBlob) {
      throw new Error("image_preparation_failed");
    }

    return {
      blob: bestBlob,
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
      normalizedWidth,
      normalizedHeight,
      exifOrientation,
      orientationSource: loaded.orientationSource,
      physicallyRotated: true
    };
  } finally {
    closeBitmap(bitmap);
  }
}
