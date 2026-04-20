import { ref } from 'vue';
import { storageService } from '@/services/storageService';

export const useImageUpload = () => {
  const uploading = ref(false);

  async function uploadMany(ownerId: string, folder: string, files: File[]) {
    uploading.value = true;
    try {
      const uploads = files.map((file) =>
        storageService.uploadFile(`${ownerId}/${folder}/${Date.now()}-${file.name}`, file),
      );
      return await Promise.all(uploads);
    } finally {
      uploading.value = false;
    }
  }

  return { uploading, uploadMany };
};
