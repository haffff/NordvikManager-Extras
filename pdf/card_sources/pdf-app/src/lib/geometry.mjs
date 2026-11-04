// Annotations are stored in page fractions (0..1 of the page as pdf.js lays it out at scale 1,
// rotation applied), so they line up at any zoom and in every share of the same page.

const round4 = (n) => Math.round(n * 10000) / 10000;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** A screen rect ({ left, top, width, height }) as [x, y, w, h] of the page box, clipped; null when nothing is left. */
export function normRect(rect, page) {
  const left = Math.max(rect.left, page.left);
  const top = Math.max(rect.top, page.top);
  const right = Math.min(rect.left + rect.width, page.left + page.width);
  const bottom = Math.min(rect.top + rect.height, page.top + page.height);
  if (right - left <= 0 || bottom - top <= 0) return null;
  return [
    round4((left - page.left) / page.width), round4((top - page.top) / page.height),
    round4((right - left) / page.width), round4((bottom - top) / page.height),
  ];
}

/** A screen point as [x, y] of the page box, clamped onto the page. */
export function normPoint(clientX, clientY, page) {
  return [round4(clamp01((clientX - page.left) / page.width)), round4(clamp01((clientY - page.top) / page.height))];
}

/** The rect between two page points, in any order. */
export function rectFromPoints(a, b) {
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  return [round4(x), round4(y), round4(Math.abs(a[0] - b[0])), round4(Math.abs(a[1] - b[1]))];
}

/**
 * The rects of a text selection (one per text span, some empty) as one rect per line:
 * spans that overlap vertically by more than half are joined.
 */
export function mergeLineRects(rects) {
  const lines = [];
  const sorted = rects.filter((r) => r[2] >= 0.001 && r[3] >= 0.001).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const r of sorted) {
    const line = lines.find((l) => {
      const overlap = Math.min(l[1] + l[3], r[1] + r[3]) - Math.max(l[1], r[1]);
      return overlap > Math.min(l[3], r[3]) / 2;
    });
    if (!line) { lines.push(r.slice()); continue; }
    const x0 = Math.min(line[0], r[0]), y0 = Math.min(line[1], r[1]);
    const x1 = Math.max(line[0] + line[2], r[0] + r[2]), y1 = Math.max(line[1] + line[3], r[1] + r[3]);
    line[0] = x0; line[1] = y0; line[2] = x1 - x0; line[3] = y1 - y0;
  }
  return lines.map((l) => l.map(round4));
}

/** A drawn stroke with points closer than `step` (page fraction) to the last kept one dropped. */
export function simplifyPath(points, step) {
  if (points.length <= 2) return points.slice();
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1];
    if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= step) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}
