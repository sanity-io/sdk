/**
 * Returns a shallow copy of the object with the specified key removed.
 * @internal
 */
export function omit<T extends object, K extends keyof T>(
  obj: T | null | undefined,
  key: K,
): Omit<T, K> {
  if (obj == null) return {} as Omit<T, K>
  const {[key]: _, ...rest} = obj
  return rest
}
