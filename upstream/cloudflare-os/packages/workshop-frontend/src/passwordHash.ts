import { SERVICE_SALT } from '@gadgets/workshop-shared/api'

/**
 * Hash a password using Argon2id for authentication.
 *
 * The hash-wasm library is dynamically imported to keep it out of the main bundle,
 * since the WASM binary is only needed during login/signup/password-change flows.
 *
 * @param username - The user's username (used as part of the salt)
 * @param password - The user's plaintext password
 * @returns The password hash as a Uint8Array
 */
export async function hashPassword(username: string, password: string): Promise<Uint8Array> {
  // Dynamic import - Vite will split this into a separate chunk
  const { argon2id } = await import('hash-wasm')

  // Build salt: SERVICE_SALT + utf8(username)
  const usernameBuf = new TextEncoder().encode(username)
  const salt = new Uint8Array(SERVICE_SALT.length + usernameBuf.length)
  salt.set(SERVICE_SALT)
  salt.set(usernameBuf, SERVICE_SALT.length)

  const hash = await argon2id({
    password,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MiB in KiB
    hashLength: 32,
    outputType: 'binary',
  })

  return hash
}
