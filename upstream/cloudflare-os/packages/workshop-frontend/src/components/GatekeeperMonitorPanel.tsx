import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { RpcStub } from 'capnweb'
import {
  ArrowsClockwise,
  ClockCounterClockwise,
  Eye,
  Globe,
  Pulse,
  ShieldCheck,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react'
import type { AdminApi, GatekeeperAuditEvent } from '@gadgets/workshop-shared/api'

type Props = {
  admin: RpcStub<AdminApi>
}

const OPERATION_LABELS: Record<string, string> = {
  'observation.recorded': 'Observation recorded',
  'action.requested': 'Action requested',
  'action.approved': 'Action approved',
  'action.rejected': 'Action rejected',
  'action.blocked': 'Action blocked by policy',
  'hook.bound': 'Hook bound',
  'hook.enabled': 'Hook enabled',
  'hook.disabled': 'Hook disabled',
}

function formatTime(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function actorLabel(event: GatekeeperAuditEvent): string {
  if (event.actorName) return event.actorName
  if (event.actorId) return event.actorId
  return event.actor
}

function targetLabel(event: GatekeeperAuditEvent): string {
  if (event.kind === 'network') {
    return `${event.method ?? '—'} ${event.host ?? 'unknown host'}${event.path ?? '/'}`
  }
  return event.resourceTitle ?? (event.vendorId ? `${event.vendorId} gatekeeper` : 'Gatekeeper')
}

function EventPill({ event }: { event: GatekeeperAuditEvent }) {
  const error = event.outcome === 'error' || event.outcome === 'rejected'
  const pending = event.outcome === 'pending'
  const label = event.kind === 'network'
    ? (event.status === undefined ? event.outcome : String(event.status))
    : event.outcome ?? 'recorded'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        error
          ? 'border-kumo-danger/30 bg-kumo-danger-tint text-kumo-danger'
          : pending
            ? 'border-kumo-warning/30 bg-kumo-warning-tint text-kumo-warning'
            : 'border-kumo-success/30 bg-kumo-success-tint text-kumo-success'
      }`}
    >
      {label}
    </span>
  )
}

function DetailField({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === '') return null
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-kumo-inactive">
        {label}
      </dt>
      <dd className="mt-1 break-words text-[11px] text-kumo-subtle">{value}</dd>
    </div>
  )
}

function AuditDetails({ event }: { event: GatekeeperAuditEvent }) {
  const fields: Array<[string, string | number | undefined]> = event.kind === 'network'
    ? [
        ['Event ID', event.id],
        ['Time', formatTime(event.timestamp)],
        ['Actor type', event.actor],
        ['Actor ID', event.actorId],
        ['Actor name', event.actorName],
        ['Operation', event.operation],
        ['Method', event.method],
        ['Host', event.host],
        ['Path', event.path],
        ['HTTP status', event.status],
        ['Duration', event.durationMs === undefined ? undefined : String(event.durationMs) + ' ms'],
        ['Outcome', event.outcome],
        ['Vendor', event.vendorId],
        ['Gatekeeper ID', event.gatekeeperId],
        ['Workspace ID', event.workspaceId],
        ['Chat ID', event.chatId],
      ]
    : [
        ['Event ID', event.id],
        ['Time', formatTime(event.timestamp)],
        ['Actor type', event.actor],
        ['Actor ID', event.actorId],
        ['Actor name', event.actorName],
        ['Operation', event.operation],
        ['Outcome', event.outcome],
        ['Policy code', event.policyCode],
        ['Policy reason', event.policyReason],
        ['Resource', event.resourceTitle],
        ['Resource URL', event.resourceUrl],
        ['Vendor', event.vendorId],
        ['Action ID', event.actionId],
        ['Gatekeeper ID', event.gatekeeperId],
        ['Workspace ID', event.workspaceId],
        ['Gadget ID', event.gadgetId],
        ['Chat ID', event.chatId],
      ]

  return (
    <dl className="grid gap-x-4 gap-y-3 border-t border-kumo-line/80 bg-kumo-recessed/30 px-3 py-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map(([label, value]) => (
        <DetailField key={label} label={label} value={value} />
      ))}
      <div className="sm:col-span-2 xl:col-span-3">
        <p className="text-[10px] leading-4 text-kumo-inactive">
          Metadata only. Request bodies, headers, query strings, tokens, and provider response data are not recorded.
        </p>
      </div>
    </dl>
  )
}

function EmptyStream({ message }: { message: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-kumo-line bg-kumo-recessed/35 px-5 text-center">
      <Pulse size={20} className="mb-2 text-kumo-inactive" />
      <p className="max-w-md text-xs leading-5 text-kumo-subtle">{message}</p>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-xl border border-kumo-line bg-kumo-base/75 p-4 shadow-[var(--shadow-stack)] transition-colors hover:bg-kumo-tint/70">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-kumo-inactive">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-kumo-strong">{value}</div>
      <div className="mt-1 text-[11px] text-kumo-subtle">{detail}</div>
    </div>
  )
}

function OperationRow({ event }: { event: GatekeeperAuditEvent }) {
  return (
    <details className="border-b border-kumo-line/80 last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kumo-info-tint text-kumo-info">
          <Eye size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-kumo-default">
            {OPERATION_LABELS[event.operation] ?? event.operation}
          </div>
          <div className="mt-1 truncate text-[11px] text-kumo-subtle">
            {actorLabel(event)} · {targetLabel(event)}
          </div>
        </div>
        <div className="text-right">
          <EventPill event={event} />
          <div className="mt-1 whitespace-nowrap font-mono text-[10px] text-kumo-inactive">
            {formatTime(event.timestamp)}
          </div>
        </div>
      </summary>
      <AuditDetails event={event} />
    </details>
  )
}

function NetworkRow({ event }: { event: GatekeeperAuditEvent }) {
  const statusError = event.outcome === 'error' || (event.status !== undefined && event.status >= 400)
  return (
    <details className="border-b border-kumo-line/80 last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statusError ? 'bg-kumo-danger-tint text-kumo-danger' : 'bg-kumo-success-tint text-kumo-success'}`}>
          <Globe size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] text-kumo-default">
            {event.method ?? '—'} {event.host ?? 'unknown host'}{event.path ?? '/'}
          </div>
          <div className="mt-1 truncate text-[11px] text-kumo-subtle">
            {actorLabel(event)} · {event.vendorId ?? 'gatekeeper'}
          </div>
        </div>
        <div className="text-right">
          <EventPill event={event} />
          <div className="mt-1 whitespace-nowrap font-mono text-[10px] text-kumo-inactive">
            {event.durationMs === undefined ? '—' : `${event.durationMs} ms`}
          </div>
        </div>
      </summary>
      <AuditDetails event={event} />
    </details>
  )
}

