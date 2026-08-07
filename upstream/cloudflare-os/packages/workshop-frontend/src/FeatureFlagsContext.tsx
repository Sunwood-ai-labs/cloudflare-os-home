import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RpcStub } from 'capnweb'
import {
  DEFAULT_UI_FEATURE_FLAGS,
  type UiFeatureFlagName,
  type UiFeatureFlags,
} from '@gadgets/workshop-shared/feature-flags'
import type { AuthenticatedApi } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from './AuthContext'

type FeatureFlagsContextValue = {
  flags: UiFeatureFlags
  loading: boolean
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { authenticatedApi } = useAuthenticatedApi()
  const [loaded, setLoaded] = useState<{
    api: RpcStub<AuthenticatedApi>
    flags: UiFeatureFlags
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadFlags() {
      try {
        const flags = await authenticatedApi.getUiFeatureFlags()
        if (!cancelled) {
          setLoaded({
            api: authenticatedApi,
            flags: { ...DEFAULT_UI_FEATURE_FLAGS, ...flags },
          })
        }
      } catch {
        if (!cancelled) {
          setLoaded({ api: authenticatedApi, flags: { ...DEFAULT_UI_FEATURE_FLAGS } })
        }
      }
    }
    void loadFlags()

    return () => { cancelled = true }
  }, [authenticatedApi])

  const value = loaded?.api === authenticatedApi
    ? { flags: loaded.flags, loading: false }
    : { flags: DEFAULT_UI_FEATURE_FLAGS, loading: true }

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>
}

export function useUiFeatureFlags() {
  const context = useContext(FeatureFlagsContext)
  if (!context) {
    throw new Error('useUiFeatureFlags must be used within FeatureFlagsProvider')
  }
  return context
}

export function useUiFeatureFlag(name: UiFeatureFlagName) {
  const { flags, loading } = useUiFeatureFlags()
  return { enabled: flags[name], loading }
}
