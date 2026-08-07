import { useState } from 'react'

interface AvatarProps {
  /** Image URL to display */
  src?: string
  /**
   * Background shown behind the image, for a logo that was drawn for a particular backdrop.
   *
   * Vendor logos are often single-colour glyphs — MCP's is white — so on a light surface they vanish
   * unless given the colour the vendor declares in `VendorDescription.color`. Ignored by the fallback,
   * which is theme-coloured text and reads correctly already.
   */
  background?: string
  /** Pixel size (width and height) */
  size?: number
  /** Fallback content when no image or image fails to load (icon, initials, etc.) */
  fallback?: React.ReactNode
  /** Additional inline styles (e.g., for absolute positioning) */
  style?: React.CSSProperties
  /** Additional CSS classes */
  className?: string
}

export default function Avatar(
  { src, background, size = 32, fallback, style, className = '' }: AvatarProps,
) {
  const [imgError, setImgError] = useState(false)

  const baseClasses = `rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${className}`

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setImgError(true)}
        className={baseClasses}
        style={{ width: size, height: size, objectFit: 'cover', backgroundColor: background, ...style }}
      />
    )
  }

  return (
    <div
      className={`${baseClasses} bg-kumo-tint text-kumo-subtle`}
      style={{ width: size, height: size, fontSize: size * 0.4, ...style }}
    >
      {fallback}
    </div>
  )
}
