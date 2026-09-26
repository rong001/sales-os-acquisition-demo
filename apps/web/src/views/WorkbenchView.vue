<template>
  <div class="page" data-testid="workbench-page">
    <div class="topbar">
      <div>
        <h2 style="margin:0">坐席工作台</h2>
        <p class="muted" style="margin:0">{{ user?.display_name }} · {{ user?.role }}</p>
      </div>
      <AppNav />
    </div>

    <div class="row" style="margin-bottom:8px;justify-content:space-between;flex-wrap:wrap">
      <span class="muted" style="font-size:12px" data-testid="workbench-last-updated">最近更新 {{ lastUpdatedLabel }}</span>
      <span v-if="loadError" class="tag warn" data-testid="workbench-load-error">{{ loadError }}</span>
    </div>

    <div class="grid-3" style="margin-bottom:12px">
      <div class="card"><div class="stat-label">我的在办</div><div class="stat">{{ data?.stats?.my_open ?? '—' }}</div></div>
      <div class="card"><div class="stat-label">待确认预约</div><div class="stat">{{ data?.stats?.pending_confirm ?? '—' }}</div></div>
      <div class="card"><div class="stat-label">到期跟进</div><div class="stat" data-testid="due-follow-count">{{ data?.stats?.due_follow_ups ?? '—' }}</div></div>
    </div>

    <div class="card stack" style="margin-bottom:12px" data-testid="due-follow-ups">
      <div class="row" style="justify-content:space-between">
        <p class="section-title">今日待办（按下次跟进时间）</p>
        <span class="tag warn">站内列表 · 非推送</span>
      </div>
      <div v-if="!(data?.due_follow_ups || []).length" class="empty">暂无到期待办</div>
      <div
        v-for="r in data?.due_follow_ups || []"
        :key="r.case_id"
        class="list-item row"
        data-testid="due-follow-item"
      >
        <div class="grow" style="cursor:pointer" @click="$router.push(`/cases/${r.case_id}`)">
          <div>{{ r.case_id.slice(0, 8) }} · {{ stageLabel(r.stage) }}
            <span v-if="r.product_code" class="tag" style="margin-left:6px">{{ r.product_code }}</span>
          </div>
          <div class="muted" style="font-size:12px">到期 {{ formatTime(r.next_follow_at) }}</div>
        </div>
        <button
          v-if="canWrite"
          class="btn btn-primary"
          :disabled="busyId === r.case_id"
          data-testid="due-follow-handle"
          @click.stop="doHandle(r.case_id)"
        >已处理</button>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:12px">
      <div class="card stack" data-testid="my-cases">
        <div class="row" style="justify-content:space-between">
          <p class="section-title">我的案件</p>
          <button v-if="canWrite" class="btn btn-primary" :disabled="busy" @click="runHappyPath">{{ busy ? '…' : '合成演示' }}</button>
        </div>
        <div v-if="!data?.cases?.length" class="empty">暂无案件</div>
        <div
          v-for="c in data?.cases || []"
          :key="c.id"
          class="list-item row"
          @click="$router.push(`/cases/${c.id}`)"
        >
          <div class="grow">
            <div>{{ c.id.slice(0, 8) }} · {{ stageLabel(c.stage) }}
              <span v-if="c.product_code" class="tag" style="margin-left:6px">{{ c.product_code }}</span>
              <span v-if="c.follow_up_status === 'open' && c.next_follow_at" class="tag warn" style="margin-left:6px">下次跟进</span>
            </div>
            <div class="muted" style="font-size:12px">更新 {{ formatTime(c.updated_at) }}</div>
          </div>
          <span class="tag">{{ c.stage }}</span>
        </div>
      </div>

      <div class="card stack" data-testid="public-sea-claim">
        <div class="row" style="justify-content:space-between">
          <p class="section-title">公海领取</p>
          <button class="btn btn-ghost" @click="loadPool">刷新</button>
        </div>
        <p v-if="poolRules" class="muted" style="margin:0;font-size:12px">
          上限 {{ poolRules.max_private_cases }} · 保护 {{ poolRules.protect_hours }}h · 闲置 {{ poolRules.idle_days_to_recycle }} 天回收
        </p>
        <div v-if="!(poolItems || []).length" class="empty">公海暂无可领案件</div>
        <div v-for="p in poolItems || []" :key="p.case_id" class="list-item row">
          <div class="grow" style="cursor:pointer" @click="$router.push(`/cases/${p.case_id}`)">
            <div>{{ p.company_name || p.name || p.case_id.slice(0, 8) }}
              <span class="tag" style="margin-left:6px">{{ p.stage }}</span>
            </div>
            <div class="muted" style="font-size:12px">{{ p.phone_masked || '—' }}</div>
          </div>
          <button
            v-if="canWrite"
            class="btn btn-primary"
            data-testid="pool-claim-btn"
            :disabled="claimBusy === p.case_id"
            @click.stop="doClaim(p.case_id)"
          >领取</button>
        </div>
      </div>
    </div>

    <div v-if="showAdvanced" class="card stack disclosure" data-testid="authorized-public-import">
      <div class="row" style="justify-content:space-between">
        <p class="section-title">公开来源导入（高级）</p>
        <button class="btn btn-ghost" @click="showAdvanced = false">收起</button>
      </div>
      <p class="muted" style="margin:0;font-size:12px">真实公开来源 · 未知存 UNKNOWN · 完整导入见「导入」页</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="input" style="flex:1;min-width:140px" v-model="importForm.company_name" placeholder="公司名" />
        <input class="input" style="flex:2;min-width:200px" v-model="importForm.official_site_url" placeholder="官网 URL https://…" />
        <button class="btn btn-primary" :disabled="importBusy || !canWrite" data-testid="authorized-public-import-submit" @click="runAuthorizedImport">
          {{ importBusy ? '…' : '导入' }}
        </button>
      </div>
      <p v-if="importMsg" class="muted" style="margin:0;font-size:12px" data-testid="authorized-public-import-msg">{{ importMsg }}</p>
    </div>
    <div v-else-if="isAdmin" style="margin-top:8px">
      <button class="btn btn-ghost" @click="showAdvanced = true">展开公开来源导入…</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { LeadApi, PoolApi } from '../api/client';
