// Canonical JSON snapshot: reject values JSON would silently drop or coerce.
export function snapshotFormData(value: Record<string, unknown>): Record<string, unknown> {
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): unknown => {
    if (depth > 32) throw new TypeError('CAPTCHA formData is too deeply nested');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || item === null || seen.has(item)) {
      throw new TypeError('CAPTCHA formData must contain only JSON values');
    }
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new TypeError('CAPTCHA formData must contain plain JSON objects');
    }
    seen.add(item);
    const result = Array.isArray(item)
      ? Array.from(item, child => visit(child, depth + 1))
      : Object.fromEntries(Object.keys(item).sort().map(key => [key, visit((item as Record<string, unknown>)[key], depth + 1)]));
    seen.delete(item);
    return Object.freeze(result);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('CAPTCHA formData is required and must be an object');
  }
  return visit(value, 0) as Record<string, unknown>;
}
