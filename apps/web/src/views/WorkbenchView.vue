<template>
  <div class="page">
    <div class="topbar">
      <div>
        <h2 style="margin:0">今日作战台</h2>
        <p class="muted" style="margin:0">{{ user?.display_name }} · {{ user?.tenant_name || '演示销售公司' }} · {{ user?.role }}</p>
      </div>
      <div class="row">
        <a class="btn" href="/p/ticket-grab" target="_blank">落地页·抢票</a>
        <a class="btn" href="/p/usgate" target="_blank">落地页·USGate</a>
        <button v-if="isAdmin" class="btn" @click="$router.push('/admin/funnel')">漏斗</button>
        <button class="btn" @click="logout">退出</button>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:12px">
      <div class="card"><div class="muted">我的在办</div><div style="font-size:28px">{{ data?.stats?.my_open ?? '—' }}</div></div>
      <div class="card"><div class="muted">待确认预约</div><div style="font-size:28px">{{ data?.stats?.pending_confirm ?? '—' }}</div></div>
      <div class="card"><div class="muted">触达中</div><div style="font-size:28px">{{ data?.stats?.reaching ?? '—' }}</div></div>
    </div>

    <div class="grid-3">
      <div class="card stack" style="grid-column: span 2">
        <div class="row" style="justify-content:space-between">
          <strong>案件列表</strong>
          <button class="btn btn-primary" :disabled="busy" @click="runHappyPath">{{ busy ? '处理中…' : '新建演示线索并跑通' }}</button>
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
import { ref, computed, onMounted, inject } from 'vue';
import { useRouter } from 'vue-router';
import { LeadApi } from '../api/client';

const router = useRouter();
const toast = inject('toast', () => {});
const data = ref(null);
const busy = ref(false);
const user = ref(null);

try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* ignore */ }
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));

function stageLabel(s) {
  const map = {
    NEW: '新建', QUALIFIED: '已合格', ASSIGNED: '已分配', REACHING: '触达中', IN_DIALOG: '会话中',
    APPOINTMENT_PENDING: '待确认预约', APPOINTED: '已预约', NURTURE: '培育', BLOCKED: '冻结',
  };
  return map[s] || s;
}
function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}

async function load() {
  data.value = await LeadApi.today();
}

async function runHappyPath() {
  busy.value = true;
  try {
    const phone = `138${String(Date.now()).slice(-8)}`;
    const intake = await LeadApi.intake({
      phone, name: '演示客户', source_type: 'ad_form', campaign: 'm1-demo',
      path: 'STANDARD', product_code: 'ticket-grab',
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

onMounted(() => load().catch((e) => toast(e.message)));
</script>
