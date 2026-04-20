import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';

export const storageService = {
  async uploadFile(path: string, file: File) {
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  },
};
