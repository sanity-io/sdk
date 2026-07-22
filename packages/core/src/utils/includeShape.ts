/**
 * A response field that the API embeds only when its `include` token was
 * requested. Given the full set of tokens `All`, the token `Key` this field
 * maps to, and the tokens actually `Requested`, it resolves to:
 *
 * - `unknown` (field absent) when nothing — or nothing matching `Key` — was requested
 * - `Field` (present, as declared) when a literal request list contains `Key`
 * - `Partial<Field>` (optional) when `Requested` is the wide `All` union, i.e.
 *   an `include` array whose members aren't known at the type level
 *
 * Absent arms return `unknown` so they vanish under intersection. Mirrors the
 * `boolean extends Flag` trick the organization/project types use, but for an
 * include-token union rather than a boolean flag.
 *
 * @internal
 */
export type Included<All extends string, Key extends All, Requested extends All, Field> = [
  All,
] extends [Requested]
  ? Partial<Field>
  : [Key] extends [Requested]
    ? Field
    : unknown

/**
 * Whether the requested include tokens intersect a given set — used to decide
 * whether a parent field (e.g. an application's `activeDeployment`) is present,
 * when requesting any of several tokens forces it in.
 *
 * @internal
 */
export type IncludesAny<Requested extends string, Set extends string> = [Requested & Set] extends [
  never,
]
  ? false
  : true