import AppNav from '../components/AppNav.vue';

const POLL_MS = 5000;
const router = useRouter();
const toast = inject('toast', () => {});
const data = ref(null);
const busy = ref(false);
const busyId = ref('');
const user = ref(null);
const loadError = ref('');
const lastUpdatedAt = ref(null);
const inFlight = ref(false);
const importBusy = ref(false);
const importMsg = ref('');
const showAdvanced = ref(false);
const importForm = ref({
  company_name: '',
  official_site_url: '',
  product_code: 'sales-agent',
  match_reason_vs_icp: '',
});
const poolItems = ref([]);
const poolRules = ref(null);
const claimBusy = ref('');
let pollTimer = null;

try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* */ }
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const canWrite = computed(() => user.value?.role !== 'viewer');
const canFunnel = computed(() => isAdmin.value || user.value?.role === 'viewer');
const canBoss = computed(() => isAdmin.value || user.value?.role === 'viewer');
const lastUpdatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return '—';
  try { return new Date(lastUpdatedAt.value).toLocaleString('zh-CN'); } catch { return String(lastUpdatedAt.value); }
});

function stageLabel(s) {
  const map = {
    NEW: '新建', QUALIFIED: '已合格', ASSIGNED: '已分配', REACHING: '触达中', IN_DIALOG: '会话中',
    APPOINTMENT_PENDING: '待确认预约', APPOINTED: '已预约', NURTURE: '培育', BLOCKED: '冻结',
    WON: '赢单', LOST: '丢单',
  };
  return map[s] || s;
}
function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}

