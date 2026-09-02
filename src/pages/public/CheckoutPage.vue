<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

import { useStorefrontStore } from '@/stores/storefront.store'
import { useCartStore } from '@/stores/cart.store'
import { useNotifications } from '@/stores/notifications.store'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { supabase } from '@/lib/supabase'
import AppTextField from '@/components/base/AppTextField.vue'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const route = useRoute()
const router = useRouter()
const sf = useStorefrontStore()
const cart = useCartStore()
const notify = useNotifications()

const { store, themeColor } = storeToRefs(sf)

/* -------------------------------------------------------------------------- */
/*  Utils                                                                     */
/* -------------------------------------------------------------------------- */

const brl = (v: number | string) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function onlyDigits(v: string): string {
    return v.replace(/\D/g, '')
}

function validCPF(cpf: string): boolean {
    const d = onlyDigits(cpf)
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
    let sum = 0
    for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
    let check = 11 - (sum % 11)
    if (check >= 10) check = 0
    if (check !== Number(d[9])) return false
    sum = 0
    for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i)
    check = 11 - (sum % 11)
    if (check >= 10) check = 0
    return check === Number(d[10])
}

function validCNPJ(cnpj: string): boolean {
    const d = onlyDigits(cnpj)
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
    const calc = (base: string, weights: number[]) => {
        const sum = base.split('').reduce((s, ch, i) => s + Number(ch) * weights[i], 0)
        const rest = sum % 11
        return rest < 2 ? 0 : 11 - rest
    }
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return calc(d.slice(0, 12), w1) === Number(d[12])
        && calc(d.slice(0, 13), w2) === Number(d[13])
}

function formatCpfCnpj(v: string): string {
    const d = onlyDigits(v)
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    return v
}

function formatPhone(v: string): string {
    const d = onlyDigits(v)
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
    return v
}

function formatCep(v: string): string {
    const d = onlyDigits(v)
    if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, '$1-$2')
    return v
}

const settings = computed(() => (store.value as any)?.settings ?? {})
const requireCpf = computed(() => settings.value.require_cpf === true)
const showPrices = computed(() => settings.value.show_prices !== false)
const shippingFreeAbove = computed(() => Number(settings.value.shipping_free_above ?? 0))
const whatsappNumber = computed(() => settings.value.whatsapp_number as string | null)
const checkoutVia = computed<'both' | 'gateway' | 'whatsapp'>(() =>
    settings.value.checkout_via ?? 'both',
)

/* -------------------------------------------------------------------------- */
/*  Verificação inicial — se carrinho vazio, volta para vitrine               */
/* -------------------------------------------------------------------------- */

onMounted(() => {
    if (cart.items.length === 0) {
        router.replace({
            name: 'storefront',
            params: { storeSlug: route.params.storeSlug },
        })
    }
})

/* -------------------------------------------------------------------------- */
/*  Cupom persistido (herdado do CartPage)                                    */
/* -------------------------------------------------------------------------- */

interface AppliedCoupon {
    id: string
    code: string
    type: 'PERCENTAGE' | 'FIXED' | 'SHIPPING'
    value: number
    discount_amount: number
    free_shipping: boolean
}

const appliedCoupon = ref<AppliedCoupon | null>(null)

const COUPON_KEY = computed(() =>
    store.value ? `vibestore-coupon-${store.value.id}` : null,
)

watch(COUPON_KEY, (key) => {
    if (!key) return
    const raw = localStorage.getItem(key)
    if (raw) {
        try { appliedCoupon.value = JSON.parse(raw) } catch { /* ignora */ }
    }
}, { immediate: true })

/* -------------------------------------------------------------------------- */
/*  Steps do checkout                                                         */
/* -------------------------------------------------------------------------- */

interface Step {
    key: 'identity' | 'address' | 'payment'
    label: string
    icon: string
}

const steps: Step[] = [
    { key: 'identity', label: 'Identificação', icon: 'mdi-account-outline' },
    { key: 'address', label: 'Entrega', icon: 'mdi-truck-outline' },
    { key: 'payment', label: 'Pagamento', icon: 'mdi-credit-card-outline' },
]

const activeStepIndex = ref(0)
const currentStep = computed(() => steps[activeStepIndex.value])

const stepProgress = computed(() =>
    ((activeStepIndex.value + 1) / steps.length) * 100,
)

/* -------------------------------------------------------------------------- */
/*  Formulário — dados do cliente                                             */
/* -------------------------------------------------------------------------- */

const form = reactive({
    // Identificação
    email: '',
    full_name: '',
    phone: '',
    cpf_cnpj: '',
    birth_date: '',
    // Endereço
    postal_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    address_label: 'Casa',
    save_address: true,
    // Pagamento
    payment_method: 'pix' as 'pix' | 'credit_card' | 'boleto' | 'whatsapp',
    notes: '',
    accept_terms: false,
})

/* Persiste rascunho no sessionStorage (só nesta sessão) */
const DRAFT_KEY = computed(() =>
    store.value ? `vibestore-checkout-draft-${store.value.id}` : null,
)

watch(form, () => {
    if (!DRAFT_KEY.value) return
    sessionStorage.setItem(DRAFT_KEY.value, JSON.stringify(form))
}, { deep: true })

onMounted(() => {
    if (!DRAFT_KEY.value) return
    const raw = sessionStorage.getItem(DRAFT_KEY.value)
    if (raw) {
        try { Object.assign(form, JSON.parse(raw)) } catch { /* ignora */ }
    }
})

/* -------------------------------------------------------------------------- */
/*  Reconhecimento de cliente por e-mail                                      */
/* -------------------------------------------------------------------------- */

const existingCustomer = ref<any>(null)
const emailCheckLoading = ref(false)

let emailDebounce: number | undefined

