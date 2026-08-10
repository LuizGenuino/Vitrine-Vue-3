<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth.store'
import { useSupabaseQuery } from '@/composables/useSupabaseQuery'
import { supabase } from '@/lib/supabase'

import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard.vue'
import EmptyState from '@/components/base/EmptyState.vue'

/* -------------------------------------------------------------------------- */
/*  Setup                                                                     */
/* -------------------------------------------------------------------------- */

const auth = useAuthStore()
const { currentStoreId } = storeToRefs(auth)

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type EventType =
    | 'VIEW_PRODUCT'
    | 'SEARCH'
    | 'OPEN_WHATSAPP'
    | 'CHECKOUT'
    | 'PURCHASE'
    | 'ADD_TO_CART'

interface AnalyticsEventRow {
    event_type: EventType
    session_id: string | null
    product_id: string | null
    customer_id: string | null
    created_at: string
    metadata: Record<string, any>
}

interface OrderRow {
    id: string
    customer_id: string | null
    total: number
    status: string
    created_at: string
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

const brl = (v: number) => v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
})

const compact = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
    return v.toString()
}

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`

const deltaFmt = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? '+∞' : '0%'
    const delta = ((curr - prev) / prev) * 100
    const sign = delta > 0 ? '+' : ''
    return `${sign}${delta.toFixed(1)}%`
}

/* -------------------------------------------------------------------------- */
/*  Períodos                                                                  */
/* -------------------------------------------------------------------------- */

interface Period {
    key: string
    label: string
    days: number
}

const periods: Period[] = [
    { key: '7d', label: '7 dias', days: 7 },
    { key: '30d', label: '30 dias', days: 30 },
    { key: '90d', label: '90 dias', days: 90 },
    { key: '12m', label: '12 meses', days: 365 },
]

const selectedPeriod = ref<Period>(periods[1])

const dateRange = computed(() => {
    const now = new Date()
    const start = new Date(now.getTime() - selectedPeriod.value.days * 86_400_000)
    const prevStart = new Date(start.getTime() - selectedPeriod.value.days * 86_400_000)
    return {
        startIso: start.toISOString(),
        endIso: now.toISOString(),
        prevStartIso: prevStart.toISOString(),
        prevEndIso: start.toISOString(),
        startDate: start,
        endDate: now,
    }
})

/* -------------------------------------------------------------------------- */
/*  Query — eventos do período atual + anterior (para comparação)             */
/* -------------------------------------------------------------------------- */

const analyticsQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return { current: [], previous: [] }

    const [curr, prev] = await Promise.all([
        supabase.from('analytics_events')
            .select('event_type, session_id, product_id, customer_id, created_at, metadata')
            .gte('created_at', dateRange.value.startIso)
            .lte('created_at', dateRange.value.endIso),
        supabase.from('analytics_events')
            .select('event_type, session_id, product_id, customer_id, created_at, metadata')
            .gte('created_at', dateRange.value.prevStartIso)
            .lte('created_at', dateRange.value.prevEndIso),
    ])

    return {
        current: (curr.data ?? []) as AnalyticsEventRow[],
        previous: (prev.data ?? []) as AnalyticsEventRow[],
    }
}, { watchSource: [currentStoreId, selectedPeriod] })

const ordersQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value) return { current: [], previous: [] }

    const [curr, prev] = await Promise.all([
        supabase.from('orders')
            .select('id, customer_id, total, status, created_at')
            .in('status', ['PAID', 'DELIVERED'])
            .is('deleted_at', null)
            .gte('created_at', dateRange.value.startIso)
            .lte('created_at', dateRange.value.endIso),
        supabase.from('orders')
            .select('id, customer_id, total, status, created_at')
            .in('status', ['PAID', 'DELIVERED'])
            .is('deleted_at', null)
            .gte('created_at', dateRange.value.prevStartIso)
            .lte('created_at', dateRange.value.prevEndIso),
    ])

    return {
        current: (curr.data ?? []) as OrderRow[],
        previous: (prev.data ?? []) as OrderRow[],
    }
}, { watchSource: [currentStoreId, selectedPeriod] })

/* -------------------------------------------------------------------------- */
/*  Query — nomes de produtos (para exibir na tabela de top produtos)         */
/* -------------------------------------------------------------------------- */

const productsMapQuery = useSupabaseQuery(async () => {
    const { data } = await supabase
        .from('products')
        .select('id, name, sku, price')
    const map = new Map<string, { id: string; name: string; sku: string; price: number }>()
    for (const p of data ?? []) {
        map.set(p.id, { id: p.id, name: p.name, sku: p.sku, price: Number(p.price) })
    }
    return map
}, { watchSource: [currentStoreId] })

const productsMap = computed(() => productsMapQuery.data.value ?? new Map())

/* -------------------------------------------------------------------------- */
/*  Métricas principais                                                       */
/* -------------------------------------------------------------------------- */

const events = computed(() => analyticsQuery.data.value?.current ?? [])
const eventsPrev = computed(() => analyticsQuery.data.value?.previous ?? [])
const orders = computed(() => ordersQuery.data.value?.current ?? [])
const ordersPrev = computed(() => ordersQuery.data.value?.previous ?? [])

interface FunnelStep {
    key: EventType | 'ORDER_PAID'
    label: string
    icon: string
    color: string
    count: number
    prevCount: number
    conversionFromPrev: number
    dropRate: number
}

const funnelSteps = computed<FunnelStep[]>(() => {
    const countBy = (list: AnalyticsEventRow[], type: EventType) =>
        list.filter(e => e.event_type === type).length

    const views = countBy(events.value, 'VIEW_PRODUCT')
    const cartAdds = countBy(events.value, 'ADD_TO_CART')
    const checkouts = countBy(events.value, 'CHECKOUT')
    const purchases = orders.value.length

    const prevViews = countBy(eventsPrev.value, 'VIEW_PRODUCT')
    const prevCarts = countBy(eventsPrev.value, 'ADD_TO_CART')
    const prevCheckouts = countBy(eventsPrev.value, 'CHECKOUT')
    const prevPurchases = ordersPrev.value.length

    const steps: FunnelStep[] = [
        {
            key: 'VIEW_PRODUCT', label: 'Visualizações', icon: 'mdi-eye-outline',
            color: 'info', count: views, prevCount: prevViews, conversionFromPrev: 1, dropRate: 0
        },
        {
            key: 'ADD_TO_CART', label: 'Adicionou ao carrinho', icon: 'mdi-cart-plus',
            color: 'primary', count: cartAdds, prevCount: prevCarts, conversionFromPrev: 0, dropRate: 0
        },
        {
            key: 'CHECKOUT', label: 'Iniciou checkout', icon: 'mdi-cart-arrow-right',
            color: 'warning', count: checkouts, prevCount: prevCheckouts, conversionFromPrev: 0, dropRate: 0
        },
        {
            key: 'ORDER_PAID', label: 'Pedidos pagos', icon: 'mdi-check-decagram',
            color: 'success', count: purchases, prevCount: prevPurchases, conversionFromPrev: 0, dropRate: 0
        },
    ]

    for (let i = 1; i < steps.length; i++) {
        const prev = steps[i - 1].count
        steps[i].conversionFromPrev = prev > 0 ? steps[i].count / prev : 0
        steps[i].dropRate = prev > 0 ? (prev - steps[i].count) / prev : 0
    }
    return steps
})

/** Conversão geral do funil: views → purchases */
const overallConversion = computed(() => {
    const views = funnelSteps.value[0].count
    const buys = funnelSteps.value[funnelSteps.value.length - 1].count
    return views > 0 ? buys / views : 0
})

const overallConversionPrev = computed(() => {
    const views = funnelSteps.value[0].prevCount
    const buys = funnelSteps.value[funnelSteps.value.length - 1].prevCount
    return views > 0 ? buys / views : 0
})

/* -------------------------------------------------------------------------- */
/*  KPIs do topo                                                              */
/* -------------------------------------------------------------------------- */

const kpis = computed(() => {
    const revenue = orders.value.reduce((s, o) => s + Number(o.total), 0)
    const prevRevenue = ordersPrev.value.reduce((s, o) => s + Number(o.total), 0)

    const uniqueSessions = new Set(events.value.map(e => e.session_id).filter(Boolean)).size
    const uniquePrevSessions = new Set(eventsPrev.value.map(e => e.session_id).filter(Boolean)).size

    const avgTicket = orders.value.length ? revenue / orders.value.length : 0
    const avgPrevTicket = ordersPrev.value.length ? prevRevenue / ordersPrev.value.length : 0

    return {
        revenue,
        revenueDelta: deltaFmt(revenue, prevRevenue),
        revenueTrend: revenue >= prevRevenue ? 'up' : 'down',

        sessions: uniqueSessions,
        sessionsDelta: deltaFmt(uniqueSessions, uniquePrevSessions),
        sessionsTrend: uniqueSessions >= uniquePrevSessions ? 'up' : 'down',

        orders: orders.value.length,
        ordersDelta: deltaFmt(orders.value.length, ordersPrev.value.length),
        ordersTrend: orders.value.length >= ordersPrev.value.length ? 'up' : 'down',

        avgTicket,
        ticketDelta: deltaFmt(avgTicket, avgPrevTicket),
        ticketTrend: avgTicket >= avgPrevTicket ? 'up' : 'down',
    }
})

/* -------------------------------------------------------------------------- */
/*  Série temporal — para o gráfico de linha                                  */
/* -------------------------------------------------------------------------- */

interface DayPoint {
    date: string
    dateLabel: string
    views: number
    purchases: number
    revenue: number
}

const timeSeries = computed<DayPoint[]>(() => {
    const days = selectedPeriod.value.days
    const bucketByDay = days <= 90

    // Se período > 90d, agrupa por semana; senão por dia
    const points = new Map<string, DayPoint>()

    const keyOf = (d: Date) => {
        if (bucketByDay) return d.toISOString().slice(0, 10)
        // ISO week key
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        return monday.toISOString().slice(0, 10)
    }

    const labelOf = (key: string) => {
        const d = new Date(key)
        if (bucketByDay) {
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        }
        return `Sem ${Math.ceil(d.getDate() / 7)} · ${d.toLocaleDateString('pt-BR', { month: 'short' })}`
    }

    // Inicializa buckets
    const start = new Date(dateRange.value.startDate)
    const end = new Date(dateRange.value.endDate)
    const step = bucketByDay ? 1 : 7

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + step)) {
        const k = keyOf(cursor)
        if (!points.has(k)) {
            points.set(k, { date: k, dateLabel: labelOf(k), views: 0, purchases: 0, revenue: 0 })
        }
    }

    // Popula com views
    for (const ev of events.value) {
        if (ev.event_type !== 'VIEW_PRODUCT') continue
        const k = keyOf(new Date(ev.created_at))
        const p = points.get(k)
        if (p) p.views++
    }

    // Popula com purchases
    for (const o of orders.value) {
        const k = keyOf(new Date(o.created_at))
        const p = points.get(k)
        if (p) {
            p.purchases++
            p.revenue += Number(o.total)
        }
    }

    return Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date))
})

/* -------------------------------------------------------------------------- */
/*  Top produtos (visualizações e vendas)                                     */
/* -------------------------------------------------------------------------- */

interface TopProduct {
    productId: string
    name: string
    sku: string
    views: number
    addToCart: number
    purchases: number
    revenue: number
    conversion: number
}

const topProducts = computed<TopProduct[]>(() => {
    const agg = new Map<string, TopProduct>()

    const ensure = (id: string) => {
        if (!agg.has(id)) {
            const p = productsMap.value.get(id)
            agg.set(id, {
                productId: id,
                name: p?.name ?? 'Produto removido',
                sku: p?.sku ?? '—',
                views: 0, addToCart: 0, purchases: 0, revenue: 0, conversion: 0,
            })
        }
        return agg.get(id)!
    }

    // Views e ADD_TO_CART vêm de analytics_events
    for (const ev of events.value) {
        if (!ev.product_id) continue
        const row = ensure(ev.product_id)
        if (ev.event_type === 'VIEW_PRODUCT') row.views++
        if (ev.event_type === 'ADD_TO_CART') row.addToCart++
    }

    // Purchases + revenue vêm dos order_items dos pedidos do período
    // (query separada abaixo)

    for (const row of agg.values()) {
        row.conversion = row.views > 0 ? row.purchases / row.views : 0
    }

    return Array.from(agg.values())
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
})

/**
 * Query separada para vincular purchases → produtos via order_items.
 * Feita à parte porque analytics_events registra o VIEW mas não itens do pedido.
 */
const salesPerProductQuery = useSupabaseQuery(async () => {
    if (!currentStoreId.value || !orders.value.length) return new Map<string, { purchases: number; revenue: number }>()

    const { data } = await supabase
        .from('order_items')
        .select('product_id, quantity, total, order:orders!inner(status, deleted_at, created_at)')
        .in('order_id', orders.value.map(o => o.id))

    const map = new Map<string, { purchases: number; revenue: number }>()
    for (const item of data ?? []) {
        const pid = item.product_id
        if (!pid) continue
        if (!map.has(pid)) map.set(pid, { purchases: 0, revenue: 0 })
        const entry = map.get(pid)!
        entry.purchases += item.quantity
        entry.revenue += Number(item.total)
    }
    return map
}, { watchSource: [ordersQuery.data] })

const salesPerProduct = computed(() => salesPerProductQuery.data.value ?? new Map())

// Merge das vendas nos top produtos
const topProductsWithSales = computed(() =>
    topProducts.value.map(p => {
        const sales = salesPerProduct.value.get(p.productId)
        return {
            ...p,
            purchases: sales?.purchases ?? 0,
            revenue: sales?.revenue ?? 0,
            conversion: p.views > 0 ? (sales?.purchases ?? 0) / p.views : 0,
        }
    }).sort((a, b) => b.revenue - a.revenue || b.views - a.views),
)

/* -------------------------------------------------------------------------- */
/*  Top termos de busca                                                       */
/* -------------------------------------------------------------------------- */

const topSearches = computed(() => {
    const counts = new Map<string, number>()
    for (const ev of events.value) {
        if (ev.event_type !== 'SEARCH') continue
        const term = (ev.metadata?.query as string ?? '').trim().toLowerCase()
        if (!term) continue
        counts.set(term, (counts.get(term) ?? 0) + 1)
    }
    return Array.from(counts.entries())
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
})

/* -------------------------------------------------------------------------- */
/*  Distribuição por hora do dia (heatmap simples)                            */
/* -------------------------------------------------------------------------- */

const hourlyHeatmap = computed(() => {
    const buckets = Array(24).fill(0)
    for (const ev of events.value) {
        if (ev.event_type !== 'VIEW_PRODUCT') continue
        const hour = new Date(ev.created_at).getHours()
        buckets[hour]++
    }
    const max = Math.max(...buckets, 1)
    return buckets.map((count, hour) => ({
        hour,
        count,
        intensity: count / max,
    }))
})

const peakHour = computed(() => {
    const list = hourlyHeatmap.value
    const max = Math.max(...list.map(h => h.count))
    return list.find(h => h.count === max) ?? null
})

/* -------------------------------------------------------------------------- */
/*  Cálculos para SVG chart                                                   */
/* -------------------------------------------------------------------------- */

const CHART_WIDTH = 720
const CHART_HEIGHT = 240
const CHART_PAD = { top: 20, right: 20, bottom: 30, left: 45 }

const chartInner = computed(() => ({
    w: CHART_WIDTH - CHART_PAD.left - CHART_PAD.right,
    h: CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom,
}))

const chartMaxViews = computed(() =>
    Math.max(...timeSeries.value.map(p => p.views), 1),
)

const chartMaxRevenue = computed(() =>
    Math.max(...timeSeries.value.map(p => p.revenue), 1),
)

function xOf(index: number): number {
    const total = Math.max(1, timeSeries.value.length - 1)
    return CHART_PAD.left + (index / total) * chartInner.value.w
}

function yOfViews(views: number): number {
    return CHART_PAD.top + chartInner.value.h - (views / chartMaxViews.value) * chartInner.value.h
}

function yOfRevenue(revenue: number): number {
    return CHART_PAD.top + chartInner.value.h - (revenue / chartMaxRevenue.value) * chartInner.value.h
}

const viewsPath = computed(() => {
    if (!timeSeries.value.length) return ''
    return timeSeries.value
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOfViews(p.views)}`)
        .join(' ')
})

