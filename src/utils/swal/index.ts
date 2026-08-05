import Swal from 'sweetalert2'

const customClass = {
  confirmButton: 'bg-blue-600! text-white',
  cancelButton: 'bg-red-600! text-white',
}

export const swal = {
  error: (html: string, title = 'Erro') => {
    Swal.fire({
      title,
      html,
      allowOutsideClick: false,
      icon: 'error',
      customClass,
    })
  },

  info: (html: string, title = 'Informação') => {
    Swal.fire({
      title,
      html,
      allowOutsideClick: false,
      icon: 'info',
      customClass,
    })
  },

  question: (html: string, title = 'Pergunta') => {
    Swal.fire({
      title,
      html,
      allowOutsideClick: false,
      icon: 'question',
      customClass,
    })
  },

  success: (html: string, title = 'Sucesso') => {
    Swal.fire({
      title,
      html,
      allowOutsideClick: false,
      icon: 'success',
      customClass,
    })
  },

  warning: (html: string, title = 'Aviso') => {
    Swal.fire({
      title,
      html,
      allowOutsideClick: false,
      icon: 'warning',
      customClass,
    })
  },

  confirm: (html: string, title = 'Confirmação') => {
    return new Promise((resolve) => {
      Swal.fire({
        title,
        html,
        showCancelButton: true,
        confirmButtonText: 'Sim',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        customClass,
      }).then((result) => {
        resolve(result.isConfirmed)
      })
    })
  },
}
