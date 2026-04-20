<template>
  <v-container class="py-8 py-md-16">
    <div class="glass-panel rounded-xl pa-6 pa-md-10 overflow-hidden">
      <v-row align="center">
        <v-col cols="12" md="6">
          <div class="text-overline text-medium-emphasis mb-4">SAAS COM FOCO EM CONVERSÃO</div>
          <div class="text-h3 text-md-h2 font-weight-bold mb-5">Crie sua vitrine digital com design premium e arquitetura pronta para escalar.</div>
          <div class="text-body-1 text-medium-emphasis mb-8" style="max-width: 560px">
            Um painel elegante para configurar marca, organizar catálogo, vender direto pelo WhatsApp e evoluir para assinatura por planos sem refazer o produto.
          </div>
          <div class="d-flex flex-wrap ga-3">
            <v-btn color="primary" size="large" :to="{ name: 'register' }">Começar agora</v-btn>
            <v-btn variant="outlined" size="large" :to="{ name: 'login' }">Entrar</v-btn>
          </div>
        </v-col>
        <v-col cols="12" md="6">
          <v-card class="surface-soft pa-4 pa-md-6" rounded="xl">
            <div class="brand-gradient rounded-xl pa-6 text-white">
              <div class="text-overline mb-2">Preview da solução</div>
              <div class="text-h5 font-weight-bold">Operação pronta para vender hoje e monetizar amanhã</div>
            </div>
            <v-row class="mt-3">
              <v-col cols="12" sm="6">
                <v-card variant="outlined" class="pa-4 h-100">
                  <div class="text-h6 font-weight-bold mb-2">Dashboard SaaS</div>
                  <div class="text-body-2 text-medium-emphasis">Branding, onboarding, CRUD de catálogo, limites por plano e preview em tempo real.</div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="6">
                <v-card variant="outlined" class="pa-4 h-100">
                  <div class="text-h6 font-weight-bold mb-2">Vitrine pública</div>
                  <div class="text-body-2 text-medium-emphasis">Busca, filtros, carrinho local e checkout leve via WhatsApp com experiência responsiva.</div>
                </v-card>
              </v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>
