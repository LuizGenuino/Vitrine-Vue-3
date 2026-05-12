<script setup>
const features = [
    {
        title: 'Catálogo Elegante',
        description: 'Organize seus produtos com fotos de alta qualidade e descrições claras que incentivam a compra imediata.',
        icon: 'mdi-view-dashboard-variant-outline',
        color: 'blue'
    },
    {
        title: 'Venda pelo WhatsApp',
        description: 'O cliente monta o carrinho e te envia o pedido pronto no WhatsApp. Sem intermediários, sem comissões.',
        icon: 'mdi-whatsapp',
        color: 'success'
    },
    {
        title: 'Gestão Simplificada',
        description: 'Altere preços, estoque e fotos em segundos pelo seu celular ou computador. Praticidade total.',
        icon: 'mdi-lightning-bolt-outline',
        color: 'amber-darken-2'
    }
]
</script>

<template>
    <v-app>
        <v-main>
            <section class="hero-section py-16 px-4">
                <v-container>
                    <v-row align="center" justify="center">
                        <v-col cols="12" md="6" class="text-center text-md-left">
                            <v-chip color="primary" variant="tonal" class="mb-4 font-weight-bold">
                                Ideal para Negócios Locais
                            </v-chip>
                            <h1 class="text-h3 text-md-h2 font-weight-black mb-6 leading-tight">
                                Transforme seu catálogo em uma <span class="text-primary">máquina de vendas.</span>
                            </h1>
                            <p class="text-h6 text-medium-emphasis mb-8 font-weight-regular">
                                Substitua listas confusas e PDFs pesados por uma vitrine digital elegante.
                                Seu cliente escolhe o produto e te chama direto no WhatsApp para fechar o pedido.
                            </p>
                            <div class="d-flex flex-wrap justify-center justify-md-start ga-4">
                                <v-btn color="primary" size="x-large" elevation="xl" class="px-8"
                                    :to="{ name: 'register' }">
                                    Começar gratuitamente
                                </v-btn>
                                <div class="d-flex align-center text-caption text-medium-emphasis">
                                    <v-icon color="success" icon="mdi-check-circle" class="mr-1"></v-icon>
                                    Sem taxas por venda
                                </div>
                            </div>
                        </v-col>

                        <v-col cols="12" md="6" class="mt-12 mt-md-0">
                            <v-hover v-slot="{ isHovering, props }">
                                <v-card v-bind="props" :elevation="isHovering ? 24 : 12" rounded="xl"
                                    class="transition-swing overflow-hidden border">
                                    <v-img
                                        src="https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=1000"
                                        cover height="400">
                                        <div class="d-flex flex-column justify-end h-100 pa-6 bg-gradient-vertical">
                                            <h3 class="text-white text-h4 font-weight-bold">Sua Marca Vai Mais Longe
                                            </h3>
                                        </div>
                                    </v-img>
                                </v-card>
                            </v-hover>
                        </v-col>
                    </v-row>
                </v-container>
            </section>

            <v-container class="py-8">
                <p class="text-center text-overline mb-8 text-medium-emphasis">Empresas que já simplificaram suas vendas
                </p>
                <v-row justify="center" align="center" class="opacity-60 grayscale">
                    <v-col v-for="n in 4" :key="n" cols="6" md="2" class="text-center">
                        <v-icon size="48">mdi-store-outline</v-icon>
                    </v-col>
                </v-row>
            </v-container>

            <section class="bg-grey-lighten-4 py-16" id="como-funciona">
                <v-container>
                    <div class="text-center mb-16">
                        <h2 class="text-h4 font-weight-bold mb-4">A ponte perfeita entre você e seu cliente</h2>
                        <p class="text-body-1 text-medium-emphasis">Esqueça sistemas complexos de pagamento. Focamos no
                            que importa: o contato direto.</p>
                    </div>

                    <v-row>
                        <v-col v-for="(feature, i) in features" :key="i" cols="12" md="4">
                            <v-card flat class="pa-6 rounded-xl h-100 border">
                                <v-avatar :color="feature.color" variant="tonal" size="56" class="mb-6">
                                    <v-icon :icon="feature.icon" size="28"></v-icon>
                                </v-avatar>
                                <h3 class="text-h6 font-weight-bold mb-3">{{ feature.title }}</h3>
                                <p class="text-body-2 text-medium-emphasis leading-relaxed">
                                    {{ feature.description }}
                                </p>
                            </v-card>
                        </v-col>
                    </v-row>
                </v-container>
            </section>

            <v-container class="py-16 text-center">
                <v-sheet color="primary" rounded="xl"
                    class="pa-8 pa-md-16 d-flex flex-column align-center text-white elevation-12">
                    <h2 class="text-h4 text-sm-h3 font-weight-bold mb-6">Pronto para profissionalizar seu negócio?</h2>
                    <p class="text-h6 mb-10 opacity-90" style="max-width: 700px">
                        Em menos de 5 minutos você configura sua vitrine e começa a compartilhar seu link exclusivo. Sem
                        burocracia, sem taxas de entrega.
                    </p>
                    <v-btn color="white" size="x-large" variant="flat" class="text-primary font-weight-bold px-12"
                        :to="{ name: 'register' }">
                        Criar minha vitrine agora
                    </v-btn>
                </v-sheet>
            </v-container>
        </v-main>

        <v-footer class="bg-grey-lighten-5 py-10 border-t">
            <v-container>
                <v-row>
                    <v-col cols="12" md="6" class="text-center text-md-left">
                        <div class="font-weight-bold text-h6 mb-2">AlphaCode</div>
                        <div class="text-body-2 text-medium-emphasis">Empoderando o comércio local através da tecnologia
                            simples.</div>
                    </v-col>
                    <v-col cols="12" md="6" class="text-center text-md-right mt-4 mt-md-0">
                        <div class="text-caption text-medium-emphasis">© 2026 AlphaCode - Todos os direitos
                            reservados.</div>
                    </v-col>
                </v-row>
            </v-container>
        </v-footer>
    </v-app>
</template>

<style scoped>
.hero-section {
    background: radial-gradient(circle at top right, rgba(var(--v-theme-primary), 0.05) 0%, transparent 40%);
}

.bg-gradient-vertical {
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 60%);
}

.leading-tight {
    line-height: 1.1 !important;
}

.leading-relaxed {
    line-height: 1.6 !important;
}

.w-fit-content {
    width: fit-content;
}

.grayscale {
    filter: grayscale(1);
}

.transition-swing {
    transition: 0.3s cubic-bezier(0.25, 0.8, 0.5, 1);
}
</style>