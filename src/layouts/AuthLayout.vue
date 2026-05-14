<template>
  <v-container fluid class="pa-0 fill-height">
    <v-row no-gutters class="fill-height">
      <v-col cols="12" md="6" class="d-none d-md-flex brand-gradient text-white align-center">
        <div class="pa-10 pa-lg-16" style="max-width: 640px">
          <div class="text-overline mb-3" style="letter-spacing: 0.18em">VibeStore</div>
          <div class="text-h3 font-weight-bold mb-4">Crie uma vitrine digital com estética de produto real.</div>
          <div class="text-body-1" style="opacity: 0.88">
            Personalize sua marca, publique produtos e converta pedidos direto pelo WhatsApp com experiência premium.
          </div>
        </div>
      </v-col>

      <v-col cols="12" md="6" class="d-flex align-center justify-center pa-4 pa-md-8">
        <div style="width: 100%; max-width: 460px">
          <router-view />
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
