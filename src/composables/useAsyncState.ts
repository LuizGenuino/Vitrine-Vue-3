import { ref } from 'vue';

export const useAsyncState = () => {
  const loading = ref(false);
  const error = ref<string>('');

  async function run<T>(callback: () => Promise<T>) {
    loading.value = true;
    error.value = '';
    try {
      return await callback();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Algo deu errado.';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, run };
};