watch(() => form.phone, (phone) => {
    window.clearTimeout(emailDebounce)
    existingCustomer.value = null
    if (!phone || !/^\(\d{2}\) \d{5}-\d{4}$/.test(phone) || !store.value) return

    emailDebounce = window.setTimeout(async () => {
        emailCheckLoading.value = true
        const { data, error } = await supabase.rpc(
            'find_customer_by_phone',
            {
                p_store_id: store.value!.id,
                p_phone: onlyDigits(phone),
            }
        )

        if (error) {
            throw error
        }

        if (data) {
            existingCustomer.value = data
        }
        emailCheckLoading.value = false
    }, 600)
})

function useExistingData() {
    if (!existingCustomer.value) return
    const c = existingCustomer.value
    form.full_name = c.full_name ?? ''
    form.phone = c.phone ?? ''
    form.cpf_cnpj = c.cpf_cnpj ?? ''
    form.birth_date = c.birth_date ?? ''

    // Pega endereço padrão se existir
    const defaultAddr = c.addresses?.find((a: any) => a.is_default) ?? c.addresses?.[0]
    if (defaultAddr) {
        form.postal_code = defaultAddr.postal_code ?? ''
        form.street = defaultAddr.street ?? ''
        form.number = defaultAddr.number ?? ''
        form.complement = defaultAddr.complement ?? ''
        form.neighborhood = defaultAddr.neighborhood ?? ''
        form.city = defaultAddr.city ?? ''
        form.state = defaultAddr.state ?? ''
        form.address_label = defaultAddr.label ?? 'Casa'
    }

    notify.success('Dados carregados do seu cadastro')
}

/* -------------------------------------------------------------------------- */
/*  Autopreenchimento por CEP (ViaCEP)                                        */
/* -------------------------------------------------------------------------- */

const cepLoading = ref(false)
let cepDebounce: number | undefined

watch(() => form.postal_code, (cep) => {
    window.clearTimeout(cepDebounce)
    const digits = onlyDigits(cep)
    if (digits.length !== 8) return

    cepDebounce = window.setTimeout(async () => {
        cepLoading.value = true
        try {
            const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
            const data = await res.json()
            if (data.erro) {
                notify.error('CEP não encontrado')
                return
            }
            if (!form.street) form.street = data.logradouro ?? ''
            if (!form.neighborhood) form.neighborhood = data.bairro ?? ''
            if (!form.city) form.city = data.localidade ?? ''
            if (!form.state) form.state = data.uf ?? ''
        } catch {
            // silencioso — usuário digita manualmente
        } finally {
            cepLoading.value = false
        }
    }, 500)
})

/* -------------------------------------------------------------------------- */
/*  Cálculo de frete (mock — deveria vir do MelhorEnvio)                      */
/* -------------------------------------------------------------------------- */

interface ShippingOption {
    id: string
    name: string
    price: number
    days: string
    logo?: string
}

const shippingOptions = ref<ShippingOption[]>([])
const shippingLoading = ref(false)
const selectedShippingId = ref<string | null>(null)

async function calculateShipping() {
    if (!form.postal_code || onlyDigits(form.postal_code).length !== 8) return

    shippingLoading.value = true
    shippingOptions.value = []

    // Simulação — na prática, chame Edge Function com integração MelhorEnvio
    await new Promise(r => setTimeout(r, 800))

    const freeShipping = appliedCoupon.value?.free_shipping
        || (shippingFreeAbove.value > 0 && cart.subtotal >= shippingFreeAbove.value)

    shippingOptions.value = [
        { id: 'pac', name: 'PAC', price: freeShipping ? 0 : 18.90, days: '5 a 8 dias úteis' },
        { id: 'sedex', name: 'SEDEX', price: freeShipping ? 0 : 32.50, days: '2 a 4 dias úteis' },
        { id: 'motoboy', name: 'Motoboy', price: 12.00, days: 'Mesmo dia (região metropolitana)' },
    ]

    if (!selectedShippingId.value && shippingOptions.value.length) {
        selectedShippingId.value = shippingOptions.value[0].id
    }
    shippingLoading.value = false
}

const selectedShipping = computed(() =>
    shippingOptions.value.find(s => s.id === selectedShippingId.value) ?? null,
)

const shippingCost = computed(() => selectedShipping.value?.price ?? 0)

/* -------------------------------------------------------------------------- */
/*  Cálculo do total                                                          */
/* -------------------------------------------------------------------------- */

const discount = computed(() => appliedCoupon.value?.discount_amount ?? 0)

const total = computed(() =>
    Math.max(0, cart.subtotal - discount.value + shippingCost.value),
)

/* -------------------------------------------------------------------------- */
/*  Validações por step                                                       */
/* -------------------------------------------------------------------------- */

const identityErrors = computed(() => {
    const errs: Record<string, string> = {}
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'E-mail inválido'
    if (!form.full_name.trim()) errs.full_name = 'Obrigatório'
    else if (form.full_name.trim().length < 3) errs.full_name = 'Nome muito curto'
    if (!form.phone) errs.phone = 'Obrigatório'
    else if (onlyDigits(form.phone).length < 10) errs.phone = 'Telefone inválido'
    if (requireCpf.value && !form.cpf_cnpj) errs.cpf_cnpj = 'Obrigatório'
    if (form.cpf_cnpj) {
        const d = onlyDigits(form.cpf_cnpj)
        if (d.length === 11 && !validCPF(form.cpf_cnpj)) errs.cpf_cnpj = 'CPF inválido'
        else if (d.length === 14 && !validCNPJ(form.cpf_cnpj)) errs.cpf_cnpj = 'CNPJ inválido'
        else if (d.length !== 11 && d.length !== 14) errs.cpf_cnpj = 'Documento incompleto'
    }
    return errs
})

const addressErrors = computed(() => {
    const errs: Record<string, string> = {}
    if (!form.postal_code || onlyDigits(form.postal_code).length !== 8) errs.postal_code = 'CEP inválido'
    if (!form.street.trim()) errs.street = 'Obrigatório'
    if (!form.number.trim()) errs.number = 'Obrigatório'
    if (!form.neighborhood.trim()) errs.neighborhood = 'Obrigatório'
    if (!form.city.trim()) errs.city = 'Obrigatório'
    if (!form.state.trim() || form.state.length !== 2) errs.state = 'UF inválida'
    if (!selectedShippingId.value) errs.shipping = 'Escolha uma forma de envio'
    return errs
})

