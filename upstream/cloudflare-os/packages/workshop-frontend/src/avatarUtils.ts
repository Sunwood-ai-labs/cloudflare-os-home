const MAX_AVATAR_BYTES = 50 * 1024 // 50 KB after compression
const AVATAR_SIZE = 256 // px, output dimensions

/**
 * Wrap `canvas.toBlob` in a promise. Rejects if the browser returns null,
 * which can happen if the canvas is tainted or the MIME type isn't supported.
 */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to encode image (canvas.toBlob returned null)'))
      },
      type,
      quality,
    )
  })
}

/** Resize & compress an image file to a 256×256 JPEG under 50 KB. */
export async function compressAvatar(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file)

  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get 2D canvas context')

  // Center-crop to square
  const size = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - size) / 2
  const sy = (bitmap.height - size) / 2
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bitmap.close()

  // Try decreasing quality until under the limit
  for (let quality = 0.85; quality >= 0.3; quality -= 0.1) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= MAX_AVATAR_BYTES) {
      return new Uint8Array(await blob.arrayBuffer())
    }
  }

  // Last resort: lowest quality
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.2)
  return new Uint8Array(await blob.arrayBuffer())
}

/** Create an object URL from a Uint8Array of image data. */
export function avatarBlobUrl(data: Uint8Array): string {
  // The Blob constructor accepts Uint8Array directly — no copy needed.
  // Cast is required because TS lib.dom.d.ts types BlobPart as requiring an
  // ArrayBuffer-backed view, but data from Cap'n Web RPC carries a broader
  // `ArrayBufferLike` buffer type. The underlying runtime behavior is fine.
  return URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/jpeg' }))
}
