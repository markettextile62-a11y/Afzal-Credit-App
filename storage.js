// Simple localStorage wrapper with the same get/set shape used inside Claude artifacts,
// so App.jsx barely had to change when moving out of Claude into a real deployment.
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
