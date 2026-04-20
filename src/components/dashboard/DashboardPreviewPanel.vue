<script setup lang="ts">
import type { StoreSettings } from '@/types';
import { formatCurrency } from '@/utils/format';

const props = defineProps<{
  settings: StoreSettings;
}>();

const sampleProducts = [
  { name: 'Camiseta Essential', price: 79.9 },
  { name: 'Moletom Studio', price: 199.9 },
  { name: 'Boné Signature', price: 59.9 },
];
</script>

<template>
  <v-card class="surface-soft pa-4 pa-md-5" rounded="xl">
    <div class="text-overline text-medium-emphasis mb-2">Preview em tempo real</div>
    <v-card class="overflow-hidden" rounded="xl">
      <div class="position-relative">
        <v-img
          v-if="props.settings.bannerUrl"
          :src="props.settings.bannerUrl"
          height="240"
          cover
        />
        <div
          class="pa-5 pa-md-8"
          :style="{
            background: props.settings.bannerUrl
              ? `linear-gradient(135deg, ${props.settings.primaryColor}CC, ${props.settings.secondaryColor}CC)`
              : `linear-gradient(135deg, ${props.settings.primaryColor}, ${props.settings.secondaryColor})`,
            marginTop: props.settings.bannerUrl ? '-240px' : '0'
          }"
        >
          <div class="d-flex align-center ga-4">
            <v-avatar size="56" color="white">
              <v-img v-if="props.settings.logoUrl" :src="props.settings.logoUrl" cover />
              <span v-else class="text-h6 font-weight-bold">{{ props.settings.storeName?.slice(0, 1) || 'S' }}</span>
            </v-avatar>
            <div class="text-white">
              <div class="text-h5 font-weight-bold">{{ props.settings.storeName || 'Sua vitrine' }}</div>
              <div class="text-body-2" style="opacity: 0.84">{{ props.settings.title || 'Título principal da sua loja' }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="pa-5 pa-md-6">
        <div class="text-body-1 font-weight-medium mb-4">{{ props.settings.subtitle || 'Subtítulo com proposta de valor clara.' }}</div>
        <v-row>
          <v-col v-for="item in sampleProducts" :key="item.name" cols="12" sm="4">
            <v-card rounded="xl" variant="outlined" class="pa-3">
              <div class="rounded-lg mb-3" style="height: 120px; background: #e2e8f0" />
              <div class="font-weight-medium">{{ item.name }}</div>
              <div class="mt-1 text-body-2 text-medium-emphasis">Categoria premium</div>
              <div class="mt-3 font-weight-bold" :style="{ color: props.settings.primaryColor }">
                {{ formatCurrency(item.price) }}
              </div>
            </v-card>
          </v-col>
        </v-row>
      </div>
    </v-card>
  </v-card>
</template>
