import { useState, useEffect, useSyncExternalStore } from 'react'
import { RpcStub } from 'capnweb'
import { AuthenticatedApi } from '@gadgets/workshop-shared/api'
import { avatarBlobUrl } from './avatarUtils'

// Simple in-memory LRU cache shared across all hook instances.
// Capped to prevent unbounded blob URL accumulation in long-lived sessions.
const MAX_CACHE_SIZE = 100
const avatarCache = new Map<string, string | null>()
const pendingFetches = new Map<string, Promise<string | null>>()

function cacheSet(userId: string, url: string | null) {
  // Evict oldest entry if at capacity (Map iteration order is insertion order).
  if (!avatarCache.has(userId) && avatarCache.size >= MAX_CACHE_SIZE) {
    const oldest = avatarCache.keys().next().value!
    const oldUrl = avatarCache.get(oldest)
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    avatarCache.delete(oldest)
  }
  avatarCache.set(userId, url)
}

// Per-user version counter. Incremented by invalidateAvatarCache() so live hook
// instances re-run their effect and re-fetch.
const cacheVersions = new Map<string, number>()
const versionListeners = new Set<() => void>()
function getVersion(userId: string): number {
  return cacheVersions.get(userId) ?? 0
}
function bumpVersion(userId: string) {
  cacheVersions.set(userId, getVersion(userId) + 1)
  for (const listener of versionListeners) listener()
}
function subscribeToVersions(listener: () => void): () => void {
  versionListeners.add(listener)
  return () => { versionListeners.delete(listener) }
}

/**
 * Fetch and cache a user's avatar as a blob URL.
 * Returns null while loading or if no avatar is set.
 */
export function useAvatar(
  authenticatedApi: RpcStub<AuthenticatedApi>,
  userId: string | null | undefined,
): string | null {
  // Subscribe to invalidation events for this user so all hook instances
  // re-render (and re-run their effect) when the cache is invalidated.
  const version = useSyncExternalStore(
    subscribeToVersions,
    () => (userId ? getVersion(userId) : 0),
    () => 0,
  )

  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    userId ? avatarCache.get(userId) ?? null : null,
  )

  useEffect(() => {
    if (!userId) {
      setAvatarUrl(null)
      return
    }

    // Already cached — use immediately
    if (avatarCache.has(userId)) {
      setAvatarUrl(avatarCache.get(userId)!)
      return
    }

    let cancelled = false

    // Deduplicate concurrent fetches for the same user
    let fetchPromise = pendingFetches.get(userId)
    if (!fetchPromise) {
      fetchPromise = authenticatedApi
        .getAvatar(userId)
        .then((data) => {
          if (data && data.byteLength > 0) {
            return avatarBlobUrl(data)
          }
          return null
        })
        .catch(() => null)
        .finally(() => {
          pendingFetches.delete(userId)
        })
      pendingFetches.set(userId, fetchPromise)
    }

    fetchPromise.then((url) => {
      cacheSet(userId, url)
      if (!cancelled) setAvatarUrl(url)
    })

    return () => {
      cancelled = true
    }
    // `version` is a re-fetch trigger: when invalidateAvatarCache bumps it,
    // the effect re-runs and picks up the new value (cache was cleared).
  }, [authenticatedApi, userId, version])

  return avatarUrl
}

/**
 * Invalidate the cache for a specific user (e.g. after uploading a new avatar).
 * Revokes the old blob URL and notifies all live useAvatar hook instances to re-fetch.
 */
export function invalidateAvatarCache(userId: string): void {
  const existing = avatarCache.get(userId)
  if (existing) {
    URL.revokeObjectURL(existing)
  }
  avatarCache.delete(userId)
  bumpVersion(userId)
}
