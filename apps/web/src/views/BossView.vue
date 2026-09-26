<template>
  <div class="page" data-testid="boss-page">
    <div class="topbar">
      <div>
        <h2 style="margin:8px 0 0">老板三屏</h2>
        <p class="muted" style="margin:0">今日待办 · 团队漏斗 · 回款风险</p>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <AppNav />
        <button class="btn" @click="load">刷新</button>
      </div>
    </div>
    <p v-if="error" class="tag warn">{{ error }}</p>
    <div class="boss-screens" v-if="data">
      <div class="card stack" data-testid="boss-screen-todos">
        <p class="section-title">屏1 · 团队今日待办</p>
        <div class="row">
          <div><div class="stat-label">今日到期</div><div class="stat">{{ data.screen1_team_todos.due_today_count }}</div></div>
          <div><div class="stat-label">逾期</div><div class="stat">{{ data.screen1_team_todos.overdue_count }}</div></div>
        </div>
        <div v-for="i in data.screen1_team_todos.items || []" :key="i.case_id" class="list-item" @click="$router.push(`/cases/${i.case_id}`)">
          <div>{{ i.company_name || i.name || i.case_id.slice(0, 8) }}
            <span v-if="i.overdue" class="tag danger">逾期</span>
          </div>
          <div class="muted" style="font-size:12px">{{ formatTime(i.next_follow_at) }}</div>
        </div>
        <div v-if="!(data.screen1_team_todos.items || []).length" class="empty">暂无团队到期待办</div>
      </div>
      <div class="card stack" data-testid="boss-screen-funnel">
        <p class="section-title">屏2 · 团队漏斗</p>
        <div class="stat">{{ data.screen2_funnel.total }}</div>
        <div class="stat-label">案件合计</div>
        <div v-for="(n, stage) in data.screen2_funnel.stages" :key="stage" class="list-item static row">
          <span class="grow">{{ stage }}</span><strong>{{ n }}</strong>
        </div>
      </div>
      <div class="card stack" data-testid="boss-screen-payment">
        <p class="section-title">屏3 · 回款风险</p>
        <div v-if="data.screen3_payment_risk.empty" class="empty" data-testid="payment-risk-empty">
          {{ data.screen3_payment_risk.empty_hint }}
        </div>
        <template v-else>
          <p class="muted" style="margin:0;font-size:12px">逾期计划 {{ (data.screen3_payment_risk.overdue_plans || []).length }} · 未回/未清合同 {{ (data.screen3_payment_risk.unpaid_or_open_contracts || []).length }}</p>
          <div v-for="p in data.screen3_payment_risk.overdue_plans || []" :key="p.plan_id" class="list-item" @click="$router.push(`/cases/${p.case_id}`)">
            <div>{{ p.amount }} <span class="tag danger">逾期 {{ p.days_overdue }} 天</span></div>
            <div class="muted" style="font-size:12px">到期 {{ formatTime(p.due_at) }}</div>
          </div>
          <div v-for="c in data.screen3_payment_risk.unpaid_or_open_contracts || []" :key="c.contract_id" class="list-item" @click="$router.push(`/cases/${c.case_id}`)">
            <div>合同 {{ c.amount }} {{ c.currency }}</div>
            <div class="muted" style="font-size:12px">实收 {{ c.receipts }} · 待计划 {{ c.pending_plans }}</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
<script setup>
import AppNav from '../components/AppNav.vue';
import { ref, onMounted, inject } from 'vue';
import { BossApi } from '../api/client';
const toast = inject('toast', () => {});
const data = ref(null);
const error = ref('');
function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}
async function load() {
  try {
    data.value = await BossApi.screens();
    error.value = '';
  } catch (e) {
    error.value = e.message || '加载失败';
    toast(error.value);
  }
}
onMounted(load);
</script>
