import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Product } from '@/types';
import { storeService } from './storeService';

const productsCollection = collection(db, 'products');

export const productService = {
    async listByOwner(ownerId: string) {
        const snapshot = await getDocs(query(productsCollection, where('ownerId', '==', ownerId), orderBy('createdAt', 'desc')));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Product[];
    },
    async listPublicByStoreSlug(storeSlug: string) {
        const store = await storeService.getBySlug(storeSlug);
        if (!store) return [];
        const snapshot = await getDocs(
            query(
                productsCollection,
                where('ownerId', '==', store.ownerId),
                where('status', '==', 'active'),
                orderBy('createdAt', 'desc'),
            ),
        );
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Product[];
    },
    async getPublicProductBySlug(storeSlug: string, productSlug: string) {
        const store = await storeService.getBySlug(storeSlug);
        if (!store) return null;
        const snapshot = await getDocs(
            query(
                productsCollection,
                where('ownerId', '==', store.ownerId),
                where('slug', '==', productSlug),
                limit(1),
            ),
        );
        const item = snapshot.docs[0];
        return item ? ({ id: item.id, ...item.data() } as Product) : null;
    },
    async save(payload: Product) {
        if (payload.id) {
            await setDoc(
                doc(db, 'products', payload.id),
                { ...payload, updatedAt: serverTimestamp() },
                { merge: true },
            );
            return payload.id;
        }
        const response = await addDoc(productsCollection, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return response.id;
    },
    async remove(id: string) {
        
        return deleteDoc(doc(db, 'products', id));
    },
};
