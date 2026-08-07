import { useState } from 'react'
import { Loader } from '@cloudflare/kumo'
import {
  Code as CodeIcon,
  Database,
  Link as LinkIcon,
  Rocket,
  FileCode,
  MagnifyingGlass,
  Shield,
  Lightning,
  CheckCircle,
  WarningCircle,
  Clock,
} from '@phosphor-icons/react'
import type { ToolCall } from '../../data/chat'

const iconMap: Record<string, React.ElementType> = {
  code: CodeIcon,
  database: Database,
  connection: LinkIcon,
  deploy: Rocket,
  file: FileCode,
  search: MagnifyingGlass,
  shield: Shield,
  zap: Lightning,
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader size="sm" />
    case 'complete':
      return <CheckCircle size={14} weight="fill" className="text-kumo-success" />
    case 'error':
      return <WarningCircle size={14} weight="fill" className="text-kumo-danger" />
    case 'waiting':
      return <Clock size={14} className="text-kumo-subtle" />
    default:
      return null
  }
}

export default function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const Icon = iconMap[tool.icon] || Lightning

  return (
    <div className="rounded-lg border border-kumo-line overflow-hidden">
      {/* Custom trigger row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-kumo-tint transition-colors"
      >
        <Icon size={14} weight="duotone" className="text-kumo-subtle flex-shrink-0" />
        <span className="flex-1 text-xs text-kumo-default truncate">{tool.label}</span>
        {tool.duration != null && (
          <span className="font-mono text-[11px] text-kumo-subtle tabular-nums flex-shrink-0">
            {tool.duration >= 1000
              ? `${(tool.duration / 1000).toFixed(1)}s`
              : `${tool.duration}ms`}
          </span>
        )}
        <StatusIndicator status={tool.status} />
        <svg
          className={`w-3 h-3 text-kumo-subtle transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-kumo-line space-y-2">
          {tool.input && (
            <div>
              <span className="font-mono text-[10px] text-kumo-subtle uppercase tracking-wider">Input</span>
              <pre className="text-xs font-mono text-kumo-subtle whitespace-pre-wrap leading-relaxed mt-1 bg-kumo-tint rounded-md px-2 py-1.5">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <span className="font-mono text-[10px] text-kumo-subtle uppercase tracking-wider">Output</span>
              <p className="text-xs text-kumo-subtle mt-1">{tool.output}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