const viewsArea = computed(() => {
    if (!timeSeries.value.length) return ''
    const line = viewsPath.value
    const lastX = xOf(timeSeries.value.length - 1)
    const bottomY = CHART_PAD.top + chartInner.value.h
    return `${line} L ${lastX} ${bottomY} L ${CHART_PAD.left} ${bottomY} Z`
})

const revenuePath = computed(() => {
    if (!timeSeries.value.length) return ''
    return timeSeries.value
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOfRevenue(p.revenue)}`)
        .join(' ')
})

const xAxisTicks = computed(() => {
    if (timeSeries.value.length <= 8) return timeSeries.value.map((_, i) => i)
    const step = Math.ceil(timeSeries.value.length / 6)
    return timeSeries.value.map((_, i) => i).filter(i => i % step === 0)
})

const yAxisTicks = computed(() => [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    value: Math.round(chartMaxViews.value * pct),
    y: CHART_PAD.top + chartInner.value.h * (1 - pct),
})))

/* -------------------------------------------------------------------------- */
/*  Hover point                                                               */
/* -------------------------------------------------------------------------- */

const hoveredPoint = ref<DayPoint | null>(null)

const anyLoading = computed(() =>
    analyticsQuery.loading.value || ordersQuery.loading.value || salesPerProductQuery.loading.value,
)

onMounted(() => {
    analyticsQuery.refresh()
})
</script>

<template>
    <div class="d-flex flex-column ga-6 pb-10">

        <!-- ==================== HEADER ==================== -->
        <header class="d-flex flex-column flex-md-row align-md-center justify-space-between ga-4">
            <div>
                <h1 class="text-h4 font-weight-black">Analytics</h1>
                <p class="text-body-1 text-medium-emphasis mt-1">
                    Entenda o comportamento dos seus clientes e otimize a jornada de compra.
                </p>
            </div>

            <v-btn-toggle v-model="selectedPeriod" mandatory density="comfortable" variant="outlined" rounded="pill"
                color="primary">
                <v-btn v-for="p in periods" :key="p.key" :value="p" class="text-none" size="small">
                    {{ p.label }}
                </v-btn>
            </v-btn-toggle>
        </header>

        <!-- ==================== KPIs ==================== -->
        <v-row dense>
            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <v-card v-else rounded="xl" border flat class="pa-5 kpi-card">
                    <div class="d-flex justify-space-between align-start mb-3">
                        <v-avatar color="success" variant="tonal" size="44" rounded="lg">
                            <v-icon size="24">mdi-cash-multiple</v-icon>
                        </v-avatar>
                        <v-chip size="x-small" :color="kpis.revenueTrend === 'up' ? 'success' : 'error'" variant="tonal"
                            :prepend-icon="kpis.revenueTrend === 'up' ? 'mdi-trending-up' : 'mdi-trending-down'">
                            {{ kpis.revenueDelta }}
                        </v-chip>
                    </div>
                    <div class="text-h5 font-weight-black">{{ brl(kpis.revenue) }}</div>
                    <div class="text-body-2 font-weight-medium mt-1">Receita</div>
                    <div class="text-caption text-medium-emphasis">
                        No período selecionado
                    </div>
                </v-card>
            </v-col>

            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <v-card v-else rounded="xl" border flat class="pa-5 kpi-card">
                    <div class="d-flex justify-space-between align-start mb-3">
                        <v-avatar color="primary" variant="tonal" size="44" rounded="lg">
                            <v-icon size="24">mdi-cart-check</v-icon>
                        </v-avatar>
                        <v-chip size="x-small" :color="kpis.ordersTrend === 'up' ? 'success' : 'error'" variant="tonal"
                            :prepend-icon="kpis.ordersTrend === 'up' ? 'mdi-trending-up' : 'mdi-trending-down'">
                            {{ kpis.ordersDelta }}
                        </v-chip>
                    </div>
                    <div class="text-h5 font-weight-black">{{ kpis.orders }}</div>
                    <div class="text-body-2 font-weight-medium mt-1">Pedidos pagos</div>
                    <div class="text-caption text-medium-emphasis">
                        Ticket médio: {{ brl(kpis.avgTicket) }}
                    </div>
                </v-card>
            </v-col>

            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <v-card v-else rounded="xl" border flat class="pa-5 kpi-card">
                    <div class="d-flex justify-space-between align-start mb-3">
                        <v-avatar color="info" variant="tonal" size="44" rounded="lg">
                            <v-icon size="24">mdi-account-multiple-outline</v-icon>
                        </v-avatar>
                        <v-chip size="x-small" :color="kpis.sessionsTrend === 'up' ? 'success' : 'error'"
                            variant="tonal"
                            :prepend-icon="kpis.sessionsTrend === 'up' ? 'mdi-trending-up' : 'mdi-trending-down'">
                            {{ kpis.sessionsDelta }}
                        </v-chip>
                    </div>
                    <div class="text-h5 font-weight-black">{{ compact(kpis.sessions) }}</div>
                    <div class="text-body-2 font-weight-medium mt-1">Sessões únicas</div>
                    <div class="text-caption text-medium-emphasis">
                        Visitantes distintos
                    </div>
                </v-card>
            </v-col>

            <v-col cols="6" sm="6" lg="3">
                <v-skeleton-loader v-if="anyLoading" type="card" rounded="xl" />
                <v-card v-else rounded="xl" border flat class="pa-5 kpi-card">
                    <div class="d-flex justify-space-between align-start mb-3">
                        <v-avatar color="warning" variant="tonal" size="44" rounded="lg">
                            <v-icon size="24">mdi-percent-outline</v-icon>
                        </v-avatar>
                        <v-chip size="x-small" :color="overallConversion >= overallConversionPrev ? 'success' : 'error'"
                            variant="tonal"
                            :prepend-icon="overallConversion >= overallConversionPrev ? 'mdi-trending-up' : 'mdi-trending-down'">
                            {{ deltaFmt(overallConversion, overallConversionPrev) }}
                        </v-chip>
                    </div>
                    <div class="text-h5 font-weight-black">{{ pct(overallConversion, 2) }}</div>
                    <div class="text-body-2 font-weight-medium mt-1">Conversão geral</div>
                    <div class="text-caption text-medium-emphasis">
                        Views → compras
                    </div>
                </v-card>
            </v-col>
        </v-row>

        <!-- ==================== GRÁFICO PRINCIPAL ==================== -->
        <v-card rounded="xl" border flat class="pa-6">
            <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
                <div>
                    <h3 class="text-h6 font-weight-bold">Visualizações vs. Receita</h3>
                    <p class="text-caption text-medium-emphasis mb-0">
                        Correlação entre tráfego e conversão em vendas
                    </p>
                </div>
                <div class="d-flex ga-3">
                    <div class="legend-item">
                        <span class="legend-dot bg-info" />
                        <span class="text-caption">Visualizações</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-dot bg-success" />
                        <span class="text-caption">Receita</span>
                    </div>
                </div>
            </div>

            <div v-if="anyLoading" class="pa-6">
                <v-skeleton-loader type="image" height="240" />
            </div>

            <div v-else-if="!timeSeries.length" class="pa-6">
                <EmptyState title="Sem dados no período"
                    description="Aguarde os primeiros eventos ou expanda o intervalo de tempo." icon="mdi-chart-line" />
            </div>

            <svg v-else :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`" preserveAspectRatio="xMidYMid meet"
                class="analytics-chart" @mouseleave="hoveredPoint = null">
                <!-- Grid horizontal -->
                <line v-for="tick in yAxisTicks" :key="`grid-${tick.value}`" :x1="CHART_PAD.left"
                    :x2="CHART_WIDTH - CHART_PAD.right" :y1="tick.y" :y2="tick.y" class="grid-line" />

                <!-- Y axis labels -->
                <text v-for="tick in yAxisTicks" :key="`ylab-${tick.value}`" :x="CHART_PAD.left - 8" :y="tick.y + 4"
                    class="axis-label" text-anchor="end">
                    {{ compact(tick.value) }}
                </text>

                <!-- X axis labels -->
                <text v-for="i in xAxisTicks" :key="`xlab-${i}`" :x="xOf(i)" :y="CHART_HEIGHT - 8" class="axis-label"
                    text-anchor="middle">
                    {{ timeSeries[i].dateLabel }}
                </text>

                <!-- Views area -->
                <path :d="viewsArea" class="views-area" />
                <path :d="viewsPath" class="views-line" />

                <!-- Revenue line -->
                <path :d="revenuePath" class="revenue-line" />

                <!-- Interactive dots + hover zones -->
                <g v-for="(p, i) in timeSeries" :key="`pt-${p.date}`">
                    <circle :cx="xOf(i)" :cy="yOfViews(p.views)" r="4" class="views-dot"
                        :class="{ active: hoveredPoint?.date === p.date }" />
                    <circle :cx="xOf(i)" :cy="yOfRevenue(p.revenue)" r="4" class="revenue-dot"
                        :class="{ active: hoveredPoint?.date === p.date }" />
                    <rect :x="xOf(i) - 20" :y="CHART_PAD.top" width="40" :height="chartInner.h" class="hover-zone"
                        @mouseover="hoveredPoint = p" />
                </g>

                <!-- Tooltip vertical line -->
                <line v-if="hoveredPoint" :x1="xOf(timeSeries.indexOf(hoveredPoint))"
                    :x2="xOf(timeSeries.indexOf(hoveredPoint))" :y1="CHART_PAD.top" :y2="CHART_PAD.top + chartInner.h"
                    class="tooltip-line" />
            </svg>

            <!-- Tooltip -->
            <div v-if="hoveredPoint" class="chart-tooltip">
                <div class="text-caption text-medium-emphasis">{{ hoveredPoint.dateLabel }}</div>
                <div class="d-flex ga-4 mt-1">
                    <div>
                        <span class="legend-dot bg-info mr-1" />
                        <span class="text-caption">Views:</span>
                        <strong class="ml-1">{{ hoveredPoint.views }}</strong>
                    </div>
                    <div>
                        <span class="legend-dot bg-success mr-1" />
                        <span class="text-caption">Receita:</span>
                        <strong class="ml-1">{{ brl(hoveredPoint.revenue) }}</strong>
                    </div>
                </div>
            </div>
        </v-card>

        <!-- ==================== FUNIL DE CONVERSÃO ==================== -->
        <v-row>
            <v-col cols="12" lg="7">
                <v-card rounded="xl" border flat class="pa-6 h-100">
                    <div class="mb-6">
                        <h3 class="text-h6 font-weight-bold">Funil de conversão</h3>
                        <p class="text-caption text-medium-emphasis mb-0">
                            Onde seus clientes estão desistindo da compra
                        </p>
                    </div>

                    <div v-if="anyLoading" class="d-flex flex-column ga-3">
                        <v-skeleton-loader v-for="i in 4" :key="i" type="list-item-two-line" />
                    </div>

                    <div v-else class="funnel">
                        <div v-for="(step, idx) in funnelSteps" :key="step.key" class="funnel-step">
                            <div class="funnel-icon">
                                <v-avatar :color="step.color" variant="tonal" size="40">
                                    <v-icon>{{ step.icon }}</v-icon>
                                </v-avatar>
                            </div>

                            <div class="funnel-content">
                                <div class="d-flex justify-space-between align-baseline mb-1">
                                    <div>
                                        <div class="text-body-2 font-weight-bold">{{ step.label }}</div>
                                        <div v-if="idx > 0" class="text-caption text-medium-emphasis">
                                            <span v-if="step.dropRate > 0" class="text-error">
                                                {{ pct(step.dropRate) }} de perda ao passar do passo anterior
                                            </span>
                                            <span v-else class="text-success">
                                                {{ pct(step.conversionFromPrev) }} de conversão do passo anterior
                                            </span>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-h6 font-weight-black">{{ compact(step.count) }}</div>
                                        <div class="text-caption"
                                            :class="step.count >= step.prevCount ? 'text-success' : 'text-error'">
                                            {{ deltaFmt(step.count, step.prevCount) }}
                                        </div>
                                    </div>
                                </div>

                                <div class="funnel-bar-track">
                                    <div class="funnel-bar-fill" :class="`bg-${step.color}`" :style="{
                                        width: funnelSteps[0].count > 0
                                            ? `${(step.count / funnelSteps[0].count) * 100}%`
                                            : '0%'
                                    }" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <v-alert v-if="!anyLoading && funnelSteps[0].count > 0" variant="tonal"
                        :color="overallConversion >= 0.02 ? 'success' : 'warning'" rounded="lg" class="mt-6"
                        density="compact">
                        <div class="text-body-2">
                            <strong>{{ pct(overallConversion, 2) }}</strong> dos visitantes concluem uma compra.
                            <span v-if="overallConversion < 0.02" class="text-medium-emphasis">
                                A média de mercado é de 1–3% — há espaço para otimizar sua vitrine.
                            </span>
                            <span v-else class="text-medium-emphasis">
                                Excelente! Você está acima da média do setor.
                            </span>
                        </div>
                    </v-alert>
                </v-card>
            </v-col>

            <!-- ==================== HORÁRIOS DE PICO ==================== -->
            <v-col cols="12" lg="5">
                <v-card rounded="xl" border flat class="pa-6 h-100">
                    <div class="mb-4">
                        <h3 class="text-h6 font-weight-bold">Distribuição por hora</h3>
                        <p class="text-caption text-medium-emphasis mb-0">
                            Quando seus clientes mais visitam a loja
                        </p>
                    </div>

                    <div v-if="anyLoading">
                        <v-skeleton-loader type="image" height="200" />
                    </div>

                    <template v-else>
                        <div class="hour-heatmap">
                            <div v-for="bucket in hourlyHeatmap" :key="bucket.hour" class="hour-cell" :style="{
                                opacity: 0.15 + bucket.intensity * 0.85,
                                background: `rgb(var(--v-theme-primary))`,
                            }" :title="`${bucket.hour}h — ${bucket.count} views`">
                                <span v-if="bucket.hour % 3 === 0" class="hour-label">
                                    {{ bucket.hour }}h
                                </span>
                            </div>
                        </div>

                        <div class="mt-4 d-flex align-center justify-space-between">
                            <span class="text-caption text-medium-emphasis">
                                0h → 23h
                            </span>
                            <div class="d-flex align-center ga-1 text-caption">
                                <span>Menos</span>
                                <div class="scale-bar" />
                                <span>Mais</span>
                            </div>
                        </div>

                        <v-alert v-if="peakHour && peakHour.count > 0" variant="tonal" color="primary" rounded="lg"
                            class="mt-4" density="compact" icon="mdi-lightbulb-outline">
                            <div class="text-body-2">
                                Pico às <strong>{{ peakHour.hour }}h</strong> com {{ peakHour.count }} visualizações.
                                Considere publicar novidades e lançar campanhas próximo desse horário.
                            </div>
                        </v-alert>
                    </template>
                </v-card>
            </v-col>
        </v-row>

        <!-- ==================== TOP PRODUTOS + BUSCAS ==================== -->
        <v-row>
            <!-- Top produtos -->
            <v-col cols="12" lg="8">
                <v-card rounded="xl" border flat class="pa-6">
                    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
                        <div>
                            <h3 class="text-h6 font-weight-bold">Produtos mais vendidos</h3>
                            <p class="text-caption text-medium-emphasis mb-0">
                                Ordenados por receita gerada
                            </p>
                        </div>
                    </div>

                    <div v-if="anyLoading">
                        <v-skeleton-loader v-for="i in 5" :key="i" type="list-item-two-line" />
                    </div>

                    <EmptyState v-else-if="!topProductsWithSales.length" title="Sem dados de produtos"
                        description="Assim que houver visualizações e vendas, os produtos aparecerão aqui."
                        icon="mdi-package-variant-closed" />

                    <v-table v-else density="comfortable" class="top-products-table">
                        <thead>
                            <tr>
                                <th style="width: 40px">#</th>
                                <th>Produto</th>
                                <th class="text-end">Views</th>
                                <th class="text-end">Carrinho</th>
                                <th class="text-end">Vendas</th>
                                <th class="text-end">Conversão</th>
                                <th class="text-end">Receita</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(p, i) in topProductsWithSales" :key="p.productId">
                                <td>
                                    <v-chip size="x-small" :color="i < 3 ? 'warning' : 'grey'"
                                        :variant="i < 3 ? 'flat' : 'tonal'" class="rank-chip">
                                        {{ i + 1 }}
                                    </v-chip>
                                </td>
                                <td>
                                    <div class="text-body-2 font-weight-medium text-truncate" style="max-width: 220px">
                                        {{ p.name }}
                                    </div>
                                    <code class="sku-chip">{{ p.sku }}</code>
                                </td>
                                <td class="text-end">
                                    <span class="font-weight-medium">{{ compact(p.views) }}</span>
                                </td>
                                <td class="text-end">
                                    <span class="text-body-2 text-medium-emphasis">{{ p.addToCart }}</span>
                                </td>
                                <td class="text-end">
                                    <span class="font-weight-bold text-success">{{ p.purchases }}</span>
                                </td>
                                <td class="text-end">
                                    <v-chip size="x-small"
                                        :color="p.conversion >= 0.03 ? 'success' : p.conversion >= 0.01 ? 'warning' : 'grey'"
                                        variant="tonal">
                                        {{ pct(p.conversion, 2) }}
                                    </v-chip>
                                </td>
                                <td class="text-end">
                                    <span class="font-weight-black">{{ brl(p.revenue) }}</span>
                                </td>
                            </tr>
                        </tbody>
                    </v-table>
                </v-card>
            </v-col>

            <!-- Top termos de busca -->
            <v-col cols="12" lg="4">
                <v-card rounded="xl" border flat class="pa-6 h-100">
                    <div class="mb-4">
                        <h3 class="text-h6 font-weight-bold">Buscas mais frequentes</h3>
                        <p class="text-caption text-medium-emphasis mb-0">
                            O que seus clientes procuram
                        </p>
                    </div>

                    <div v-if="anyLoading">
                        <v-skeleton-loader v-for="i in 5" :key="i" type="list-item" />
                    </div>

                    <EmptyState v-else-if="!topSearches.length" title="Sem buscas registradas"
                        description="Ative o rastreamento de busca na sua vitrine." icon="mdi-magnify" />

                    <v-list v-else class="pa-0" bg-color="transparent">
                        <v-list-item v-for="(s, i) in topSearches" :key="s.term" class="search-item px-2">
                            <template #prepend>
                                <div class="search-rank">{{ i + 1 }}</div>
                            </template>
                            <v-list-item-title class="text-body-2 font-weight-medium">
                                {{ s.term }}
                            </v-list-item-title>
                            <template #append>
                                <v-chip size="x-small" variant="tonal" color="primary">
                                    {{ s.count }}
                                </v-chip>
                            </template>
                        </v-list-item>
                    </v-list>
                </v-card>
            </v-col>
        </v-row>

    </div>
