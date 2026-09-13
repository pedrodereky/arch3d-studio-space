// Reassina URLs do Supabase Storage on demand. As URLs assinadas guardadas no
// banco expiram (24h–30d) e quebram a biblioteca para sempre. Este hook
// extrai o `bucket/path` da URL antiga e gera uma signed URL fresca a cada
// sessão (TTL 1h, com cache em memória).
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TTL_SECONDS = 60 * 60; // 1h
const CACHE_TTL_MS = 50 * 60 * 1000; // re-sign 10min antes de expirar

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function parseStorageRef(
  url: string | null | undefined,
): { bucket: string; path: string } | null {
  if (!url || typeof url !== "string") return null;
  // Match /storage/v1/object/(sign|public|authenticated)/<bucket>/<path>?...
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  try {
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return { bucket: m[1], path: m[2] };
  }
}

async function signOne(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + CACHE_TTL_MS });
  return data.signedUrl;
}

/**
 * Recebe uma URL (possivelmente com token expirado) e devolve uma URL fresca.
 * Se a URL não for de Storage, devolve ela mesma.
 */
export function useFreshUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    const ref = parseStorageRef(url);
    if (!ref) return url ?? null;
    const hit = cache.get(`${ref.bucket}/${ref.path}`);
    return hit && hit.expiresAt > Date.now() ? hit.url : null;
  });

  useEffect(() => {
    let cancelled = false;
    const ref = parseStorageRef(url);
    if (!ref) {
      setResolved(url ?? null);
      return;
    }
    const hit = cache.get(`${ref.bucket}/${ref.path}`);
    if (hit && hit.expiresAt > Date.now()) {
      setResolved(hit.url);
      return;
    }
    void signOne(ref.bucket, ref.path).then((signed) => {
      if (!cancelled) setResolved(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}

/** Versão batch — devolve um mapa { urlOriginal: urlFresca }. */
export function useFreshUrls(urls: Array<string | null | undefined>): Record<string, string> {
  const key = urls.filter(Boolean).join("|");
  const [map, setMap] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const u of urls) {
      if (!u) continue;
      const ref = parseStorageRef(u);
      if (!ref) {
        out[u] = u;
        continue;
      }
      const hit = cache.get(`${ref.bucket}/${ref.path}`);
      if (hit && hit.expiresAt > Date.now()) out[u] = hit.url;
    }
    return out;
  });
  const lastKey = useRef<string>("");

  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      const tasks: Array<Promise<void>> = [];
      for (const u of urls) {
        if (!u) continue;
        const ref = parseStorageRef(u);
        if (!ref) {
          next[u] = u;
          continue;
        }
        const cacheKey = `${ref.bucket}/${ref.path}`;
        const hit = cache.get(cacheKey);
        if (hit && hit.expiresAt > Date.now()) {
          next[u] = hit.url;
          continue;
        }
        tasks.push(
          signOne(ref.bucket, ref.path).then((signed) => {
            if (signed) next[u] = signed;
          }),
        );
      }
      await Promise.all(tasks);
      if (!cancelled) setMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => map, [map]);
}
