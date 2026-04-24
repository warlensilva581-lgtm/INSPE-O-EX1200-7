import { get, set, clear } from 'idb-keyval';

export const storage = {
  saveImages: async (images: Record<string, string | null>) => {
    // Only save the keys in one record, the content in others
    const keys = Object.keys(images);
    await set('diagramImages_keys', keys);
    for (const key of keys) {
      if (images[key]) {
        await set(`diag_${key}`, images[key]);
      }
    }
  },
  getImages: async (): Promise<Record<string, string | null>> => {
    const keys = (await get<string[]>('diagramImages_keys')) || [];
    const images: Record<string, string | null> = {};
    for (const key of keys) {
      images[key] = (await get(`diag_${key}`)) || null;
    }
    return images;
  },
  saveAnnotations: async (annotations: any) => {
    await set('diagramAnnotations', annotations);
  },
  getAnnotations: async (): Promise<any> => {
    return (await get('diagramAnnotations')) || {};
  },
  saveSelectedItems: async (items: any) => {
    // Store metadata separately from heavy binary data
    const metadata = await Promise.all(items.map(async (item: any) => {
      const { photo, annotations, ...rest } = item;
      
      // Save item photo
      if (photo && photo.startsWith('data:')) {
        const photoId = `item_${item.part.id}_${item.timestamp}`;
        await set(`img_${photoId}`, photo);
        rest.photo = `ref:${photoId}`;
      } else {
        rest.photo = photo;
      }

      // Save annotation photos
      if (annotations && annotations.length > 0) {
        rest.annotations = await Promise.all(annotations.map(async (ann: any) => {
          if (ann.photoUrl && ann.photoUrl.startsWith('data:')) {
            const annId = `ann_${ann.id}`;
            await set(`img_${annId}`, ann.photoUrl);
            return { ...ann, photoUrl: `ref:${annId}` };
          }
          return ann;
        }));
      } else {
        rest.annotations = annotations;
      }

      return rest;
    }));
    await set('selectedItems_meta', metadata);
  },
  getSelectedItems: async (): Promise<any> => {
    const metadata = (await get<any[]>('selectedItems_meta')) || [];
    return await Promise.all(metadata.map(async (item) => {
      // Restore item photo
      if (item.photo && item.photo.startsWith('ref:')) {
        item.photo = await get(item.photo.replace('ref:', 'img_'));
      }
      // Restore annotation photos
      if (item.annotations) {
        item.annotations = await Promise.all(item.annotations.map(async (ann: any) => {
          if (ann.photoUrl && ann.photoUrl.startsWith('ref:')) {
            return { ...ann, photoUrl: await get(ann.photoUrl.replace('ref:', 'img_')) };
          }
          return ann;
        }));
      }
      return item;
    }));
  },
  clearAll: async () => {
    await clear();
  }
};