const paymentErrors = computed(() => {
    const errs: Record<string, string> = {}
    if (!form.payment_method) errs.payment_method = 'Escolha um método'
    if (!form.accept_terms) errs.accept_terms = 'Você precisa aceitar os termos'
    return errs
})

const canAdvance = computed(() => {
    switch (currentStep.value.key) {
        case 'identity': return Object.keys(identityErrors.value).length === 0
        case 'address': return Object.keys(addressErrors.value).length === 0
        case 'payment': return Object.keys(paymentErrors.value).length === 0
    }
    return false
})

/* -------------------------------------------------------------------------- */
/*  Navegação                                                                 */
/* -------------------------------------------------------------------------- */

function nextStep() {
    if (!canAdvance.value) {
        notify.error('Preencha os campos obrigatórios corretamente')
        return
    }
    if (activeStepIndex.value < steps.length - 1) {
        activeStepIndex.value++
        window.scrollTo({ top: 0, behavior: 'smooth' })

        // Ao chegar em endereço com CEP preenchido, calcula frete
        if (currentStep.value.key === 'address'
            && onlyDigits(form.postal_code).length === 8
            && !shippingOptions.value.length) {
            calculateShipping()
        }
    }
}

function prevStep() {
    if (activeStepIndex.value > 0) {
        activeStepIndex.value--
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }
}

function goBackToCart() {
    router.push({
        name: 'storefront-cart',
        params: { storeSlug: route.params.storeSlug },
    })
}

/* -------------------------------------------------------------------------- */
/*  Métodos de pagamento disponíveis                                          */
/* -------------------------------------------------------------------------- */

const paymentMethods = computed(() => {
    const list: Array<{ id: any; label: string; icon: string; desc: string; enabled: boolean }> = []

    const gatewayEnabled = ['gateway', 'both'].includes(checkoutVia.value)
    const whatsappEnabled = ['whatsapp', 'both'].includes(checkoutVia.value) && whatsappNumber.value

    if (gatewayEnabled) {
        list.push(
            { id: 'pix', label: 'PIX', icon: '⚡', desc: 'Aprovação instantânea · 5% OFF', enabled: true },
            { id: 'credit_card', label: 'Cartão de crédito', icon: '💳', desc: 'Em até 12× sem juros no PRO', enabled: true },
            { id: 'boleto', label: 'Boleto bancário', icon: '🧾', desc: 'Aprovação em até 2 dias úteis', enabled: true },
        )
    }

    if (whatsappEnabled) {
        list.push({
            id: 'whatsapp',
            label: 'Combinar via WhatsApp',
            icon: '💬',
            desc: 'A loja entra em contato para combinar pagamento',
            enabled: true,
        })
    }

    return list
})

// Se só WhatsApp, força a seleção
watch(paymentMethods, (list) => {
    if (list.length === 1) form.payment_method = list[0].id
    else if (!list.find(m => m.id === form.payment_method)) {
        form.payment_method = list[0]?.id ?? 'pix'
    }
}, { immediate: true })

const pixDiscount = computed(() =>
    form.payment_method === 'pix' ? total.value * 0.05 : 0,
)

const finalTotal = computed(() => total.value - pixDiscount.value)

/* -------------------------------------------------------------------------- */
/*  Submissão do pedido                                                       */
/* -------------------------------------------------------------------------- */

