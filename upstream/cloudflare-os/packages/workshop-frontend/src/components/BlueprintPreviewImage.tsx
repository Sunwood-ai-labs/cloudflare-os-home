import { Hexagon } from '@phosphor-icons/react'
import { getGradient } from './BlueprintCard'

export function BlueprintPreviewImage({
  blueprintId,
  title,
  screenshotUrl,
  className,
}: {
  blueprintId: string
  title: string
  screenshotUrl?: string
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-kumo-line bg-kumo-tint ${className ?? ''}`}>
      {screenshotUrl ? (
        <img
          src={screenshotUrl}
          alt={`Screenshot of ${title}`}
          className="aspect-[16/9] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <BlueprintPreviewPlaceholder id={blueprintId} />
      )}
    </div>
  )
}

export function BlueprintPreviewPlaceholder({ id }: { id: string }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-kumo-base">
      <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(id)} opacity-[0.08]`} />
      <div className="absolute -left-10 top-6 h-28 w-28 rounded-full bg-kumo-brand/10 blur-3xl" />
      <div className="absolute -right-12 bottom-0 h-32 w-32 rounded-full bg-kumo-fill/30 blur-3xl" />
      <svg
        viewBox="0 0 640 360"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        <rect x="52" y="54" width="536" height="252" rx="18" className="fill-kumo-base stroke-kumo-line" />
        <rect x="84" y="86" width="132" height="12" rx="6" className="fill-kumo-line" opacity="0.8" />
        <rect x="84" y="116" width="312" height="10" rx="5" className="fill-kumo-line" opacity="0.45" />
        <rect x="84" y="142" width="472" height="1" className="fill-kumo-line" />
        {[0, 1, 2, 3, 4].map(row => (
          <g key={row} opacity={1 - row * 0.11}>
            <rect x="84" y={166 + row * 28} width="64" height="7" rx="3.5" className="fill-kumo-line" />
            <rect x="196" y={166 + row * 28} width="108" height="7" rx="3.5" className="fill-kumo-line" />
            <rect x="360" y={166 + row * 28} width="76" height="7" rx="3.5" className="fill-kumo-line" />
            <rect x="486" y={166 + row * 28} width="52" height="7" rx="3.5" className="fill-kumo-line" />
          </g>
        ))}
      </svg>
      <div className="absolute left-4 top-4 grid h-8 w-8 place-items-center rounded-xl bg-kumo-base/80 text-kumo-brand shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-kumo-line">
        <Hexagon size={14} weight="bold" />
      </div>
    </div>
  )
}
