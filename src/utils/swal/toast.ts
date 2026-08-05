import Swal from 'sweetalert2'

const swalToast = Swal.mixin({
  toast: true,
  position: 'top',
  showConfirmButton: false,
  showCloseButton: true,
  timer: 5000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer
    toast.onmouseleave = Swal.resumeTimer
  },
})

type ToastType = 'error' | 'info' | 'question' | 'success' | 'warning'

export const toast = (message: string, type: ToastType) =>
  swalToast.fire({ title: message, icon: type })