const { execute: placeOrder, loading: placing } = useAsyncAction(
    async () => {
        if (!store.value) throw new Error('Loja não carregada')
        if (!canAdvance.value) throw new Error('Preencha os campos obrigatórios')
        if (cart.items.length === 0) throw new Error('Carrinho vazio')

        /* --- 1. Cria ou atualiza customer --- */
        let customerId: string

        if (existingCustomer.value) {
            customerId = existingCustomer.value.id
            // Atualiza dados que podem ter mudado
            const { data, error } = await supabase.rpc('update_customer', {
                p_customer: customerId,
                p_store_id: store.value.id,
                p_full_name: form.full_name.trim(),
                p_email: form.email.trim().toLowerCase(),
                p_phone: onlyDigits(form.phone),
                p_cpf_cnpj: form.cpf_cnpj ? onlyDigits(form.cpf_cnpj) : '',
            })

            if (error) throw error
            if (!data) return

            customerId = data

        } else {
            const { data, error } = await supabase.rpc('create_customer', {
                p_store_id: store.value.id,
                p_full_name: form.full_name.trim(),
                p_email: form.email.trim().toLowerCase(),
                p_phone: onlyDigits(form.phone),
                p_cpf_cnpj: form.cpf_cnpj ? onlyDigits(form.cpf_cnpj) : '',
            })

            if (error) throw error
            if (!data) return

            customerId = data
        }

        /* --- 2. Salva endereço (se solicitado) --- */
        if (form.save_address) {
            const { data, error } = await supabase.rpc("save_customer_address", {
                p_customer_id: customerId,
                p_label: form.address_label,
                p_street: form.street.trim(),
                p_number: form.number.trim(),
                p_complement: form.complement.trim() || '',
                p_neighborhood: form.neighborhood.trim(),
                p_city: form.city.trim(),
                p_state: form.state.trim().toUpperCase(),
                p_postal_code: onlyDigits(form.postal_code),
                p_country: 'BR',
                p_is_default: !existingCustomer.value?.addresses?.length,
            })
            if (error) throw error
        }

        /* --- 3. Gera número do pedido via RPC --- */
        const { data: orderNumber } = await supabase.rpc('generate_order_number', {
            p_store: store.value.id,
        })

        /* --- 4. Cria order --- */
        const notes = [
            form.notes.trim(),
            `Entrega: ${selectedShipping.value?.name} (${selectedShipping.value?.days})`,
            `Endereço: ${form.street}, ${form.number}${form.complement ? ` - ${form.complement}` : ''}, ${form.neighborhood}, ${form.city}/${form.state}, CEP ${form.postal_code}`,
        ].filter(Boolean).join('\n')

        const { data: order, error: orderError } = await supabase.rpc("create_orders", {
            p_store_id: store.value.id,
            p_customer_id: customerId,
            p_coupon_id: appliedCoupon.value?.id ?? null,
            p_order_number: orderNumber as string,
            p_subtotal: cart.subtotal,
            p_discount: discount.value + pixDiscount.value,
            p_shipping_cost: shippingCost.value,
            p_total: finalTotal.value,
            p_payment_method: form.payment_method,
            p_notes: notes,
        })

        if (orderError) throw orderError

        /* --- 5. Cria order_items --- */
        Promise.allSettled(cart.items.map(item => (
            supabase.rpc('create_order_items', {
                p_order_id: order.id,
                p_product_id: item.product_id,
                p_quantity: item.quantity,
                p_unit_price: item.price,
                p_total: item.price * item.quantity,
            })
        )))

        /* --- 6. Cria order_payment inicial (PENDING) --- */
        await supabase.rpc("create_order_payments", {
            p_order_id: order.id,
            p_gateway: form.payment_method === 'whatsapp' ? 'manual' : form.payment_method,
            p_amount: finalTotal.value,
        })

        // /* --- 7. Incrementa uso do cupom --- */
        if (appliedCoupon.value) {
            const { data: result, error } = await supabase.rpc('increment_coupon_use', {
                p_coupon_code: appliedCoupon.value.code,
                p_order_id: order.id,
                p_customer_id: customerId,
                p_order_total: finalTotal.value,   // total ANTES do desconto
            })

            if (error || !result?.success) {
                // Cupom invalidou entre a validação e o checkout (ex: outro cliente usou o último)
                notify.error(result?.message ?? 'Não foi possível aplicar o cupom')
                // Opção A: prossegue sem desconto (recalcula total)
                // Opção B: aborta e volta para o carrinho
            } else {
                // Sucesso: result.discount_amount já foi somado em orders.discount
                console.log(`Cupom ${result.coupon_code} aplicado: -R$${result.discount_amount}`)
            }
        }



        /* --- 8. Analytics PURCHASE --- */
        sf.trackEvent({
            eventType: 'PURCHASE',
            metadata: {
                customerId,
                order_id: order.id,
                order_number: order.order_number,
                items: cart.items.length,
                total: finalTotal.value,
                payment_method: form.payment_method,
                coupon: appliedCoupon.value?.code,
            },
        })

        /* --- 9. Se WhatsApp, abre a conversa com o resumo do pedido --- */
        if (form.payment_method === 'whatsapp' && whatsappNumber.value) {
            const itemsList = cart.items
                .map(i => `• ${i.quantity}× ${i.name} — ${brl(i.price * i.quantity)}`)
                .join('\n')

            const msg = encodeURIComponent(
                `Olá! Fiz o pedido *#${order.order_number}* na loja.\n\n` +
                `📦 *Itens:*\n${itemsList}\n\n` +
                `💰 *Total: ${brl(finalTotal.value)}*\n\n` +
                `📍 *Entrega:*\n${form.street}, ${form.number} - ${form.neighborhood}, ${form.city}/${form.state}\n\n` +
                `Aguardo instruções para pagamento!`,
            )
            window.open(`https://wa.me/${whatsappNumber.value}?text=${msg}`, '_blank')
        }

        /* --- 10. Limpa carrinho + cupom + rascunho --- */
        cart.clear()
        if (COUPON_KEY.value) localStorage.removeItem(COUPON_KEY.value)
        if (DRAFT_KEY.value) sessionStorage.removeItem(DRAFT_KEY.value)

        /* --- 11. Redireciona para status do pedido --- */
        router.replace({
            name: 'storefront-order-status',
            params: {
                storeSlug: route.params.storeSlug,
                orderNumber: order.order_number,
            },
        })
    },
    { successMsg: 'Pedido criado com sucesso! 🎉' },
)

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ufOptions = [
    'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
    'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]
</script>

<template>
    <div class="checkout-page" :style="{ '--theme-color': themeColor }">

        <!-- ==================== HEADER ==================== -->
        <header class="checkout-header">
            <button class="back-btn" @click="goBackToCart">
                <v-icon size="18">mdi-arrow-left</v-icon>
                <span>Voltar para o carrinho</span>
            </button>
            <h1 class="checkout-title">Finalizar compra</h1>
        </header>

        <!-- ==================== STEPPER ==================== -->
        <div class="stepper">
            <div v-for="(step, i) in steps" :key="step.key" class="step-item" :class="{
                active: activeStepIndex === i,
                completed: activeStepIndex > i,
            }" @click="activeStepIndex > i && (activeStepIndex = i)">
                <div class="step-badge">
                    <v-icon v-if="activeStepIndex > i" size="18">mdi-check</v-icon>
                    <v-icon v-else size="18">{{ step.icon }}</v-icon>
                </div>
                <div class="step-label">{{ step.label }}</div>
            </div>
            <div class="stepper-progress" :style="{ width: `${stepProgress}%` }" />
        </div>

        <!-- ==================== LAYOUT ==================== -->
        <div class="checkout-layout">

            <!-- ==================== FORMULÁRIO (LADO ESQUERDO) ==================== -->
            <section class="checkout-form">

                <!-- ============ STEP 1: IDENTIFICAÇÃO ============ -->
                <div v-show="currentStep.key === 'identity'" class="step-content">
                    <h2 class="step-title">
                        <v-icon color="primary">mdi-account-outline</v-icon>
                        Quem está comprando?
                    </h2>

                    <div class="form-grid">
                        <div class="form-group full">

                            <label class="form-label">Telefone *</label>
                            <AppTextField mask="tel" v-model="form.phone" label="WhatsApp*" variant="outlined"
                                density="comfortable" prepend-inner-icon="mdi-whatsapp" placeholder="(11) 99999-9999"
                                hint="O Numero sera usado para contatos e notificações" persistent-hint :rules="[
                                    (value: string) => !!value || 'Campo obrigatório'
                                ]" />

                            <!-- Cliente reconhecido -->
                            <v-slide-y-transition>
                                <v-card v-if="existingCustomer" variant="tonal" color="success" rounded="lg"
                                    class="pa-3 mt-2 existing-customer">
                                    <div class="d-flex align-center ga-3">
                                        <v-icon color="success">mdi-account-check-outline</v-icon>
                                        <div class="flex-grow-1">
                                            <div class="text-body-2 font-weight-bold">
                                                Bem-vindo(a) de volta, {{ existingCustomer.full_name.split(' ')[0] }}!
                                            </div>
                                            <div class="text-caption">
                                                Encontramos seu cadastro. Quer preencher automaticamente?
                                            </div>
                                        </div>
                                        <v-btn size="small" variant="flat" color="success" class="text-none"
                                            @click="useExistingData">
                                            Usar meus dados
                                        </v-btn>
                                    </div>
                                </v-card>
                            </v-slide-y-transition>
                        </div>

                        <div class="form-group full">
                            <label class="form-label">Nome completo *</label>
                            <v-text-field v-model="form.full_name" variant="outlined" density="comfortable" hide-details
                                placeholder="Seu nome completo" prepend-inner-icon="mdi-account-outline"
                                :error="!!identityErrors.full_name" />
                            <p v-if="identityErrors.full_name" class="form-error">
                                {{ identityErrors.full_name }}
                            </p>
                        </div>

                        <div class="form-group">
                            <label class="form-label">E-mail (opcional)</label>
                            <v-text-field v-model="form.email" type="email" placeholder="voce@email.com"
                                variant="outlined" density="comfortable" hide-details
                                prepend-inner-icon="mdi-email-outline" :error="!!identityErrors.email" />
                            <p v-if="identityErrors.email" class="form-error">
                                {{ identityErrors.email }}
                            </p>
                        </div>

                        <div class="form-group">
                            <label class="form-label">
                                CPF ou CNPJ
                                <span v-if="requireCpf">*</span>
                                <span v-else class="text-caption text-medium-emphasis">(opcional)</span>
                            </label>
                            <v-text-field v-model="form.cpf_cnpj" variant="outlined" density="comfortable" hide-details
                                placeholder="000.000.000-00" prepend-inner-icon="mdi-card-account-details-outline"
                                :error="!!identityErrors.cpf_cnpj"
                                @blur="form.cpf_cnpj = formatCpfCnpj(form.cpf_cnpj)" />
                            <p v-if="identityErrors.cpf_cnpj" class="form-error">
                                {{ identityErrors.cpf_cnpj }}
                            </p>
                        </div>
                    </div>

                    <v-alert type="info" variant="tonal" density="compact" rounded="lg" icon="mdi-shield-lock-outline"
                        class="mt-4">
                        <div class="text-caption">
                            Seus dados são criptografados e usados apenas para processar seu pedido.
                            Nunca compartilhamos com terceiros.
                        </div>
                    </v-alert>
                </div>

                <!-- ============ STEP 2: ENDEREÇO ============ -->
                <div v-show="currentStep.key === 'address'" class="step-content">
                    <h2 class="step-title">
                        <v-icon color="primary">mdi-truck-outline</v-icon>
                        Para onde vamos entregar?
                    </h2>

                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">CEP *</label>
                            <AppTextField mask="cep" v-model="form.postal_code" label="CEP*" variant="outlined"
                                density="comfortable" prepend-inner-icon="mdi-map-marker-outline"
                                placeholder="00000-000" hint="Informe seu CEP para localizar o endereço" persistent-hint
                                :rules="[
                                    (value: string) => !!value || 'Campo obrigatório'
                                ]" :loading="cepLoading" />
                            <a href="https://buscacepinter.correios.com.br" target="_blank" class="form-help-link">
                                Não sei meu CEP
                            </a>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Identificação</label>
                            <v-select v-model="form.address_label" :items="['Casa', 'Trabalho', 'Outro']"
                                variant="outlined" density="comfortable" hide-details />
                        </div>

                        <div class="form-group full-3">
                            <label class="form-label">Rua *</label>
                            <v-text-field v-model="form.street" variant="outlined" density="comfortable" hide-details
                                :error="!!addressErrors.street" />
                            <p v-if="addressErrors.street" class="form-error">
                                {{ addressErrors.street }}
                            </p>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Número *</label>
                            <v-text-field v-model="form.number" variant="outlined" density="comfortable" hide-details
                                :error="!!addressErrors.number" />
                            <p v-if="addressErrors.number" class="form-error">
                                {{ addressErrors.number }}
                            </p>
                        </div>

                        <div class="form-group full-2">
                            <label class="form-label">Complemento</label>
                            <v-text-field v-model="form.complement" variant="outlined" density="comfortable"
                                hide-details placeholder="Apto, sala, referência..." />
                        </div>

                        <div class="form-group full-2">
                            <label class="form-label">Bairro *</label>
                            <v-text-field v-model="form.neighborhood" variant="outlined" density="comfortable"
                                hide-details :error="!!addressErrors.neighborhood" />
                            <p v-if="addressErrors.neighborhood" class="form-error">
                                {{ addressErrors.neighborhood }}
                            </p>
                        </div>

                        <div class="form-group full-3">
                            <label class="form-label">Cidade *</label>
                            <v-text-field v-model="form.city" variant="outlined" density="comfortable" hide-details
                                :error="!!addressErrors.city" />
                        </div>

                        <div class="form-group">
                            <label class="form-label">UF *</label>
                            <v-select v-model="form.state" :items="ufOptions" variant="outlined" density="comfortable"
                                hide-details :error="!!addressErrors.state" />
                        </div>
                    </div>

                    <div class="save-address-toggle mt-4">
                        <v-switch v-model="form.save_address" color="primary" hide-details density="compact">
                            <template #label>
                                <span class="text-body-2">
                                    Salvar este endereço para compras futuras
                                </span>
                            </template>
                        </v-switch>
                    </div>

                    <!-- Frete -->
                    <div class="shipping-block mt-6">
                        <h3 class="shipping-title">
                            <v-icon>mdi-truck-fast-outline</v-icon>
                            Forma de entrega
                        </h3>

                        <v-btn v-if="!shippingOptions.length && !shippingLoading" color="primary" variant="tonal"
                            rounded="pill" class="text-none" prepend-icon="mdi-calculator"
                            :disabled="onlyDigits(form.postal_code).length !== 8" @click="calculateShipping">
                            Calcular frete
                        </v-btn>

                        <div v-if="shippingLoading" class="shipping-loading">
                            <v-progress-circular indeterminate size="24" color="primary" />
                            <span class="text-body-2 text-medium-emphasis">Calculando fretes...</span>
                        </div>

                        <div v-if="shippingOptions.length" class="shipping-options">
                            <label v-for="opt in shippingOptions" :key="opt.id" class="shipping-option"
                                :class="{ selected: selectedShippingId === opt.id }">
                                <input v-model="selectedShippingId" type="radio" :value="opt.id" class="shipping-radio">
                                <div class="shipping-info">
                                    <div class="shipping-name">{{ opt.name }}</div>
                                    <div class="shipping-days">{{ opt.days }}</div>
                                </div>
                                <div class="shipping-price">
                                    <span v-if="opt.price === 0" class="shipping-free">Grátis</span>
                                    <span v-else>{{ brl(opt.price) }}</span>
                                </div>
                            </label>
                        </div>
                        <p v-if="addressErrors.shipping" class="form-error">
                            {{ addressErrors.shipping }}
                        </p>
                    </div>
                </div>

                <!-- ============ STEP 3: PAGAMENTO ============ -->
                <div v-show="currentStep.key === 'payment'" class="step-content">
                    <h2 class="step-title">
                        <v-icon color="primary">mdi-credit-card-outline</v-icon>
                        Como você quer pagar?
                    </h2>

                    <div class="payment-methods">
                        <label v-for="method in paymentMethods" :key="method.id" class="payment-method"
                            :class="{ selected: form.payment_method === method.id }">
                            <input v-model="form.payment_method" type="radio" :value="method.id" class="payment-radio">
                            <div class="payment-icon">{{ method.icon }}</div>
                            <div class="payment-info">
                                <div class="payment-label">{{ method.label }}</div>
                                <div class="payment-desc">{{ method.desc }}</div>
                            </div>
                            <v-icon v-if="form.payment_method === method.id" color="primary" size="20">
                                mdi-check-circle
                            </v-icon>
                        </label>
                    </div>

                    <!-- Placeholder de cartão (visual — integração real vai via Edge Function) -->
                    <v-card v-if="form.payment_method === 'credit_card'" variant="tonal" color="primary" rounded="lg"
                        class="pa-4 mt-4">
                        <div class="d-flex ga-2 align-center">
                            <v-icon>mdi-information-outline</v-icon>
                            <div class="text-body-2">
                                Você será redirecionado(a) para o pagamento seguro após confirmar o pedido.
                            </div>
                        </div>
                    </v-card>

                    <!-- PIX badge -->
                    <v-card v-if="form.payment_method === 'pix'" variant="tonal" color="success" rounded="lg"
                        class="pa-4 mt-4 pix-benefit">
                        <div class="d-flex ga-3 align-center">
                            <div class="pix-icon">⚡</div>
                            <div>
                                <div class="text-body-2 font-weight-bold">
                                    Ganhe 5% de desconto pagando com PIX!
                                </div>
                                <div class="text-caption">
                                    Você economiza {{ brl(pixDiscount) }} · Aprovação instantânea
                                </div>
                            </div>
                        </div>
                    </v-card>

                    <!-- Observações -->
                    <div class="form-group mt-6">
                        <label class="form-label">Observações (opcional)</label>
                        <v-textarea v-model="form.notes" variant="outlined" density="comfortable" hide-details rows="3"
                            placeholder="Alguma instrução especial? Ex: entregar após 18h, cor preferida..."
                            counter="200" maxlength="200" persistent-counter />
                    </div>

                    <!-- Termos -->
                    <div class="terms-block mt-4">
                        <v-checkbox v-model="form.accept_terms" color="primary" hide-details density="compact">
                            <template #label>
                                <span class="text-body-2">
                                    Li e aceito os
                                    <a href="/terms" target="_blank" class="text-primary">termos de compra</a>
                                    e a
                                    <a href="/privacy" target="_blank" class="text-primary">política de privacidade</a>
                                </span>
                            </template>
                        </v-checkbox>
                        <p v-if="paymentErrors.accept_terms" class="form-error">
                            {{ paymentErrors.accept_terms }}
                        </p>
                    </div>
                </div>

                <!-- ==================== NAVEGAÇÃO ==================== -->
                <div class="step-nav">
                    <v-btn v-if="activeStepIndex > 0" variant="text" class="text-none" prepend-icon="mdi-arrow-left"
                        :disabled="placing" @click="prevStep">
                        Voltar
                    </v-btn>
                    <div v-else />

                    <v-btn v-if="activeStepIndex < steps.length - 1" color="primary" variant="flat" rounded="pill"
                        size="large" class="text-none px-8" append-icon="mdi-arrow-right" :disabled="!canAdvance"
                        @click="nextStep">
                        Continuar
                    </v-btn>
                    <v-btn v-else color="primary" variant="flat" rounded="pill" size="large"
                        class="text-none px-8 place-order-btn" prepend-icon="mdi-check-decagram" :loading="placing"
                        :disabled="!canAdvance" @click="placeOrder">
                        {{ form.payment_method === 'whatsapp' ? 'Enviar pedido via WhatsApp' : 'Finalizar pedido' }}
                    </v-btn>
                </div>
            </section>

            <!-- ==================== RESUMO (LADO DIREITO) ==================== -->
            <aside class="checkout-summary">
                <div class="summary-card">
                    <h2 class="summary-title">Seu pedido</h2>

                    <!-- Itens -->
                    <div class="summary-items">
                        <div v-for="item in cart.items" :key="item.product_id" class="summary-item">
                            <div class="summary-item-image">
                                <img v-if="item.image_url" :src="item.image_url" :alt="item.name">
                                <v-icon v-else size="20" color="grey-lighten-1">mdi-image-off-outline</v-icon>
                                <span class="summary-item-qty">{{ item.quantity }}</span>
                            </div>
                            <div class="summary-item-info">
                                <div class="summary-item-name">{{ item.name }}</div>
                                <div v-if="showPrices" class="summary-item-price">
                                    {{ brl(item.price * item.quantity) }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <v-divider class="my-3" />

                    <!-- Cálculos -->
                    <div v-if="showPrices" class="summary-calc">
                        <div class="calc-row">
                            <span>Subtotal</span>
                            <span>{{ brl(cart.subtotal) }}</span>
                        </div>

                        <div v-if="appliedCoupon" class="calc-row calc-discount">
                            <span>
                                <v-icon size="14">mdi-tag-outline</v-icon>
                                Cupom {{ appliedCoupon.code }}
                            </span>
                            <span>−{{ brl(discount) }}</span>
                        </div>

                        <div v-if="pixDiscount > 0" class="calc-row calc-discount">
                            <span>
                                <v-icon size="14">mdi-flash</v-icon>
                                Desconto PIX (5%)
                            </span>
                            <span>−{{ brl(pixDiscount) }}</span>
                        </div>

                        <div class="calc-row">
                            <span>Frete {{ selectedShipping ? `(${selectedShipping.name})` : '' }}</span>
                            <span v-if="!selectedShipping" class="calc-muted">A calcular</span>
                            <span v-else-if="shippingCost === 0" class="calc-free">Grátis</span>
                            <span v-else>{{ brl(shippingCost) }}</span>
                        </div>
                    </div>

                    <v-divider v-if="showPrices" class="my-3" />

                    <!-- Total -->
                    <div v-if="showPrices" class="summary-total">
                        <span>Total</span>
                        <span class="total-value">{{ brl(finalTotal) }}</span>
                    </div>

                    <div v-else class="no-price-summary">
                        <v-icon color="success">mdi-whatsapp</v-icon>
                        <p>Valor combinado via WhatsApp</p>
                    </div>

                    <!-- Segurança -->
                    <div class="security-badges">
                        <div class="badge-item">
                            <v-icon size="16" color="success">mdi-lock-outline</v-icon>
                            <span>Pagamento seguro</span>
                        </div>
                        <div class="badge-item">
                            <v-icon size="16" color="primary">mdi-shield-check-outline</v-icon>
                            <span>Dados criptografados</span>
                        </div>
                        <div class="badge-item">
                            <v-icon size="16" color="warning">mdi-refresh</v-icon>
                            <span>7 dias para troca</span>
                        </div>
                    </div>
                </div>
            </aside>
        </div>

    </div>
</template>

<style scoped>
.checkout-page {
    --theme-color: rgb(var(--v-theme-primary));
    display: flex;
    flex-direction: column;
    gap: 24px;
}

/* ============================================================ */
/*  Header                                                      */
/* ============================================================ */
.checkout-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: rgba(var(--v-theme-on-surface), 0.6);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    align-self: flex-start;
    transition: color 0.15s ease;
}

