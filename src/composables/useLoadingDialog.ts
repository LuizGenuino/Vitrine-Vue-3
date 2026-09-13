import { ref } from "vue";

const loading = ref(false)
const title = ref("")
const text = ref("")

export function useLoadingDialog() {
    const show = (textMsg: string = "Carregando", titleMsg: string = 'Aguarde') => {
        loading.value = true
        title.value = titleMsg
        text.value = textMsg + '...'
    }

    const hide = () => {
        loading.value = false
    }

    return { loading, title, text, show, hide }
}

const useLoading = {
    show: useLoadingDialog().show,
    hide: useLoadingDialog().hide
}

export default useLoading