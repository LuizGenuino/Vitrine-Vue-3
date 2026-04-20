import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    setDoc,
    where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Category, Subcategory } from '@/types';

const categoriesCollection = collection(db, 'categories');
const subcategoriesCollection = collection(db, 'subcategories');

export const categoryService = {
    async listCategories(ownerId: string) {
        const snapshot = await getDocs(query(categoriesCollection, where('ownerId', '==', ownerId)));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Category[];
    },
    async listSubcategories(ownerId: string) {
        const snapshot = await getDocs(query(subcategoriesCollection, where('ownerId', '==', ownerId)));
        return snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Subcategory[];
    },
    async saveCategory(payload: Category) {
        if (payload.id) {
            await setDoc(doc(db, 'categories', payload.id), payload, { merge: true });
            return payload.id;
        }
        const response = await addDoc(categoriesCollection, payload);
        return response.id;
    },
    async saveSubcategory(payload: Subcategory) {
        if (payload.id) {
            await setDoc(doc(db, 'subcategories', payload.id), payload, { merge: true });
            return payload.id;
        }
        const response = await addDoc(subcategoriesCollection, payload);
        return response.id;
    },
    async removeCategory(id: string) {
        return deleteDoc(doc(db, 'categories', id));
    },
    async removeSubcategory(id: string) {
        return deleteDoc(doc(db, 'subcategories', id));
    },
};
