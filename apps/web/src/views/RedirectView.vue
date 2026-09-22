<template>
  <div class="page muted">渠道跳转中… {{ err }}</div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { PublicApi } from '../api/client';

const route = useRoute();
const router = useRouter();
const err = ref('');

onMounted(async () => {
  try {
    const res = await PublicApi.resolveRedirect(route.params.code);
    const target = res.redirect_to || `/p/ticket-grab`;
    if (target.startsWith('http')) {
      window.location.href = target;
    } else {
      router.replace(target);
    }
  } catch (e) {
    err.value = e.message || '无效渠道码';
  }
});
</script>