export default function GatekeeperMonitorPanel({ admin }: Props) {
  const [events, setEvents] = useState<GatekeeperAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  const loadEvents = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const next = await admin.listGatekeeperAuditEvents(200)
      setEvents(next)
      setUpdatedAt(new Date().toISOString())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Telemetry stream unavailable')
    } finally {
      if (initial) setLoading(false)
    }
  }, [admin])

  useEffect(() => {
    void loadEvents(true)
    const timer = window.setInterval(() => void loadEvents(), 3000)
    return () => window.clearInterval(timer)
  }, [loadEvents])

  const operations = useMemo(() => events.filter((event) => event.kind === 'operation'), [events])
  const network = useMemo(() => events.filter((event) => event.kind === 'network'), [events])
  const errors = useMemo(
    () => events.filter((event) => event.outcome === 'error' || event.outcome === 'rejected').length,
    [events],
  )
  const actors = useMemo(
    () => new Set(events.map((event) => event.actorId ?? event.actor)).size,
    [events],
  )

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-kumo-line border-l-4 border-l-kumo-brand bg-kumo-elevated p-5 text-kumo-default shadow-[var(--shadow-stack)]">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-kumo-brand/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-kumo-brand">
              <ShieldCheck size={14} />
              Gatekeeper / Observability
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">Activity and transport trace</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-kumo-subtle">
              Deployment-wide admin telemetry. See which actor requested an operation and which MCP
              read-tool HTTP requests were actually observed.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-kumo-success/30 bg-kumo-success-tint px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-kumo-success">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kumo-success" />
              polling / 3s
            </span>
            <button
              type="button"
              onClick={() => void loadEvents()}
              className="rounded-lg border border-kumo-line bg-kumo-control p-2 text-kumo-subtle transition hover:border-kumo-fill hover:bg-kumo-tint hover:text-kumo-default"
              aria-label="Refresh telemetry"
            >
              <ArrowsClockwise size={17} />
            </button>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Pulse size={14} />} label="Events" value={events.length} detail="ring buffer / newest 200" />
          <Metric icon={<Eye size={14} />} label="Operations" value={operations.length} detail="approval + observation trail" />
          <Metric icon={<Globe size={14} />} label="Network" value={network.length} detail="MCP read-call HTTP only" />
          <Metric icon={<UsersThree size={14} />} label="Actors" value={actors} detail={errors ? `${errors} error or rejected` : 'no errors recorded'} />
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-kumo-danger/30 bg-kumo-danger-tint px-4 py-3 text-sm text-kumo-danger">
          <WarningCircle size={18} />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void loadEvents()} className="font-medium underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-kumo-line bg-kumo-elevated p-5 text-kumo-default shadow-[var(--shadow-stack)]">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-kumo-info">Control plane</div>
              <h3 className="mt-1 text-base font-semibold">Who did what</h3>
            </div>
            <span className="font-mono text-[10px] text-kumo-inactive">{operations.length} records</span>
          </div>
          {loading ? (
            <div className="min-h-32 animate-pulse rounded-xl bg-kumo-tint/70" />
          ) : operations.length === 0 ? (
            <EmptyStream message="No operation has reached the audit stream yet. Run a real Gatekeeper read or submit an approval-gated action to populate this panel." />
          ) : (
            <div>{operations.slice(0, 8).map((event) => <OperationRow key={event.id} event={event} />)}</div>
          )}
        </section>

        <section className="rounded-2xl border border-kumo-line bg-kumo-elevated p-5 text-kumo-default shadow-[var(--shadow-stack)]">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-kumo-success">Data plane</div>
              <h3 className="mt-1 text-base font-semibold">What was communicated</h3>
            </div>
            <span className="font-mono text-[10px] text-kumo-inactive">{network.length} requests</span>
          </div>
          {loading ? (
            <div className="min-h-32 animate-pulse rounded-xl bg-kumo-tint/70" />
          ) : network.length === 0 ? (
            <EmptyStream message="No MCP read-tool HTTP request has been observed yet. Connection setup, tools/list, approved writes, provider-specific fetches, and non-MCP Gatekeepers are outside this first experimental slice." />
          ) : (
            <div>{network.slice(0, 8).map((event) => <NetworkRow key={event.id} event={event} />)}</div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-kumo-line bg-kumo-elevated p-5 text-kumo-default shadow-[var(--shadow-stack)]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-kumo-inactive">Event stream</div>
            <h3 className="mt-1 text-base font-semibold">Latest signals</h3>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-kumo-inactive">
            <span className="inline-flex items-center gap-1.5"><ClockCounterClockwise size={13} /> {updatedAt ? `updated ${formatTime(updatedAt)}` : 'waiting'}</span>
          </div>
        </div>
        {events.length === 0 ? (
          <EmptyStream message="The stream is empty. This is a real-data view; it does not seed sample traffic." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-kumo-line">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-kumo-line bg-kumo-tint/70 font-mono text-[10px] uppercase tracking-[0.12em] text-kumo-inactive">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Actor</th>
                  <th className="px-3 py-2.5 font-medium">Target / route</th>
                  <th className="px-3 py-2.5 font-medium">Result</th>
                  <th className="px-3 py-2.5 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kumo-line/80">
                {events.slice(0, 20).map((event) => {
                  const expanded = expandedEventId === event.id
                  return (
                    <Fragment key={event.id}>
                      <tr className="bg-kumo-base/35 transition hover:bg-kumo-tint/70">
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] text-kumo-inactive">{formatTime(event.timestamp)}</td>
                        <td className="px-3 py-3 text-kumo-subtle">{event.kind === 'network' ? 'network' : 'operation'}</td>
                        <td className="max-w-40 truncate px-3 py-3 text-kumo-default">{actorLabel(event)}</td>
                        <td className="max-w-[24rem] truncate px-3 py-3 font-mono text-[11px] text-kumo-subtle">{targetLabel(event)}</td>
                        <td className="px-3 py-3"><EventPill event={event} /></td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedEventId(expanded ? null : event.id)}
                            className="rounded-md border border-kumo-line bg-kumo-control px-2 py-1 font-mono text-[10px] text-kumo-subtle transition hover:border-kumo-fill hover:bg-kumo-tint hover:text-kumo-default"
                            aria-expanded={expanded}
                          >
                            {expanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-kumo-recessed/20">
                          <td colSpan={6} className="p-0">
                            <AuditDetails event={event} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="px-1 text-xs leading-5 text-kumo-subtle">
        Experimental scope: operation events are deployment-wide and admin-only; transport events
        currently cover MCP read-tool requests. Connection setup, tools/list, approved writes,
        provider-specific fetches, and non-MCP Gatekeepers are not yet covered. Payloads, headers,
        query strings, tokens, and provider response data are intentionally excluded.
      </p>
    </div>
  )
}