</template>

<style scoped>
.h-100 {
    height: 100%;
}

.kpi-card {
    transition: all 0.2s ease;
}

.kpi-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
}

/* SKU chip */
.sku-chip {
    background: rgba(var(--v-theme-on-surface), 0.06);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.7rem;
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
    display: inline-block;
}

/* ============================================================ */
/*  Legend                                                      */
/* ============================================================ */
.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.legend-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

/* ============================================================ */
/*  Chart SVG                                                   */
/* ============================================================ */
.analytics-chart {
    width: 100%;
    height: auto;
    overflow: visible;
}

.grid-line {
    stroke: rgba(var(--v-border-color), 0.1);
    stroke-dasharray: 2 4;
}

.axis-label {
    fill: rgba(var(--v-theme-on-surface), 0.5);
    font-size: 11px;
    font-family: inherit;
}

.views-area {
    fill: rgb(var(--v-theme-info));
    fill-opacity: 0.1;
}

.views-line {
    stroke: rgb(var(--v-theme-info));
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.revenue-line {
    stroke: rgb(var(--v-theme-success));
    stroke-width: 2.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: none;
}

.views-dot,
.revenue-dot {
    fill: white;
    stroke-width: 2;
    transition: r 0.15s ease;
}

.views-dot {
    stroke: rgb(var(--v-theme-info));
}

.revenue-dot {
    stroke: rgb(var(--v-theme-success));
}

.views-dot.active,
.revenue-dot.active {
    r: 6;
}

.hover-zone {
    fill: transparent;
    cursor: pointer;
}

.tooltip-line {
    stroke: rgba(var(--v-theme-on-surface), 0.2);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    pointer-events: none;
}

.chart-tooltip {
    position: relative;
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(var(--v-theme-surface-variant), 0.5);
    border-radius: 8px;
    display: inline-block;
}

/* ============================================================ */
/*  Funil                                                       */
/* ============================================================ */
.funnel {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.funnel-step {
    display: flex;
    align-items: flex-start;
    gap: 16px;
}

.funnel-icon {
    flex-shrink: 0;
}

.funnel-content {
    flex: 1;
    min-width: 0;
}

.funnel-bar-track {
    height: 10px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    border-radius: 6px;
    overflow: hidden;
}

.funnel-bar-fill {
    height: 100%;
    border-radius: 6px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ============================================================ */
/*  Heatmap por hora                                            */
/* ============================================================ */
.hour-heatmap {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 3px;
    border-radius: 8px;
    overflow: hidden;
}

.hour-cell {
    aspect-ratio: 1 / 1.5;
    border-radius: 4px;
    position: relative;
    cursor: help;
    transition: transform 0.15s ease;
}

.hour-cell:hover {
    transform: scale(1.15);
    z-index: 2;
    outline: 2px solid rgb(var(--v-theme-primary));
}

.hour-label {
    position: absolute;
    bottom: -18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.65rem;
    color: rgba(var(--v-theme-on-surface), 0.5);
    white-space: nowrap;
}

.scale-bar {
    width: 60px;
    height: 8px;
    background: linear-gradient(90deg,
            rgba(var(--v-theme-primary), 0.15),
            rgb(var(--v-theme-primary)));
    border-radius: 4px;
}

/* ============================================================ */
/*  Top produtos table                                          */
/* ============================================================ */
.top-products-table :deep(thead th) {
    background: rgba(var(--v-theme-surface-variant), 0.3);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
}

.rank-chip {
    min-width: 28px;
    justify-content: center;
    font-weight: 700;
}

/* ============================================================ */
/*  Search list                                                 */
/* ============================================================ */
.search-item {
    border-radius: 8px;
    margin-bottom: 4px;
    transition: background 0.15s ease;
}

.search-item:hover {
    background: rgba(var(--v-theme-primary), 0.04);
}

.search-rank {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
    font-size: 0.75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