async function load() {
  if (inFlight.value) return;
  inFlight.value = true;
  try {
    data.value = await LeadApi.today();
    lastUpdatedAt.value = new Date().toISOString();
    loadError.value = '';
  } catch (e) {
    loadError.value = e?.message || '作战台刷新失败';
  } finally {
    inFlight.value = false;
  }
}

async function loadPool() {
  try {
    const res = await PoolApi.publicList(20);
    poolItems.value = res.items || [];
    poolRules.value = res.rules || null;
  } catch { /* soft */ }
}

async function doClaim(caseId) {
  claimBusy.value = caseId;
  try {
    await PoolApi.claim(caseId);
    toast('已领取到私海');
    await Promise.all([load(), loadPool()]);
  } catch (e) {
    toast(e.message || '领取失败');
  } finally {
    claimBusy.value = '';
  }
}

async function doHandle(caseId) {
  busyId.value = caseId;
  try {
    await LeadApi.handleFollowUp(caseId);
    toast('已标记跟进处理');
    await load();
  } catch (e) {
    toast(e.message || '处理失败');
  } finally {
    busyId.value = '';
  }
}

async function runAuthorizedImport() {
  importBusy.value = true;
  importMsg.value = '';
  try {
    const res = await LeadApi.importAuthorizedPublicList({
      fetch_official: true,
      batch_label: 'workbench-ui',
      items: [{
        company_name: importForm.value.company_name,
        official_site_url: importForm.value.official_site_url,
        product_code: importForm.value.product_code,
        match_reason_vs_icp: importForm.value.match_reason_vs_icp,
        contact_person: 'UNKNOWN',
        demand: 'UNKNOWN',
        consent_status: 'UNKNOWN',
      }],
    });
    const first = res?.items?.[0];
    importMsg.value = first
      ? `已导入 ${first.company_name} · verification=${first.verification_status || '?'} · case=${String(first.case_id).slice(0, 8)}`
      : `已导入 ${res?.imported || 0} 条`;
    toast('公开来源导入成功');
    await load();
    await loadPool();
  } catch (e) {
    importMsg.value = e.message || '导入失败';
    toast(importMsg.value);
  } finally {
    importBusy.value = false;
  }
}

async function runHappyPath() {
  busy.value = true;
  try {
    const phone = `138${String(Date.now()).slice(-8)}`;
    const intake = await LeadApi.intake({
      phone,
      name: 'SYNTHETIC_FIXTURE 试用客户',
      company_name: 'SYNTHETIC fixture co (NOT public acquisition)',
      source_type: 'synthetic_fixture',
      source_channel: 'synthetic_fixture',
      campaign: 'enterprise-ai-sales',
      path: 'STANDARD',
      product_code: 'sales-agent',
      consent_accepted: true,
      utm_source: 'synthetic_fixture',
      utm_medium: 'workbench',
      invite_code: 'DEMO01',
      raw: { label: 'SYNTHETIC_FIXTURE', demo_not_customer_deal: true },
    });
    const caseId = intake.case.id;
    await LeadApi.qualify(caseId);
    await LeadApi.assign(caseId, user.value?.agent_seat_id);
    const attempt = await LeadApi.createAttempt(caseId, 'mock_call');
    const receipt = await LeadApi.mockReceipt(attempt.id, 'connected_intent');
    toast('线索已触达并生成预约草稿（MOCK）');
    await load();
    const apptId = receipt.appointment?.id;
    router.push(apptId ? `/cases/${caseId}?confirm=${apptId}` : `/cases/${caseId}`);
  } catch (e) {
    toast(e.message || '流程失败');
  } finally {
    busy.value = false;
  }
}

function logout() {
  localStorage.removeItem('salesos_token');
  localStorage.removeItem('salesos_user');
  router.push('/login');
}

onMounted(() => {
  load();
  loadPool();
  pollTimer = setInterval(() => { load(); }, POLL_MS);
});
onUnmounted(() => {
  if (pollTimer != null) { clearInterval(pollTimer); pollTimer = null; }
});
</script>
