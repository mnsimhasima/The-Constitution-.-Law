import type { OttAudioBlockRole, OttAudioEntityType } from '../types/ott';
import {
  formatAudioDurationLabel,
  validateContentAudioFile,
} from './contentAudioMetadata';

export interface UploadedContentAudioResult {
  assetId: string;
  audioUrl: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSec: number;
  durationLabel: string;
  sha256Checksum: string;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read audio file from disk.'));
    reader.readAsDataURL(file);
  });
}

function detectBrowserAudioDurationSec(file: File): Promise<number | undefined> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';

    const finish = (value: number | undefined) => {
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(undefined), 3000);
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const sec = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : undefined;
      finish(sec);
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      finish(undefined);
    };
    audio.src = objectUrl;
  });
}

/**
 * Validates and uploads a manual audio file to the unified Books & Structures endpoint
 * (`/api/books-structures/audio/upload`), returning the persistent stream URL and metadata
 * to be bound 1-to-1 to the exact content block and saved in Firestore.
 */
export async function uploadAudioFileForContentNode(params: {
  file: File;
  entityType: OttAudioEntityType;
  entityId: string;
  blockRole: OttAudioBlockRole;
  uploadedByUid?: string;
}): Promise<UploadedContentAudioResult> {
  const validation = validateContentAudioFile({
    name: params.file.name,
    type: params.file.type,
    size: params.file.size,
  });
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid audio file.');
  }

  const [base64Data, detectedDurationSec] = await Promise.all([
    readFileAsBase64(params.file),
    detectBrowserAudioDurationSec(params.file),
  ]);

  const res = await fetch('/api/books-structures/audio/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityType: params.entityType,
      entityId: params.entityId,
      blockRole: params.blockRole,
      originalFilename: params.file.name,
      mimeType: validation.normalizedMime,
      base64Data,
      durationSec: detectedDurationSec,
      uploadedByUid: params.uploadedByUid,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    asset?: {
      id: string;
      originalFilename: string;
      storageUrl: string;
      mimeType: string;
      byteSize: number;
      durationSec: number;
      sha256Checksum: string;
    };
    audioUrl?: string;
    error?: string;
  };

  if (!res.ok || !payload.asset || !payload.audioUrl) {
    throw new Error(payload.error ?? `Audio upload failed (${res.status}).`);
  }

  const durationSec = detectedDurationSec ?? payload.asset.durationSec ?? 0;

  return {
    assetId: payload.asset.id,
    audioUrl: payload.audioUrl,
    fileName: payload.asset.originalFilename || params.file.name,
    mimeType: payload.asset.mimeType || validation.normalizedMime,
    byteSize: payload.asset.byteSize || params.file.size,
    durationSec,
    durationLabel: formatAudioDurationLabel(durationSec),
    sha256Checksum: payload.asset.sha256Checksum ?? '',
  };
}
