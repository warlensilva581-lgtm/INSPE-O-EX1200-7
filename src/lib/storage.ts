import { get, set, clear } from 'idb-keyval';

export const storage = {
  saveImages: async (images: Record<string, string | null>) => {
    await set('diagramImages', images);
  },
  getImages: async (): Promise<Record<string, string | null>> => {
    return (await get('diagramImages')) || {};
  },
  clearAll: async () => {
    await clear();
  }
};
