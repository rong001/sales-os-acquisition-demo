<template>
  <div class="page">
    <div class="topbar">
      <div>
        <button class="btn" @click="$router.push('/')">← 作战台</button>
        <h2 style="margin:8px 0 0">转化漏斗</h2>
        <p class="muted" style="margin:0">intake → qualified → assigned → reached/intent → appointed → ordered(stub)</p>
      </div>
      <div class="row">
        <select class="input" style="width:auto" v-model="product" @change="load">
          <option value="">全部产品线</option>
          <option value="ticket-grab">知识库·CRM 流程（演示渠道）</option>
          <option value="usgate">销售智能体实施（演示渠道）</option>
        </select>
        <button class="btn" @click="$router.push('/admin/conversion')">来源转化</button>
        <button class="btn" @click="$router.push('/admin/growth')">获客配置</button>
        <button v-if="canExport" class="btn" @click="exportCsv">导出 CSV</button>
        <span v-else class="tag">只读（无导出）</span>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:12px" v-if="data">
      <div class="card" v-for="(v, k) in data.funnel" :key="k">
        <div class="muted">{{ labels[k] || k }}</div>
        <div style="font-size:28px">{{ v }}</div>
      </div>
    </div>

    <div class="card stack" v-if="data">
      <strong>按产品进线</strong>
      <div v-for="(n, code) in data.by_product" :key="code" class="list-item row" style="cursor:default">
        <span class="grow">{{ code }}</span>
        <span class="tag">{{ n }}</span>
      </div>
      <strong>阶段分布</strong>
      <div v-for="(n, stage) in data.stages" :key="stage" class="list-item row" style="cursor:default">
        <span class="grow">{{ stage }}</span>
        <span class="tag">{{ n }}</span>
      </div>
    </div>
    <p v-if="error" class="tag warn">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { LeadApi } from '../api/client';

const toast = inject('toast', () => {});
const data = ref(null);
const product = ref('');
const error = ref('');
let _user = null;
try { _user = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* */ }
const canExport = computed(() => ['admin', 'supervisor'].includes(_user?.role));
const labels = {
  intake: '进线 intake',
  qualified: '合格 qualified',
  assigned: '已分配 assigned',
  reached_intent: '触达/意向 reached',
  appointed: '已预约 appointed',
  ordered: '成单 ordered(stub)',
  won: '赢单 won',
  lost: '丢单/无效 lost',
};

async function load() {
  error.value = '';
  try {
    data.value = await LeadApi.funnel(product.value || undefined);
  } catch (e) {
    error.value = e.message;
  }
}

async function exportCsv() {
  try {
    const t = localStorage.getItem('salesos_token');
    const res = await fetch(LeadApi.exportCsvUrl(), {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-export.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出 CSV（脱敏）');
  } catch (e) {
    toast(e.message || '导出失败');
  }
}

onMounted(load);
</script>
