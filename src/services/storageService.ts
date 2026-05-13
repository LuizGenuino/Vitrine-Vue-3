import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

export const storageService = {
    async uploadFile(path: string, file: File) {
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file);
        return getDownloadURL(fileRef);
    },

    async deleteFile(path: string) {
        const fileRef = ref(storage, path);
        try {
            await deleteObject(fileRef);
        } catch (error) {
            console.error('Erro ao deletar arquivo:', error);
        }
    }
};
