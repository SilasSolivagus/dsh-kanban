export class MemoryTable {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial))
  }
  get(key) { return this.map.get(key) }
  entries() { return this.map.entries() }
  keys() { return this.map.keys() }
  get size() { return this.map.size }
  async put(key, value) { this.map.set(key, value) }
  async delete(key) { return this.map.delete(key) }
  async update(key, fn) {
    const next = fn(this.map.get(key))
    this.map.set(key, next)
    return next
  }
}
