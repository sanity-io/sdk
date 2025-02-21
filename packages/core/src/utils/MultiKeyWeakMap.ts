interface MultiKeyWeakMapNode {
  value: unknown
  next: WeakMap<object, MultiKeyWeakMapNode>
}

export class MultiKeyWeakMap<T = unknown> {
  // The root of our nested WeakMap structure.
  #rootMap = new WeakMap<object, MultiKeyWeakMapNode>()

  // Instead of random IDs, we use a counter for deterministic IDs.
  static #globalIdCounter = 0
  // Each instance keeps a cache mapping a key to its assigned ID.
  #idCache = new WeakMap<object, number>()

  /**
   * Assigns a numeric ID to the key.
   */
  #assignId(key: object): number {
    const cachedId = this.#idCache.get(key)
    if (cachedId !== undefined) return cachedId

    const id = MultiKeyWeakMap.#globalIdCounter
    this.#idCache.set(key, id)
    MultiKeyWeakMap.#globalIdCounter++
    return id
  }

  /**
   * Remove duplicate keys and arrange them in a consistent order
   * by sorting according to their assigned IDs.
   */
  #arrangeKeys(keys: object[]): object[] {
    const uniqueKeys = Array.from(new Set(keys))
    const keyed = uniqueKeys.map((key) => [this.#assignId(key), key] as const)
    keyed.sort((a, b) => a[0] - b[0])
    return keyed.map(([, key]) => key)
  }

  /**
   * Recursively search the nested WeakMap structure for the value.
   */
  #getDeep(keys: object[], map: WeakMap<object, MultiKeyWeakMapNode>): unknown {
    if (keys.length === 0) return undefined

    const [firstKey, ...restKeys] = keys
    const node = map.get(firstKey)
    if (!node) return undefined
    if (restKeys.length === 0) return node.value
    return this.#getDeep(restKeys, node.next)
  }

  /**
   * Recursively create nodes along the key chain until the final key
   * is reached, then assign the value.
   */
  #setDeep(keys: object[], map: WeakMap<object, MultiKeyWeakMapNode>, value: unknown): void {
    if (keys.length === 0) return

    const [firstKey, ...restKeys] = keys
    let node = map.get(firstKey)
    if (!node) {
      node = {
        value: undefined,
        next: new WeakMap(),
      }
      map.set(firstKey, node)
    }

    if (restKeys.length === 0) {
      node.value = value
    } else {
      this.#setDeep(restKeys, node.next, value)
    }
  }

  /**
   * Retrieves the value associated with the array of keys.
   * The keys are de-duplicated and sorted so that the order does not matter.
   */
  get(keys: object[]): T | undefined {
    const arrangedKeys = this.#arrangeKeys(keys)
    return this.#getDeep(arrangedKeys, this.#rootMap) as T | undefined
  }

  /**
   * Associates the value with the given array of keys.
   */
  set(keys: object[], value: T): void {
    const arrangedKeys = this.#arrangeKeys(keys)
    this.#setDeep(arrangedKeys, this.#rootMap, value)
  }
}