.back-btn:hover {
    color: var(--theme-color);
}

.checkout-title {
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    color: rgb(var(--v-theme-on-surface));
    margin: 0;
}

/* ============================================================ */
/*  Stepper                                                     */
/* ============================================================ */
.stepper {
    position: relative;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 20px 0;
}

.stepper::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 5%;
    right: 5%;
    height: 2px;
    background: rgba(var(--v-theme-on-surface), 0.08);
    z-index: 0;
}

.stepper-progress {
    position: absolute;
    top: 50%;
    left: 5%;
    height: 2px;
    background: var(--theme-color);
    z-index: 1;
    transition: width 0.4s ease;
    transform: translateX(-5%);
}

.step-item {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: default;
}

.step-item.completed {
    cursor: pointer;
}

.step-badge {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgb(var(--v-theme-surface));
    border: 2px solid rgba(var(--v-theme-on-surface), 0.12);
    color: rgba(var(--v-theme-on-surface), 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
}

.step-item.active .step-badge {
    border-color: var(--theme-color);
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 6%, rgb(var(--v-theme-surface)));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--theme-color) 15%, transparent);
}

.step-item.completed .step-badge {
    background: var(--theme-color);
    border-color: var(--theme-color);
    color: white;
}

.step-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.5);
}

.step-item.active .step-label,
.step-item.completed .step-label {
    color: rgb(var(--v-theme-on-surface));
}

