import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedAdminClient: SupabaseClient | null = null;
let cachedSignature = '';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function getSupabaseUrl(): string {
  return readEnv('SUPABASE_URL');
}

export function getSupabaseServiceRoleKey(): string {
  return readEnv('SUPABASE_SERVICE_ROLE_KEY') || readEnv('SUPABASE_SECRET_KEY');
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  return Boolean(url && key && url.startsWith('https://'));
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  const sig = `${url}|${key.slice(0, 12)}|${key.length}`;
  if (cachedAdminClient && cachedSignature === sig) {
    return cachedAdminClient;
  }
  cachedAdminClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedSignature = sig;
  return cachedAdminClient;
}

export interface SupabaseRuntimeStatus {
  databaseProvider: 'supabase' | 'local-fallback';
  configured: boolean;
  s3Configured: boolean;
  s3Bucket: string;
  s3Region: string;
}

export function getSupabaseRuntimeStatus(): SupabaseRuntimeStatus {
  const s3Endpoint = readEnv('SUPABASE_S3_ENDPOINT');
  const s3KeyId = readEnv('SUPABASE_S3_ACCESS_KEY_ID');
  const s3Secret = readEnv('SUPABASE_S3_SECRET_ACCESS_KEY');
  const s3Bucket = readEnv('SUPABASE_S3_BUCKET') || 'Constitution Files';
  const s3Region = readEnv('SUPABASE_S3_REGION') || 'ap-northeast-1';
  const configured = isSupabaseConfigured();
  const s3Configured = Boolean(s3Endpoint && s3KeyId && s3Secret && s3Endpoint.startsWith('https://'));

  return {
    databaseProvider: configured ? 'supabase' : 'local-fallback',
    configured,
    s3Configured,
    s3Bucket,
    s3Region,
  };
}
