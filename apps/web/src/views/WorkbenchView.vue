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
        <span class="tag warn">站内列表轮询 · 非 worker 推送 · 外部消息待接入</span>
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

    <div v-if="isAdmin" class="card stack" style="margin-bottom:12px" data-testid="authorized-public-import">
      <div class="row" style="justify-content:space-between;align-items:center">
        <strong>企业线索导入（公开来源 / 授权名单）</strong>
        <span class="tag">真实公开来源 · 未知字段存 UNKNOWN · 非合成夹具</span>
      </div>
      <p class="muted" style="margin:0;font-size:12px">
        只读抓取官网摘要作 provenance；不发明联系人/同意/需求；不外发邮件/电话/私信。合成演示请用下方「新建演示线索」。
      </p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <input class="input" style="flex:1;min-width:140px" v-model="importForm.company_name" placeholder="公司名" />
        <input class="input" style="flex:2;min-width:200px" v-model="importForm.official_site_url" placeholder="官网 URL https://…" />
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <select class="input" style="width:auto" v-model="importForm.product_code">
          <option value="ai-cs">AI客服</option>
          <option value="kb-crm">知识库/CRM流程自动化</option>
          <option value="sales-agent">销售智能体</option>
        </select>
        <input class="input" style="flex:1;min-width:200px" v-model="importForm.match_reason_vs_icp" placeholder="ICP 匹配理由" />
        <button class="btn btn-primary" :disabled="importBusy || !canWrite" data-testid="authorized-public-import-submit" @click="runAuthorizedImport">
          {{ importBusy ? '导入中…' : '导入公开来源' }}
        </button>
      </div>
      <p v-if="importMsg" class="muted" style="margin:0;font-size:12px" data-testid="authorized-public-import-msg">{{ importMsg }}</p>
    </div>

    <div class="grid-3">
      <div class="card stack" style="grid-column: span 2">
        <div class="row" style="justify-content:space-between">
          <strong>案件列表</strong>
          <button v-if="canWrite" class="btn btn-primary" :disabled="busy" @click="runHappyPath">{{ busy ? '处理中…' : '新建合成演示线索并跑通' }}</button>
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
const importBusy = ref(false);
const importMsg = ref('');
const importForm = ref({
  company_name: '',
  official_site_url: '',
  product_code: 'sales-agent',
  match_reason_vs_icp: '',
});
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
    WON: '演示赢单（非客户成交）', LOST: '丢单',
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
      ? `已导入 ${first.company_name} · source=authorized_public_list_import · consent=${first.consent_status} · case=${String(first.case_id).slice(0, 8)}`
      : `已导入 ${res?.imported || 0} 条`;
    toast('公开来源导入成功（UNKNOWN 字段未发明）');
    importForm.value.company_name = '';
    importForm.value.official_site_url = '';
    importForm.value.match_reason_vs_icp = '';
    await load();
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
  pollTimer = setInterval(() => { load(); }, POLL_MS);
});

onUnmounted(() => {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>
