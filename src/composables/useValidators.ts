export const useValidators = () => {
  const required = (value: unknown) => (!!value || value === 0 ? true : 'Campo obrigatório');
  const email = (value: string) => /.+@.+\..+/.test(value) || 'E-mail inválido';
  const minLength = (size: number) => (value: string) =>
    (value?.length || 0) >= size || `Mínimo de ${size} caracteres`;
  const positiveNumber = (value: number | string) => Number(value) > 0 || 'Informe um valor maior que zero';

  return {
    required,
    email,
    minLength,
    positiveNumber,
  };
};
