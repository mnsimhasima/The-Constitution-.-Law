import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

let cachedS3Client: S3Client | null = null;
let cachedS3Sig = '';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function getSupabaseS3Endpoint(): string {
  return readEnv('SUPABASE_S3_ENDPOINT');
}

export function getSupabaseS3Region(): string {
  return readEnv('SUPABASE_S3_REGION') || 'ap-northeast-1';
}

export function getSupabaseS3Bucket(): string {
  return readEnv('SUPABASE_S3_BUCKET') || 'Constitution Files';
}

export function isSupabaseS3Configured(): boolean {
  const endpoint = getSupabaseS3Endpoint();
  const accessKeyId = readEnv('SUPABASE_S3_ACCESS_KEY_ID');
  const secretAccessKey = readEnv('SUPABASE_S3_SECRET_ACCESS_KEY');
  return Boolean(endpoint && accessKeyId && secretAccessKey && endpoint.startsWith('https://'));
}

export function getSupabaseS3Client(): S3Client | null {
  if (!isSupabaseS3Configured()) {
    return null;
  }
  const endpoint = getSupabaseS3Endpoint();
  const region = getSupabaseS3Region();
  const accessKeyId = readEnv('SUPABASE_S3_ACCESS_KEY_ID');
  const secretAccessKey = readEnv('SUPABASE_S3_SECRET_ACCESS_KEY');
  const sig = `${endpoint}|${region}|${accessKeyId.slice(0, 8)}|${secretAccessKey.length}`;

  if (cachedS3Client && cachedS3Sig === sig) {
    return cachedS3Client;
  }

  cachedS3Client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  cachedS3Sig = sig;
  return cachedS3Client;
}

/**
 * Sanitizes an S3 object key segment so path traversal and invalid characters are impossible.
 */
export function sanitizeS3Segment(value: string, fallback = 'node'): string {
  const cleaned = value
    .trim()
    .replace(/\.\.+/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 96);
  return cleaned || fallback;
}

/**
 * Builds the deterministic S3 object key for uploaded or seeded audio files.
 */
export function buildAudioS3Key(params: {
  entityType: string;
  entityId: string;
  assetId: string;
  ext: string;
}): string {
  const safeType = sanitizeS3Segment(params.entityType, 'audio');
  const safeEntity = sanitizeS3Segment(params.entityId, 'item');
  const safeAsset = sanitizeS3Segment(params.assetId, 'clip');
  const safeExt = params.ext.startsWith('.') ? params.ext.toLowerCase() : `.${params.ext.toLowerCase()}`;
  return `audio/${safeType}/${safeEntity}/${safeAsset}${safeExt}`;
}

/**
 * Constructs the Supabase public storage URL for an object inside a public bucket.
 * Handles bucket names containing spaces (e.g. "Constitution Files") safely via URL encoding.
 */
export function buildSupabasePublicObjectUrl(
  key: string,
  options?: { supabaseUrl?: string; bucket?: string }
): string {
  const baseUrl = (options?.supabaseUrl ?? readEnv('SUPABASE_URL')).replace(/\/+$/, '');
  const bucket = options?.bucket ?? getSupabaseS3Bucket();
  if (!baseUrl) return '';
  const encodedBucket = encodeURIComponent(bucket);
  const encodedKey = key
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${baseUrl}/storage/v1/object/public/${encodedBucket}/${encodedKey}`;
}

export async function uploadAudioToSupabaseS3(input: {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<{ bucket: string; key: string; publicUrl: string } | null> {
  const client = getSupabaseS3Client();
  if (!client) return null;

  const bucket = getSupabaseS3Bucket();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: input.metadata,
    })
  );

  return {
    bucket,
    key: input.key,
    publicUrl: buildSupabasePublicObjectUrl(input.key, { bucket }),
  };
}

export async function downloadAudioFromSupabaseS3(
  key: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const client = getSupabaseS3Client();
  if (!client || !key) return null;

  const bucket = getSupabaseS3Bucket();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: response.ContentType || 'audio/wav',
    };
  } catch {
    return null;
  }
}

export async function deleteAudioFromSupabaseS3(key: string): Promise<boolean> {
  const client = getSupabaseS3Client();
  if (!client || !key) return false;
  const bucket = getSupabaseS3Bucket();
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}
