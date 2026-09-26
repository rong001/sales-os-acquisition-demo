<template>
  <div class="page" data-testid="pool-page">
    <div class="topbar">
      <div>
        <h2 style="margin:8px 0 0">公海规则</h2>
      </div>
      <AppNav />
    </div>
    <div class="grid-2">
      <div class="card stack" data-testid="pool-rules-form">
        <p class="section-title">规则配置（经理）</p>
        <label class="stack" style="gap:4px"><span class="muted">私海上限</span>
          <input class="input" type="number" v-model.number="form.max_private_cases" :disabled="!isAdmin" /></label>
        <label class="stack" style="gap:4px"><span class="muted">保护期（小时）</span>
          <input class="input" type="number" v-model.number="form.protect_hours" :disabled="!isAdmin" /></label>
        <label class="stack" style="gap:4px"><span class="muted">闲置回收（天）</span>
          <input class="input" type="number" v-model.number="form.idle_days_to_recycle" :disabled="!isAdmin" /></label>
        <label class="row"><input type="checkbox" v-model="form.enabled" :disabled="!isAdmin" /> 启用规则</label>
        <button v-if="isAdmin" class="btn btn-primary" :disabled="busy" data-testid="pool-rules-save" @click="save">保存规则</button>
        <button v-if="isAdmin" class="btn" :disabled="busy" @click="recycle">立即回收闲置</button>
        <p class="muted" style="margin:0;font-size:12px">销售可见当前规则；并发领取同案仅一人成功。</p>
      </div>
      <div class="card stack" data-testid="pool-public-list">
        <p class="section-title">公海可领</p>
        <div v-for="p in items" :key="p.case_id" class="list-item row">
          <div class="grow" @click="$router.push(`/cases/${p.case_id}`)">
            <div>{{ p.company_name || p.name || p.case_id.slice(0, 8) }}</div>
            <div class="muted" style="font-size:12px">{{ p.stage }} · {{ p.phone_masked || '—' }}</div>
          </div>
          <button class="btn btn-primary" @click="claim(p.case_id)">领取</button>
        </div>
        <div v-if="!items.length" class="empty">暂无可领</div>
      </div>
    </div>
    <div v-if="isAdmin" class="card stack" style="margin-top:12px" data-testid="pool-audits">
      <p class="section-title">审计日志</p>
      <div v-for="a in audits" :key="a.id" class="list-item static">
        <div>{{ a.action }} · case {{ (a.case_id || '').slice(0, 8) || '—' }}</div>
        <div class="muted" style="font-size:12px">{{ formatTime(a.created_at) }}</div>
      </div>
    </div>
  </div>
</template>
<script setup>
import AppNav from '../components/AppNav.vue';
import { ref, computed, onMounted, inject } from 'vue';
import { PoolApi } from '../api/client';
const toast = inject('toast', () => {});
const user = ref(null);
try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch {}
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const form = ref({ max_private_cases: 50, protect_hours: 48, idle_days_to_recycle: 7, enabled: true });
const items = ref([]);
const audits = ref([]);
const busy = ref(false);
function formatTime(v) { try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); } }
async function load() {
  const res = await PoolApi.publicList(50);
  items.value = res.items || [];
  if (res.rules) form.value = { ...form.value, ...res.rules };
  if (isAdmin.value) audits.value = await PoolApi.audits(30).catch(() => []);
}
async function save() {
  busy.value = true;
  try {
    await PoolApi.putRules({
      max_private_cases: form.value.max_private_cases,
      protect_hours: form.value.protect_hours,
      idle_days_to_recycle: form.value.idle_days_to_recycle,
      enabled: form.value.enabled,
    });
    toast('规则已保存');
    await load();
  } catch (e) { toast(e.message); }
  finally { busy.value = false; }
}
async function claim(id) {
  try { await PoolApi.claim(id); toast('已领取'); await load(); }
  catch (e) { toast(e.message); }
}
async function recycle() {
  try {
    const r = await PoolApi.recycle();
    toast(`回收 ${r.recycled || 0} 件`);
    await load();
  } catch (e) { toast(e.message); }
}
onMounted(() => load().catch((e) => toast(e.message)));
</script>
