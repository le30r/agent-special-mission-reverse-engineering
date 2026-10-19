/**
 * Native Agent.exe object lookup (0x40a8dc -> 0x435404) compares names through
 * its uppercase-character table. Current SCC/resource identifiers are ASCII, so
 * JavaScript's deterministic uppercase mapping reproduces those lookups. Iteration
 * order is intentional: the original linear object list returns the first match.
 */
export function findNamedObject<T extends { name: string }>(
  objects: Iterable<T>,
  name: string,
): T | undefined {
  const wanted = name.toUpperCase();
  for (const object of objects) if (object.name.toUpperCase() === wanted) return object;
  return undefined;
}
