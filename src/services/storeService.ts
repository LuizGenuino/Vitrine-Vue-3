import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { StoreSettings } from '@/types';

const storesCollection = collection(db, 'stores');

const normalizeDoc = (id: string, data: Record<string, unknown>) => ({ id, ...data }) as StoreSettings;

export const storeService = {
  async getByOwner(ownerId: string) {
    const snapshot = await getDocs(query(storesCollection, where('ownerId', '==', ownerId), limit(1)));
    const docSnapshot = snapshot.docs[0];
    return docSnapshot ? normalizeDoc(docSnapshot.id, docSnapshot.data()) : null;
  },
  async getBySlug(slug: string) {
    const snapshot = await getDocs(query(storesCollection, where('slug', '==', slug), limit(1)));
    const docSnapshot = snapshot.docs[0];
    return docSnapshot ? normalizeDoc(docSnapshot.id, docSnapshot.data()) : null;
  },
  async save(payload: StoreSettings) {
    if (payload.id) {
      await setDoc(
        doc(db, 'stores', payload.id),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true },
      );
      return payload.id;
    }

    const response = await addDoc(storesCollection, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return response.id;
  },
};