/* ============================================================ */
/*  Layout                                                      */
/* ============================================================ */
.checkout-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 32px;
    align-items: start;
}

@media (max-width: 899px) {
    .checkout-layout {
        grid-template-columns: 1fr;
        gap: 24px;
    }
}

/* ============================================================ */
/*  Form                                                        */
/* ============================================================ */
.checkout-form {
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.08);
    border-radius: 16px;
    padding: 24px;
}

.step-content {
    animation: fade-in 0.3s ease;
}

@keyframes fade-in {
    from {
        opacity: 0;
        transform: translateY(8px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.step-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.375rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 20px;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

.form-group.full {
    grid-column: span 4;
}

.form-group.full-2 {
    grid-column: span 2;
}

.form-group.full-3 {
    grid-column: span 3;
}

.form-group {
    grid-column: span 2;
}

@media (max-width: 599px) {
    .form-grid {
        grid-template-columns: 1fr;
    }

    .form-group,
    .form-group.full,
    .form-group.full-2,
    .form-group.full-3 {
        grid-column: span 1;
    }
}

.form-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    margin-bottom: 6px;
}

.form-error {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 0;
    font-size: 0.75rem;
    color: rgb(var(--v-theme-error));
}

.form-help-link {
    display: inline-block;
    margin-top: 4px;
    font-size: 0.75rem;
    color: var(--theme-color);
    text-decoration: none;
}

.form-help-link:hover {
    text-decoration: underline;
}

.existing-customer {
    border: 1px dashed rgba(var(--v-theme-success), 0.4);
}

/* ============================================================ */
/*  Shipping                                                    */
/* ============================================================ */
.shipping-block {
    padding: 20px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 14px;
}

.shipping-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 12px;
}

.shipping-loading {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
}

.shipping-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.shipping-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: rgb(var(--v-theme-surface));
    border: 2px solid rgba(var(--v-border-color), 0.15);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.shipping-option:hover {
    border-color: rgba(var(--v-theme-primary), 0.35);
}

.shipping-option.selected {
    border-color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 4%, rgb(var(--v-theme-surface)));
}

