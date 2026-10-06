import {
  CAMPAIGN_MEDIA_MIN_PHOTOS, CAMPAIGN_MEDIA_MAX_PHOTOS, CAMPAIGN_MEDIA_MAX_FILE_BYTES,
  CAMPAIGN_MEDIA_MAX_TOTAL_BYTES, CAMPAIGN_MEDIA_MAX_DIMENSION,
} from "../campaign-media";

export const CAMPAIGN_PHOTO_MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const MAX_INPUT_EDGE = 12_000;
export type CampaignPhotoPreparationCode = "invalid_count" | "invalid_type" | "too_large" | "duplicate_photos" | "invalid_image" | "unsupported" | "preparation_failed";
export class CampaignPhotoPreparationError extends Error {
  constructor(public readonly code: CampaignPhotoPreparationCode) { super(code); this.name = "CampaignPhotoPreparationError"; }
}
type Dimensions = { width: number; height: number };
type DecodedPhoto = Dimensions & { source: CanvasImageSource; close: () => void };
/** Injectable browser boundaries keep the actual limits/resize algorithm testable. */
export type CampaignPhotoPreparationEnvironment = {
  decode: (file: File) => Promise<DecodedPhoto>;
  encode: (image: DecodedPhoto, width: number, height: number, quality: number) => Promise<Blob>;
  digest: (bytes: Uint8Array) => Promise<string>;
};
const invalidImage = () => new CampaignPhotoPreparationError("invalid_image");
function validDimensions(width: number, height: number): Dimensions {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw invalidImage();
  if (width > MAX_INPUT_EDGE || height > MAX_INPUT_EDGE || width * height > MAX_INPUT_PIXELS) throw new CampaignPhotoPreparationError("too_large");
  return { width, height };
}

/** Check encoded dimensions before allocating a decoded image, including malformed headers. */
export function campaignPhotoDimensions(bytes: Uint8Array, mime: string): Dimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
    && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR" && view.getUint32(8) === 13) {
    // A still campaign photo is required. Reject APNG before decoding it.
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) throw invalidImage();
      if (String.fromCharCode(...bytes.slice(offset + 4, offset + 8)) === "acTL") throw invalidImage();
      offset += length + 12;
    }
    return validDimensions(view.getUint32(16), view.getUint32(20));
  }
  if (mime === "image/jpeg" && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw invalidImage();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda || marker === undefined) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw invalidImage();
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8) throw invalidImage();
        return validDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += length;
    }
  }
  if (mime === "image/webp" && bytes.length >= 25 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    const length = view.getUint32(16, true);
    if (length > bytes.length - 20) throw invalidImage();
    if (kind === "VP8X" && length >= 10 && bytes.length >= 30) {
      if (bytes[20] & 0x02) throw invalidImage(); // Animated WebP is not a still photo.
      const read24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
      return validDimensions(read24(24) + 1, read24(27) + 1);
    }
    if (kind === "VP8 " && length >= 10 && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
      return validDimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (kind === "VP8L" && length >= 5 && bytes[20] === 0x2f)
      return validDimensions((bytes[21] | ((bytes[22] & 0x3f) << 8)) + 1, ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) + 1);
  }
  throw invalidImage();
}

const browserEnvironment: CampaignPhotoPreparationEnvironment = {
  async decode(file) {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") throw new CampaignPhotoPreparationError("unsupported");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  async encode(image, width, height, quality) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new CampaignPhotoPreparationError("unsupported");
    // JPEG is opaque. A white base prevents black transparent areas.
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, width, height);
    try { return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(invalidImage()), "image/jpeg", quality)); }
    finally { canvas.width = canvas.height = 0; }
  },
  async digest(bytes) {
    if (!globalThis.crypto?.subtle) throw new CampaignPhotoPreparationError("unsupported");
    const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  },
};

/** Re-encode sequentially, stripping metadata, with enough room for multipart overhead below 1 MB. */
export async function prepareCampaignPhotos(files: readonly File[], environment = browserEnvironment): Promise<File[]> {
  if (files.length < CAMPAIGN_MEDIA_MIN_PHOTOS || files.length > CAMPAIGN_MEDIA_MAX_PHOTOS) throw new CampaignPhotoPreparationError("invalid_count");
  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new CampaignPhotoPreparationError("invalid_type");
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > CAMPAIGN_PHOTO_MAX_INPUT_BYTES) throw new CampaignPhotoPreparationError("too_large");
  }
  const inputHashes = new Set<string>(), outputHashes = new Set<string>(), prepared: File[] = [];
  for (const file of files) {
    let image: DecodedPhoto | undefined;
    try {
      const input = new Uint8Array(await file.arrayBuffer());
      campaignPhotoDimensions(input, file.type);
      const originalHash = await environment.digest(input);
      if (inputHashes.has(originalHash)) throw new CampaignPhotoPreparationError("duplicate_photos");
      inputHashes.add(originalHash);
      image = await environment.decode(file);
      validDimensions(image.width, image.height);
      let maxEdge = CAMPAIGN_MEDIA_MAX_DIMENSION, output: Blob | undefined;
      for (let resize = 0; resize < 5 && !output; resize++, maxEdge = Math.floor(maxEdge * .75)) {
        const ratio = Math.min(1, maxEdge / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio)), height = Math.max(1, Math.round(image.height * ratio));
        for (const quality of [.84, .7, .55, .4]) {
          const candidate = await environment.encode(image, width, height, quality);
          if (candidate.type === "image/jpeg" && candidate.size > 0 && candidate.size <= CAMPAIGN_MEDIA_MAX_FILE_BYTES) { output = candidate; break; }
        }
      }
      if (!output) throw new CampaignPhotoPreparationError("preparation_failed");
      const outputHash = await environment.digest(new Uint8Array(await output.arrayBuffer()));
      if (outputHashes.has(outputHash)) throw new CampaignPhotoPreparationError("duplicate_photos");
      outputHashes.add(outputHash);
      prepared.push(new File([output], `campaign-photo-${prepared.length + 1}.jpg`, { type: "image/jpeg" }));
    } catch (error) {
      if (error instanceof CampaignPhotoPreparationError) throw error;
      throw invalidImage();
    } finally { image?.close(); }
  }
  if (prepared.reduce((total, file) => total + file.size, 0) > CAMPAIGN_MEDIA_MAX_TOTAL_BYTES) throw new CampaignPhotoPreparationError("too_large");
  return prepared;
}
