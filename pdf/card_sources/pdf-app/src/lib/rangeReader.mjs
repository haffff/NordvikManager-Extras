// Reads byte ranges of a resource in whole, aligned chunks (so each chunk is one cache entry in
// the app), each fetched once, and hands back exactly the bytes asked for.

/**
 * readRange(start, length) → Promise<{ bytes } | null>, e.g. CardAPI.Resources.ReadRange bound
 * to a resource; chunkSize: bytes per chunk; total: the resource's size.
 */
export function createRangeReader(readRange, chunkSize, total) {
  const chunks = new Map(); // index → Promise<Uint8Array>

  const chunk = (index) => {
    if (!chunks.has(index)) {
      const start = index * chunkSize;
      const length = Math.min(chunkSize, total - start);
      const loading = readRange(start, length).then((part) => {
        if (!part?.bytes || part.bytes.length < length) throw new Error(`Bytes ${start}-${start + length} couldn't be read.`);
        return part.bytes;
      });
      loading.catch(() => chunks.delete(index)); // ask again next time
      chunks.set(index, loading);
    }
    return chunks.get(index);
  };

  return {
    total,
    /** The bytes from begin up to (not including) end, within the resource. */
    async read(begin, end) {
      const from = Math.max(0, begin);
      const to = Math.min(total, end);
      if (to <= from) return new Uint8Array(0);
      const first = Math.floor(from / chunkSize);
      const last = Math.floor((to - 1) / chunkSize);
      const parts = await Promise.all(Array.from({ length: last - first + 1 }, (_, i) => chunk(first + i)));
      const out = new Uint8Array(to - from);
      let offset = 0;
      parts.forEach((bytes, i) => {
        const chunkStart = (first + i) * chunkSize;
        const a = Math.max(from, chunkStart) - chunkStart;
        const b = Math.min(to, chunkStart + bytes.length) - chunkStart;
        out.set(bytes.subarray(a, b), offset);
        offset += b - a;
      });
      return out;
    },
  };
}