.shipping-radio {
    appearance: none;
    width: 20px;
    height: 20px;
    border: 2px solid rgba(var(--v-theme-on-surface), 0.2);
    border-radius: 50%;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
}

.shipping-option.selected .shipping-radio {
    border-color: var(--theme-color);
}

.shipping-option.selected .shipping-radio::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--theme-color);
}

.shipping-info {
    flex: 1;
    min-width: 0;
}

.shipping-name {
    font-size: 0.9375rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.shipping-days {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
}

.shipping-price {
    font-size: 1rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
}

.shipping-free {
    color: rgb(var(--v-theme-success));
}

/* ============================================================ */
/*  Payment methods                                             */
/* ============================================================ */
.payment-methods {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.payment-method {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    background: rgb(var(--v-theme-surface));
    border: 2px solid rgba(var(--v-border-color), 0.15);
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.payment-method:hover {
    border-color: rgba(var(--v-theme-primary), 0.35);
    transform: translateY(-1px);
}

.payment-method.selected {
    border-color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 4%, rgb(var(--v-theme-surface)));
    box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-color) 10%, transparent);
}

.payment-radio {
    display: none;
}

.payment-icon {
    font-size: 2rem;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--v-theme-surface-variant), 0.5);
    border-radius: 12px;
    flex-shrink: 0;
}

