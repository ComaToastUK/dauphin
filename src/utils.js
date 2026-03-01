import crypto from 'crypto';

/**
 * Generate a random 20-byte peer ID
 */
export function generatePeerId() {
  return Buffer.from('-DA0100-' + crypto.randomBytes(12).toString('hex').slice(0, 12));
}

/**
 * Convert a buffer to hex string
 */
export function bufferToHex(buffer) {
  return buffer.toString('hex');
}

/**
 * Create info hash from torrent info dictionary
 */
export function infoHash(info) {
  const bencode = encode(info);
  return crypto.createHash('sha1').update(bencode).digest();
}

/**
 * Simple bencode encoder (for info hash calculation)
 */
function encode(obj) {
  if (Buffer.isBuffer(obj)) {
    return Buffer.concat([Buffer.from(obj.length + ':'), obj]);
  } else if (typeof obj === 'string') {
    return Buffer.from(obj.length + ':' + obj);
  } else if (typeof obj === 'number') {
    return Buffer.from('i' + obj + 'e');
  } else if (Array.isArray(obj)) {
    const encoded = obj.map(encode);
    return Buffer.concat([Buffer.from('l'), ...encoded, Buffer.from('e')]);
  } else if (typeof obj === 'object') {
    const encoded = [];
    Object.keys(obj).sort().forEach(key => {
      encoded.push(encode(key));
      encoded.push(encode(obj[key]));
    });
    return Buffer.concat([Buffer.from('d'), ...encoded, Buffer.from('e')]);
  }
}

/**
 * Format bytes to human readable format
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Group array into chunks of specified size
 */
export function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
