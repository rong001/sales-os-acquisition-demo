<template>
  <router-view />
  <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
</template>

<script setup>
import { ref, provide } from 'vue';
const toastMsg = ref('');
let timer;
function toast(msg) {
  toastMsg.value = msg;
  clearTimeout(timer);
  timer = setTimeout(() => { toastMsg.value = ''; }, 2800);
}
provide('toast', toast);
</script>