.payment-info {
    flex: 1;
}

.payment-label {
    font-size: 1rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.payment-desc {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), 0.6);
    margin-top: 2px;
}

.pix-benefit {
    border: 1px dashed rgba(var(--v-theme-success), 0.35);
}

.pix-icon {
    font-size: 2rem;
}

/* ============================================================ */
/*  Terms                                                       */
/* ============================================================ */
.terms-block {
    padding: 16px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 12px;
}

.save-address-toggle {
    padding: 12px 16px;
    background: rgba(var(--v-theme-surface-variant), 0.3);
    border-radius: 12px;
}

/* ============================================================ */
/*  Navigation                                                  */
/* ============================================================ */
.step-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid rgba(var(--v-border-color), 0.08);
    gap: 12px;
    flex-wrap: wrap;
}

.place-order-btn {
    animation: subtle-pulse 2s ease-in-out infinite;
}

@keyframes subtle-pulse {

    0%,
    100% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--theme-color) 40%, transparent);
    }

    50% {
        box-shadow: 0 0 0 8px color-mix(in srgb, var(--theme-color) 0%, transparent);
    }
}

/* ============================================================ */
/*  Summary                                                     */
/* ============================================================ */
.checkout-summary {
    position: sticky;
    top: 84px;
}

@media (max-width: 899px) {
    .checkout-summary {
        position: static;
    }
}

.summary-card {
    background: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), 0.1);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.summary-title {
    font-size: 1.125rem;
    font-weight: 800;
    color: rgb(var(--v-theme-on-surface));
    margin: 0 0 16px;
}

.summary-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 260px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
}

.summary-item {
    display: flex;
    align-items: center;
    gap: 10px;
}

.summary-item-image {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(var(--v-theme-surface-variant), 0.5);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.summary-item-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.summary-item-qty {
    position: absolute;
    top: -6px;
    right: -6px;
    background: rgb(var(--v-theme-primary));
    color: white;
    font-size: 0.65rem;
    font-weight: 800;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgb(var(--v-theme-surface));
}

.summary-item-info {
    flex: 1;
    min-width: 0;
}

.summary-item-name {
    font-size: 0.8125rem;
    font-weight: 600;
    color: rgb(var(--v-theme-on-surface));
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    line-height: 1.3;
}

.summary-item-price {
    font-size: 0.8125rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
    margin-top: 2px;
}

.summary-calc {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.calc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
}

.calc-row span:first-child {
    display: flex;
    align-items: center;
    gap: 4px;
}

.calc-discount {
    color: rgb(var(--v-theme-success)) !important;
}

.calc-discount span:last-child {
    color: rgb(var(--v-theme-success));
    font-weight: 700;
}

.calc-free {
    color: rgb(var(--v-theme-success)) !important;
    font-weight: 700 !important;
}

.calc-muted {
    color: rgba(var(--v-theme-on-surface), 0.5) !important;
    font-size: 0.75rem !important;
}

.summary-total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
}

.summary-total>span:first-child {
    font-size: 1rem;
    font-weight: 700;
    color: rgb(var(--v-theme-on-surface));
}

.total-value {
    font-size: 1.75rem;
    font-weight: 900;
    color: var(--theme-color);
}

.no-price-summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: rgba(var(--v-theme-success), 0.08);
    border-radius: 10px;
    margin-bottom: 16px;
}

.no-price-summary p {
    font-size: 0.8125rem;
    margin: 0;
    color: rgb(var(--v-theme-on-surface));
}

.security-badges {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 12px;
    border-top: 1px dashed rgba(var(--v-border-color), 0.15);
}

.badge-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
}
</style>
