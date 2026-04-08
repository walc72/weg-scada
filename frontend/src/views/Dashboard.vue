<template>
  <div class="d-flex flex-column" style="gap:16px">
    <Banner :stats="store.stats" :connected="store.connected" />

    <PM8000Card v-for="m in store.meterList" :key="m.name" :m="m" />

    <div class="drives-grid">
      <DriveCard v-for="d in store.driveList" :key="d.name" :d="d" />
    </div>

    <div v-if="!store.driveList.length" class="text-center text-grey pa-8">
      <v-progress-circular indeterminate color="indigo" />
      <div class="mt-3">Esperando datos de drives...</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useDrivesStore } from '../stores/drives.js'
import Banner from '../components/Banner.vue'
import DriveCard from '../components/DriveCard.vue'
import PM8000Card from '../components/PM8000Card.vue'

const store = useDrivesStore()

onMounted(() => store.connect())
onBeforeUnmount(() => store.disconnect())
</script>

<style scoped>
.drives-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 1fr;
  gap: 16px;
}
@media (max-width: 1200px) {
  .drives-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 700px) {
  .drives-grid { grid-template-columns: 1fr; }
}
</style>
