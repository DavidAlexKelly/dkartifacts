/**
 * A binary min-heap over two parallel typed arrays.
 *
 * The open set of an A* over a 1500 m grid holds tens of thousands of entries
 * and is pushed and popped millions of times per long route. An array of
 * `{ f, node }` objects allocates one object per push — hundreds of thousands
 * of short-lived allocations that turn a routing call into a garbage-collection
 * event, visible as a stutter on the map.
 *
 * Keys and values live in a Float64Array and an Int32Array that double when
 * full, so steady-state routing allocates nothing at all.
 *
 * Entries are never decreased in place. A* pushes a duplicate with the better
 * key and skips any pop it has already closed — the standard "lazy deletion"
 * trade, which costs a little memory and saves maintaining an index-of-node
 * map on the hot path.
 */

export interface MinHeap {
  readonly size: number;
  push(key: number, value: number): void;
  /** Lowest-key value, or -1 when empty. */
  pop(): number;
  /** Lowest key, or Infinity when empty. */
  peekKey(): number;
  clear(): void;
}

export function createMinHeap(initialCapacity = 1024): MinHeap {
  let capacity = Math.max(16, initialCapacity);
  let keys = new Float64Array(capacity);
  let values = new Int32Array(capacity);
  let size = 0;

  const grow = () => {
    capacity *= 2;
    const nextKeys = new Float64Array(capacity);
    const nextValues = new Int32Array(capacity);
    nextKeys.set(keys);
    nextValues.set(values);
    keys = nextKeys;
    values = nextValues;
  };

  return {
    get size() {
      return size;
    },

    push(key, value) {
      if (size === capacity) {grow();}
      let i = size++;
      keys[i] = key;
      values[i] = value;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (keys[parent] <= keys[i]) {break;}
        const k = keys[parent];
        const v = values[parent];
        keys[parent] = keys[i];
        values[parent] = values[i];
        keys[i] = k;
        values[i] = v;
        i = parent;
      }
    },

    pop() {
      if (size === 0) {return -1;}
      const top = values[0];
      size -= 1;
      if (size > 0) {
        keys[0] = keys[size];
        values[0] = values[size];
        let i = 0;
        for (;;) {
          const left = 2 * i + 1;
          if (left >= size) {break;}
          const right = left + 1;
          const child = right < size && keys[right] < keys[left] ? right : left;
          if (keys[i] <= keys[child]) {break;}
          const k = keys[child];
          const v = values[child];
          keys[child] = keys[i];
          values[child] = values[i];
          keys[i] = k;
          values[i] = v;
          i = child;
        }
      }
      return top;
    },

    peekKey() {
      return size === 0 ? Infinity : keys[0];
    },

    clear() {
      size = 0;
    },
  };
}
