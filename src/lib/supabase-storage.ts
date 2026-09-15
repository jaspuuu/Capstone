/**
 * Supabase Storage driver (server-side only).
 *
 * Used when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are both present
 * (production). The service-role key authorizes all I/O and never reaches
 * the browser; the bucket is private, so objects are only readable through
 * application route handlers that re-check permissions per request.
 *
 * Implements the same three operations as the local-disk / Vercel Blob
 * drivers in attachments.ts: put, delete, read.
 */

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SUPABASE_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "organize-attachments";

export const SUPABASE_STORAGE_ENABLED = Boolean(URL && SERVICE_ROLE_KEY);

function storageBase(): string {
  return `${URL}/storage/v1`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apiKey: SERVICE_ROLE_KEY!,
  };
}

export async function ensureSupabaseStorageBucket(): Promise<void> {
  const listRes = await fetch(`${storageBase()}/bucket`, {
    headers: authHeaders(),
  });
  if (!listRes.ok) {
    throw new Error(`Supabase: unable to list buckets — ${listRes.status}`);
  }
  const buckets = (await listRes.json()) as Array<{ id: string }>;
  if (buckets.some((b) => b.id === SUPABASE_STORAGE_BUCKET)) return;

  const create = await fetch(`${storageBase()}/bucket`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: SUPABASE_STORAGE_BUCKET,
      name: SUPABASE_STORAGE_BUCKET,
      public: false,
    }),
  });
  if (!create.ok) {
    throw new Error(`Supabase: unable to create bucket — ${create.status}`);
  }
}

export async function supabaseStoragePut(
  key: string,
  bytes: Buffer,
  contentType: string
): Promise<void> {
  const res = await fetch(
    `${storageBase()}/object/${SUPABASE_STORAGE_BUCKET}/${key}`,
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(bytes),
    }
  );
  if (!res.ok) {
    throw new Error(`Supabase: upload failed — ${res.status}`);
  }
}

export async function supabaseStorageDelete(key: string): Promise<void> {
  await fetch(`${storageBase()}/object/${SUPABASE_STORAGE_BUCKET}/${key}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function supabaseStorageRead(key: string): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `${storageBase()}/object/${SUPABASE_STORAGE_BUCKET}/${key}`,
      { headers: authHeaders() }
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}