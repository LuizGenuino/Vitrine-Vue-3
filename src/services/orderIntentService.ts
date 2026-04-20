import { addDoc, collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import type { OrderIntent } from '@/types';
import { db } from './firebase';

const orderIntentsCollection = collection(db, 'orderIntents');

export const orderIntentService = {
  async create(payload: OrderIntent) {
    return addDoc(orderIntentsCollection, payload);
  },
  async listByOwner(storeOwnerId: string) {
    const snapshot = await getDocs(
      query(orderIntentsCollection, where('storeOwnerId', '==', storeOwnerId), orderBy('createdAt', 'desc')),
    );
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as OrderIntent[];
  },
};
