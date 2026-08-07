import { useState, useEffect } from 'react'
import { Button } from '@cloudflare/kumo'
import { Badge } from '@cloudflare/kumo'
import { Text } from '@cloudflare/kumo'
import { Shield, X, Check } from '@phosphor-icons/react'
import { samplePermissions, type PermissionRequest } from '../../data/chat'
import { logoComponents } from '../ConnectionLogos'

function PermissionCard({
  perm,
  onGrant,
  onDeny,
}: {
  perm: PermissionRequest
  onGrant: () => void
  onDeny: () => void
}) {
  const [showScopes, setShowScopes] = useState(false)
  const Logo = logoComponents[perm.connectionLogo]

  if (perm.status !== 'pending') return null

  return (
    <div className="rounded-xl border border-kumo-line bg-kumo-base shadow-lg overflow-hidden animate-slide-in">
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-kumo-warning-tint">
          <Shield size={14} className="text-kumo-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-kumo-default">Permission requested</div>
          <div className="mt-0.5">
            <Text variant="secondary" size="xs" as="span">
              Workshop wants to access <strong>{perm.connectionName}</strong>
            </Text>
          </div>
        </div>
        <button
          onClick={onDeny}
          className="p-1 text-kumo-subtle hover:text-kumo-default rounded-md hover:bg-kumo-tint transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Connection info — click to toggle details */}
      <button
        onClick={() => setShowScopes(!showScopes)}
        className="mx-3 px-3 py-2 rounded-lg bg-kumo-tint flex items-center gap-2.5 w-[calc(100%-1.5rem)] text-left hover:bg-kumo-fill/40 transition-colors cursor-pointer"
      >
        {Logo && <Logo size={16} />}
        <Text variant="body" size="sm" bold as="span">{perm.connectionName}</Text>
        <div className="ml-auto flex items-center gap-1.5">
          <Badge variant="secondary">
            {perm.scopes.length} {perm.scopes.length === 1 ? 'scope' : 'scopes'}
          </Badge>
          <svg
            className={`w-3.5 h-3.5 text-kumo-subtle transition-transform ${showScopes ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Details (expanded): resources + scopes */}
      {showScopes && (
        <div className="mx-3 mt-1.5 space-y-1.5">
          {/* Resources being accessed */}
          {perm.resources && perm.resources.length > 0 && (
            <div className="px-3 py-2 rounded-md bg-kumo-tint/50">
              <span className="font-mono text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">
                Resources
              </span>
              {perm.resources.map((res) => (
                <div key={res} className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-kumo-brand flex-shrink-0" />
                  <span className="text-xs text-kumo-default truncate">{res}</span>
                </div>
              ))}
            </div>
          )}
          {/* API scopes */}
          <div className="px-3 py-2 rounded-md bg-kumo-tint/50">
            <span className="font-mono text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1">
              API scopes
            </span>
            {perm.scopes.map((scope) => (
              <div key={scope} className="font-mono text-xs text-kumo-subtle">{scope}</div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 p-3 pt-2">
        <Button variant="outline" size="sm" onClick={onDeny} className="w-full justify-center">
          Deny
        </Button>
        <Button variant="primary" size="sm" onClick={onGrant} className="w-full justify-center">
          Allow access
        </Button>
      </div>
    </div>
  )
}

export default function PermissionToasts() {
  const [permissions, setPermissions] = useState<PermissionRequest[]>([])
  const [grantedToast, setGrantedToast] = useState<string | null>(null)

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPermissions([{ ...samplePermissions[0], status: 'pending' }])
    }, 2000)
    const t2 = setTimeout(() => {
      setPermissions((prev) => [
        ...prev,
        { ...samplePermissions[1], status: 'pending' },
      ])
    }, 5000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  function handleGrant(id: string) {
    const perm = permissions.find((p) => p.id === id)
    setPermissions((prev) => prev.filter((p) => p.id !== id))
    if (perm) {
      setGrantedToast(perm.connectionName)
      setTimeout(() => setGrantedToast(null), 3000)
    }
  }

  function handleDeny(id: string) {
    setPermissions((prev) => prev.filter((p) => p.id !== id))
  }

  const pending = permissions.filter((p) => p.status === 'pending')

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {grantedToast && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-kumo-line bg-kumo-base shadow-lg animate-slide-in">
          <div className="w-5 h-5 rounded-full flex items-center justify-center bg-kumo-success-tint">
            <Check size={11} className="text-kumo-success" />
          </div>
          <span className="text-xs text-kumo-default">
            <strong>{grantedToast}</strong> access granted
          </span>
        </div>
      )}

      {pending.map((perm) => (
        <PermissionCard
          key={perm.id}
          perm={perm}
          onGrant={() => handleGrant(perm.id)}
          onDeny={() => handleDeny(perm.id)}
        />
      ))}
    </div>
  )
}
