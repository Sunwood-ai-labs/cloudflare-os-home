// These types don't seem to be included in TypeScript yet?

interface Uint8Array {
  toHex(): string;
  toBase64(options?: { alphabet?: 'base64' | 'base64url' }): string;
}

interface Uint8ArrayConstructor {
  fromHex(hex: string): Uint8Array;
  fromBase64(base64: string, options?: { alphabet?: 'base64' | 'base64url'; lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial' }): Uint8Array;
}
