import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import { ServiceError } from './base.service'

export type BucketName = 'avatars' | 'store-logos' | 'store-banners'
    | 'products' | 'documents' | 'imports'

class StorageService {
    async upload(bucket: BucketName, path: string, file: File, upsert = true) {
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, file, { upsert, cacheControl: '3600' })
        if (error) throw ServiceError.from(error)
        return data
    }

    getPublicUrl(bucket: BucketName, path: string): string {
        return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
    }

    async getSignedUrl(bucket: BucketName, path: string, expiresIn = 3600) {
        const { data, error } = await supabase.storage
            .from(bucket).createSignedUrl(path, expiresIn)
        if (error) throw ServiceError.from(error)
        return data.signedUrl
    }

    async remove(bucket: BucketName, paths: string[]) {
        const { error } = await supabase.storage.from(bucket).remove(paths)
        if (error) throw ServiceError.from(error)
    }

    // Helpers de path — respeitam a convenção multi-tenant do RLS de storage
    productImagePath(productId: string, imageId: string, ext = 'jpg') {
        const storeId = useAuthStore().currentStoreId!
        return `${storeId}/${productId}/${imageId}.${ext}`
    }
    storeLogoPath(ext = 'png') {
        const storeId = useAuthStore().currentStoreId!
        return `${storeId}/logo.${ext}`
    }
    avatarPath(userId: string, ext = 'png') {
        return `${userId}/avatar.${ext}`
    }
}

export const storageService = new StorageService()