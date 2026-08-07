import { useEffect, useRef } from 'react'

const COLS = 22
const ROWS = 18

// Line color — neutral grey for the current (de-warmed) design system.
const LINE_R = 120
const LINE_G = 118
const LINE_B = 113

/**
 * Static perspective hexagonal mesh background. Draws a wireframe hex grid that recedes toward a
 * vanishing point — a quiet, premium brand backdrop. Rendered once (and on resize), no animation
 * loop. Zero dependencies, cleaned up on unmount.
 */
export default function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cssW = 0
    let cssH = 0

    // Project a flat-space point (fx, fy) in normalized coords into perspective.
    // fx: 0..1 across, fy: 0..1 depth (0=near/bottom, 1=far/top)
    const project = (
      fx: number,
      fy: number,
      w: number,
      h: number,
      t: number,
    ): [number, number] => {
      const vpX = w * 0.5
      const vpY = h * 0.15

      const depth = Math.max(0, Math.min(1, fy))
      const spread = 1 - depth * 0.85
      const x = vpX + (fx - 0.5) * w * 1.4 * spread
      const y = vpY + (1 - depth) * (h * 1.05 - vpY)

      // Layered sine displacement
      const wave1 = Math.sin(t * 0.6 + fx * 5 + fy * 3) * 8 * (1 - depth * 0.5)
      const wave2 = Math.sin(t * 0.35 + fx * 3 - fy * 7) * 5 * (1 - depth * 0.6)
      const wave3 = Math.cos(t * 0.2 + fx * 8 + fy * 2) * 3 * (1 - depth * 0.4)
      const wave4 = Math.sin(t * 0.8 + fx * 12 + fy * 5) * 2 * (1 - depth * 0.7)

      return [x + wave3 * 0.7 + wave4 * 0.3, y + wave1 + wave2]
    }

    // Build the hex grid as a set of edges in normalized flat-space.
    // Pointy-top hexagons tiled in an offset grid.
    // We pre-compute once; only the projection changes per frame.
    const hexH = 1 / ROWS           // height of one hex cell in normalized space
    const hexW = 1 / COLS            // width of one hex cell
    const rowH = hexH * 0.75         // vertical step between rows (3/4 of hex height)

    // Each edge is a pair of [fx, fy] endpoints in normalized flat-space
    type Edge = [[number, number], [number, number]]
    const edges: Edge[] = []

    // For a pointy-top hex centered at (cx, cy) with "radius" rx (half-width) and ry (half-height):
    // The 6 vertices are at angles 30, 90, 150, 210, 270, 330 degrees
    // In normalized coords:
    //   top:        (cx, cy - ry)
    //   top-right:  (cx + rx, cy - ry*0.5)
    //   bot-right:  (cx + rx, cy + ry*0.5)
    //   bottom:     (cx, cy + ry)
    //   bot-left:   (cx - rx, cy + ry*0.5)
    //   top-left:   (cx - rx, cy - ry*0.5)
    const rx = hexW * 0.55
    const ry = hexH * 0.5

    // Extend the grid beyond 0..1 to fill edges
    const extraCols = 3
    const extraRows = 3

    for (let r = -extraRows; r <= ROWS + extraRows; r++) {
      for (let c = -extraCols; c <= COLS + extraCols; c++) {
        const offset = (r % 2 !== 0) ? hexW * 0.5 : 0
        const cx = c * hexW + hexW * 0.5 + offset
        const cy = r * rowH + hexH * 0.5

        // 6 vertices of this hexagon (pointy-top)
        const v: [number, number][] = [
          [cx, cy - ry],             // 0: top
          [cx + rx, cy - ry * 0.5],  // 1: top-right
          [cx + rx, cy + ry * 0.5],  // 2: bot-right
          [cx, cy + ry],             // 3: bottom
          [cx - rx, cy + ry * 0.5],  // 4: bot-left
          [cx - rx, cy - ry * 0.5],  // 5: top-left
        ]

        // Only draw 3 of the 6 edges to avoid duplicates with neighbours:
        // top-right edge (0→1), right edge (1→2), bottom-right edge (2→3)
        edges.push([v[0], v[1]])
        edges.push([v[1], v[2]])
        edges.push([v[2], v[3]])
      }
    }

    // Pre-compute stroke styles for quantized alpha levels to avoid
    // allocating ~60k rgba strings per second.
    const ALPHA_STEPS = 64
    const strokeCache: string[] = Array.from({ length: ALPHA_STEPS })
    for (let i = 0; i < ALPHA_STEPS; i++) {
      const a = i / (ALPHA_STEPS - 1)
      strokeCache[i] = `rgba(${LINE_R}, ${LINE_G}, ${LINE_B}, ${a})`
    }

    // Static render — the spatial sine displacement (with t fixed) keeps the grid from looking
    // perfectly rigid, but nothing animates.
    const draw = () => {
      const w = cssW
      const h = cssH
      const t = 0

      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < edges.length; i++) {
        const [a, b] = edges[i]
        const [x1, y1] = project(a[0], a[1], w, h, t)
        const [x2, y2] = project(b[0], b[1], w, h, t)

        // Use average depth for alpha/width
        const avgDepth = Math.max(0, Math.min(1, (a[1] + b[1]) * 0.5))
        const nearness = 1 - avgDepth
        const alpha = 0.07 + nearness * 0.3
        const lw = 0.3 + nearness * 0.6

        const alphaIdx = Math.round(alpha * (ALPHA_STEPS - 1))
        ctx.strokeStyle = strokeCache[alphaIdx]
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      cssW = rect.width
      cssH = rect.height
      const dpr = window.devicePixelRatio || 1
      canvas.width = cssW * dpr
      canvas.height = cssH * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    return () => {
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}
