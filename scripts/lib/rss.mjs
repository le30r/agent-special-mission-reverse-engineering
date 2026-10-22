import path from 'node:path';

/** Original RSS: uint32 count followed by count × 92-byte directory entries. */
export function readRss(bytes) {
  if (bytes.length < 4) throw new Error('Truncated RSS header');
  const count = bytes.readUInt32LE(0);
  const tableEnd = 4 + count * 92;
  if (tableEnd > bytes.length) throw new Error('Truncated RSS directory');
  const entries = [], names = new Set();
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 92;
    const field = bytes.subarray(at, at + 80);
    const end = field.indexOf(0);
    const name = new TextDecoder('windows-1251').decode(field.subarray(0, end < 0 ? 80 : end)).replaceAll('\\', '/');
    if (!name || path.posix.isAbsolute(name) || name.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error(`Unsafe RSS path: ${name}`);
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate RSS path: ${name}`);
    names.add(name.toLowerCase());
    const offset = bytes.readUInt32LE(at + 80), size = bytes.readUInt32LE(at + 84);
    if (offset < tableEnd || offset + size > bytes.length) throw new Error(`Invalid RSS range: ${name}`);
    entries.push({ name, bytes: bytes.subarray(offset, offset + size) });
  }
  return entries;
}
