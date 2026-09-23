<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h2 style="margin:0">今日作战台</h2>
        <p class="muted" style="margin:0">{{ user?.display_name }} · {{ user?.tenant_name || '企业 AI 定制销售' }} · {{ user?.role }}</p>
      </div>
      <div class="row">
        <button v-if="canFunnel" class="btn" @click="$router.push('/admin/funnel')">漏斗</button>
        <button v-if="canFunnel" class="btn" @click="$router.push('/admin/conversion')">来源转化</button>
        <button v-if="canFunnel" class="btn" @click="$router.push('/admin/growth')">获客配置</button>
        <button class="btn" @click="logout">退出</button>
      </div>
    </div>

    <div class="row" style="margin-bottom:8px;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="muted" style="font-size:12px" data-testid="workbench-last-updated">
        最近更新 {{ lastUpdatedLabel }}
      </span>
      <span
        v-if="loadError"
        class="tag warn"
        style="font-size:12px"
        data-testid="workbench-load-error"
      >{{ loadError }}</span>
    </div>

    <div class="grid-3" style="margin-bottom:12px">
      <div class="card"><div class="muted">我的在办</div><div style="font-size:28px">{{ data?.stats?.my_open ?? '—' }}</div></div>
      <div class="card"><div class="muted">待确认预约</div><div style="font-size:28px">{{ data?.stats?.pending_confirm ?? '—' }}</div></div>
      <div class="card"><div class="muted">到期跟进</div><div style="font-size:28px" data-testid="due-follow-count">{{ data?.stats?.due_follow_ups ?? '—' }}</div></div>
    </div>

    <div class="card stack" style="margin-bottom:12px" data-testid="due-follow-ups">
      <div class="row" style="justify-content:space-between">
        <strong>到期跟进</strong>
        <span class="tag warn">站内提醒 · 外部消息待接入</span>
      </div>
      <div v-if="!(data?.due_follow_ups || []).length" class="muted">暂无到期待办</div>
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

    <div class="grid-3">
      <div class="card stack" style="grid-column: span 2">
        <div class="row" style="justify-content:space-between">
          <strong>案件列表</strong>
          <button v-if="canWrite" class="btn btn-primary" :disabled="busy" @click="runHappyPath">{{ busy ? '处理中…' : '新建演示线索并跑通' }}</button>
          <span v-else class="tag">只读演示</span>
        </div>
        <div v-if="!data?.cases?.length" class="muted">暂无案件。可从落地页留资，或点击上方按钮跑通演示路径。</div>
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
            <div class="muted" style="font-size:12px">路径 {{ c.path }} · 更新 {{ formatTime(c.updated_at) }}</div>
          </div>
          <span class="tag">{{ c.stage }}</span>
        </div>
      </div>

      <div class="card stack">
        <strong>待确认预约</strong>
        <div v-if="!data?.pending_appointments?.length" class="muted">暂无草稿预约</div>
        <div v-for="a in data?.pending_appointments || []" :key="a.id" class="list-item" @click="$router.push(`/cases/${a.case_id}`)">
          <div>{{ a.product_or_program }}</div>
          <div class="muted" style="font-size:12px">{{ formatTime(a.slot_start) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { LeadApi } from '../api/client';

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
let pollTimer = null;

try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* ignore */ }
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const isViewer = computed(() => user.value?.role === 'viewer');
const canWrite = computed(() => !isViewer.value);
const canFunnel = computed(() => isAdmin.value || isViewer.value);

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

async function runHappyPath() {
  busy.value = true;
  try {
    const phone = `138${String(Date.now()).slice(-8)}`;
    const intake = await LeadApi.intake({
      phone, name: '试用客户（合成）', source_type: 'ad_form', campaign: 'enterprise-ai-sales',
      path: 'STANDARD', product_code: 'usgate',
      consent_accepted: true,
      utm_source: 'demo', utm_medium: 'workbench', invite_code: 'DEMO01',
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
  pollTimer = setInterval(() => { load(); }, POLL_MS);
});

onUnmounted(() => {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>
