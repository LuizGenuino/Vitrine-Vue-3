import { ref } from 'vue'
import { storageService, type BucketName } from '@/services/storage.service'

export function useUpload(bucket: BucketName) {
    const uploading = ref(false)
    const progress = ref(0)
    const error = ref<Error | null>(null)

    async function upload(path: string, file: File) {
        uploading.value = true
        progress.value = 0
        error.value = null
        try {
            await storageService.upload(bucket, path, file)
            progress.value = 100
            return storageService.getPublicUrl(bucket, path)
        } catch (e) {
            error.value = e as Error
            throw e
        } finally {
            uploading.value = false
        }
    }

    return { upload, uploading, progress, error }
}