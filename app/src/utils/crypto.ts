import crypto from 'crypto'

function hexStringToByte(str: string) {
  const bytes = []
  for (let i = 0; i < str.length; i += 2) {
    bytes.push(parseInt(str.substr(i, 2), 16))
  }

  return new Uint8Array(bytes)
}

/**
 * Returns the equivalent of the first 20 bytes of the sha256 hash from the public key
 * @param publicKey Application's public key
 * @returns Application's address
 */
export function getAddressFromPublicKey(publicKey: string): string {
  return crypto
    .createHash('sha256')
    .update(hexStringToByte(publicKey))
    .digest('hex')
    .slice(0, 40)
}
