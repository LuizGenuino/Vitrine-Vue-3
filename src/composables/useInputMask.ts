export const maskRules = {
    cpf: [
        (value: string) =>
            onlyNumbers(value).length === 11 ||
            'CPF inválido',
    ],

    cnpj: [
        (value: string) =>
            onlyNumbers(value).length === 0 || onlyNumbers(value).length === 14 ||
            'CNPJ inválido',
    ],

    cep: [
        (value: string) =>
            onlyNumbers(value).length === 0 || onlyNumbers(value).length === 8 ||
            'CEP inválido',
    ],

    tel: [
        (value: string) =>
            onlyNumbers(value).length === 0 || [10, 11].includes(onlyNumbers(value).length) ||
            'Telefone inválido',
    ],

    currency: [
        (value: string) =>
            Boolean(value) ||
            'Informe um valor',
    ],
}

export type InputMaskType =
    | 'cpf'
    | 'cnpj'
    | 'tel'
    | 'currency'
    | 'cep'

export function onlyNumbers(value: string) {
    return value.replace(/\D/g, '')
}

export function formatCPF(value: string) {
    return onlyNumbers(value)
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCNPJ(value: string) {
    return onlyNumbers(value)
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
}

export function formatCEP(value: string) {
    return onlyNumbers(value)
        .slice(0, 8)
        .replace(/(\d{5})(\d)/, '$1-$2')
}

export function formatPhone(value: string) {
    const numbers = onlyNumbers(value).slice(0, 11)

    if (numbers.length <= 10) {
        return numbers
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2')
    }

    return numbers
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
}

export function formatCurrency(value: string) {
    const numbers = onlyNumbers(value)

    if (!numbers) {
        return ''
    }

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(Number(numbers) / 100)
}

const formatters = {
    cpf: formatCPF,
    cnpj: formatCNPJ,
    cep: formatCEP,
    tel: formatPhone,
    currency: formatCurrency,
}

export function formatMask(
    type: InputMaskType,
    value: string,
) {
    return formatters[type](value)
}

