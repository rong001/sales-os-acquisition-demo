<template>
  <div class="page">
    <div class="topbar">
      <div>
        <button class="btn" @click="$router.push('/admin/funnel')">← 漏斗</button>
        <h2 style="margin:8px 0 0">来源转化</h2>
        <p class="muted" style="margin:0">按 utm_source / 邀请码 / 活动聚合（合成演示数据）</p>
      </div>
      <button class="btn" @click="load">刷新</button>
    </div>
    <p v-if="error" class="tag warn">{{ error }}</p>
    <div v-if="data" class="grid-3">
      <div class="card stack">
        <strong>按 utm_source</strong>
        <div v-for="(v, k) in data.by_utm_source" :key="k" class="list-item row" style="cursor:default">
          <span class="grow">{{ k }}</span>
          <span class="tag">进{{ v.intake }} · 约{{ v.appointed }} · 赢{{ v.won }} · 失{{ v.lost }}</span>
        </div>
      </div>
      <div class="card stack">
        <strong>按邀请码</strong>
        <div v-for="(v, k) in data.by_invite" :key="k" class="list-item row" style="cursor:default">
          <span class="grow">{{ k }}</span>
          <span class="tag">进{{ v.intake }} · 约{{ v.appointed }} · 赢{{ v.won }}</span>
        </div>
      </div>
      <div class="card stack">
        <strong>按活动</strong>
        <div v-for="(v, k) in data.by_campaign" :key="k" class="list-item row" style="cursor:default">
          <span class="grow">{{ k }}</span>
          <span class="tag">进{{ v.intake }} · 约{{ v.appointed }} · 赢{{ v.won }}</span>
        </div>
      </div>
    </div>
    <p v-if="data" class="muted">总案件 {{ data.total_cases }}</p>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { LeadApi } from '../api/client';
const data = ref(null);
const error = ref('');
async function load() {
  error.value = '';
  try { data.value = await LeadApi.conversion(); }
  catch (e) { error.value = e.message; }
}
onMounted(load);
</script>
