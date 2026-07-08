export const storage = {
  async get(key, shared) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      throw new Error('not found');
    }
    return { key, value: raw, shared: !!shared };
  },
  async set(key, value, shared) {
    localStorage.setItem(key, value);
    return { key, value, shared: !!shared };
  },
  async delete(key, shared) {
    localStorage.removeItem(key);
    return { key, deleted: true, shared: !!shared };
  },
};
