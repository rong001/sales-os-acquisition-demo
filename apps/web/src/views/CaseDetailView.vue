<template>
  <div class="page" v-if="detail">
    <div class="topbar">
      <div>
        <button class="btn" @click="$router.push('/')">← 返回</button>
        <h2 style="margin:8px 0 0">案件详情</h2>
        <p class="muted" style="margin:0">{{ detail.case.id }}
          <span v-if="detail.case.product_code" class="tag" style="margin-left:6px">{{ detail.case.product_code }}</span>
        </p>
      </div>
      <span class="tag">{{ detail.case.stage }}</span>
    </div>

    <div class="grid-3">
      <div class="card stack">
        <strong>当前阶段</strong>
        <dl class="kv">
          <dt>客户</dt><dd>{{ detail.identity?.name || '—' }} / {{ detail.identity?.phone || '—' }}</dd>
          <dt>路径</dt><dd>{{ detail.case.path }}</dd>
          <dt>意向</dt><dd>{{ detail.case.intent_level }} {{ detail.case.intent_qualified ? '·已合格' : '' }}</dd>
          <dt>来源</dt><dd>{{ detail.source?.type }} / {{ detail.source?.utm_campaign || detail.source?.campaign }}</dd>
          <dt>UTM</dt>
          <dd class="muted" style="font-size:12px">
            {{ detail.source?.utm_source || '—' }} / {{ detail.source?.utm_medium || '—' }}
            · invite {{ detail.source?.invite_code || '—' }}
          </dd>
        </dl>
        <div v-if="canWrite" class="row" style="flex-wrap:wrap">
          <button class="btn" :disabled="busy" @click="doQualify">核验合格</button>
          <button class="btn" :disabled="busy" @click="doAssign">分配给我</button>
          <button class="btn" :disabled="busy" @click="doAttempt">发起触达 <span class="tag mock">MOCK</span></button>
          <button class="btn" :disabled="busy" @click="doEmailAttempt">邮件触达 <span class="tag warn">未配置=未送达</span></button>
          <button class="btn" :disabled="busy" @click="doReceipt">模拟接通意向 <span class="tag mock">MOCK</span></button>
        </div>
        <div v-if="canWrite" class="row" style="flex-wrap:wrap;margin-top:4px" data-testid="mark-result">
          <select class="input" style="width:auto" v-model="resultMark">
            <option value="">标记结果…</option>
            <option value="won">won 赢单</option>
            <option value="lost">lost 丢单</option>
            <option value="invalid">invalid 无效</option>
            <option value="nurture">nurture 培育</option>
            <option value="blocked">blocked 冻结</option>
          </select>
          <button class="btn" :disabled="busy || !resultMark" @click="doMarkResult">保存结果</button>
        </div>
        <p v-else class="muted" style="margin:0">只读访客：不可分配/触达/改写</p>
        <div v-if="isAdmin" class="row" style="flex-wrap:wrap;margin-top:4px">
          <select class="input" style="width:auto;min-width:160px" v-model="assignSeat">
            <option value="">选择坐席…</option>
            <option v-for="a in agents" :key="a.seat_id" :value="a.seat_id">
              {{ a.display_name }} (load {{ a.current_load }})
            </option>
          </select>
          <button class="btn" :disabled="busy || !assignSeat" @click="doAdminAssign">管理员分配</button>
        </div>
      </div>

      <div class="card stack">
        <strong>推荐下一步</strong>
        <p class="muted" style="margin:0">{{ nextHint }}</p>
        <button
          v-if="draftAppt && canWrite"
          class="btn btn-primary"
          @click="showConfirm = true"
        >一键确认预约</button>
        <div v-if="riskText" class="tag warn">{{ riskText }}</div>
      </div>

      <div class="card stack">
        <strong>预约</strong>
        <div v-for="a in detail.appointments" :key="a.id" class="list-item" style="cursor:default">
          <div class="row">
            <span class="grow">{{ a.product_or_program }}</span>
            <span class="tag" :class="a.valid ? 'ok' : ''">{{ a.status }}{{ a.valid ? ' ·有效' : '' }}</span>
          </div>
          <div class="muted" style="font-size:12px">{{ formatTime(a.slot_start) }}</div>
        </div>
        <div v-if="!detail.appointments?.length" class="muted">尚无预约</div>
      </div>
    </div>

    <div class="card stack" style="margin-top:12px">
      <strong>跟进时间线</strong>
      <div v-for="a in detail.activities || []" :key="a.id" class="list-item" style="cursor:default">
        <div>{{ a.body }}</div>
        <div class="muted" style="font-size:12px">{{ a.kind }} · {{ formatTime(a.created_at) }}</div>
      </div>
      <div v-if="!(detail.activities || []).length" class="muted">暂无跟进记录</div>
      <div v-if="canWrite" class="row">
        <input class="input grow" v-model="note" placeholder="添加跟进备注…" @keyup.enter="doNote" />
        <button class="btn btn-primary" :disabled="busy || !note.trim()" @click="doNote">添加</button>
      </div>
    </div>

    <div class="card stack" style="margin-top:12px">
      <div class="row" style="justify-content:space-between">
        <strong>事件轨迹</strong>
        <button class="btn" @click="showHistory = !showHistory">{{ showHistory ? '收起' : '展开历史' }}</button>
      </div>
      <div v-if="showHistory">
        <div v-for="e in detail.events" :key="e.id" class="list-item" style="cursor:default">
          <div>{{ e.type }}
            <span v-if="e.payload?.mock" class="tag mock">MOCK</span>
          </div>
          <div class="muted" style="font-size:12px">{{ formatTime(e.occurred_at) }} · {{ e.actor }}</div>
        </div>
        <div v-if="!detail.events?.length" class="muted">暂无事件</div>
      </div>
      <div v-else class="muted">默认折叠。当前阶段关键信息见上方三块。</div>
    </div>

    <ConfirmDialog
      :open="showConfirm"
      :appointment="draftAppt"
      :loading="busy"
      @cancel="showConfirm = false"
      @confirm="doConfirm"
    />
  </div>
  <div v-else class="page muted">加载中…</div>
</template>

<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { useRoute } from 'vue-router';
import { LeadApi } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const route = useRoute();
const toast = inject('toast', () => {});
const detail = ref(null);
const busy = ref(false);
const showConfirm = ref(false);
const showHistory = ref(false);
const note = ref('');
const agents = ref([]);
const assignSeat = ref('');
const resultMark = ref('');
const user = ref(null);
try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* */ }
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const canWrite = computed(() => user.value?.role !== 'viewer');

const draftAppt = computed(() =>
  (detail.value?.appointments || []).find((a) => a.status === 'draft') || null,
);

const nextHint = computed(() => {
  const s = detail.value?.case?.stage;
  if (s === 'NEW') return '建议：核验合格';
  if (s === 'QUALIFIED') return '建议：分配坐席并发起触达';
  if (s === 'ASSIGNED' || s === 'REACHING') return '建议：记录触达回执（演示可模拟接通意向 · MOCK）';
  if (s === 'IN_DIALOG' || s === 'APPOINTMENT_PENDING') return '建议：确认预约草稿（含费用/边界披露）';
  if (s === 'APPOINTED') return 'P2 已达成，可继续跟进';
  return '查看事件轨迹或返回作战台';
});

const riskText = computed(() => {
  const f = detail.value?.case?.flags || {};
  if (f.refused || f.blocked) return '风险：禁呼/拒绝，禁止营销触达';
  return '';
});

function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}

async function load() {
  detail.value = await LeadApi.getCase(route.params.id);
  if (route.query.confirm && draftAppt.value) showConfirm.value = true;
  if (isAdmin.value) {
    agents.value = await LeadApi.listAgents().catch(() => []);
  }
}

async function wrap(fn) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast(e.message || '操作失败');
  } finally {
    busy.value = false;
  }
}

function doQualify() { return wrap(() => LeadApi.qualify(route.params.id)); }
function doAssign() {
  return wrap(() => LeadApi.assign(route.params.id, user.value?.agent_seat_id));
}
function doAdminAssign() {
  return wrap(() => LeadApi.assign(route.params.id, assignSeat.value));
}
function doAttempt() { return wrap(() => LeadApi.createAttempt(route.params.id, 'mock_call')); }
function doEmailAttempt() {
  return wrap(async () => {
    const res = await LeadApi.createAttempt(route.params.id, 'email');
    toast(res.label === 'UNDELIVERED_NO_SMTP' ? '邮件未送达（无 SMTP）' : (res.label || '邮件尝试已记录'));
  });
}
function doMarkResult() {
  return wrap(async () => {
    await LeadApi.markResult(route.params.id, resultMark.value);
    toast('已标记结果: ' + resultMark.value);
    resultMark.value = '';
  });
}
function doReceipt() {
  return wrap(async () => {
    const attempts = detail.value?.attempts || [];
    let attempt = attempts[attempts.length - 1];
    if (!attempt) attempt = await LeadApi.createAttempt(route.params.id, 'mock_call');
    await LeadApi.mockReceipt(attempt.id, 'connected_intent');
    toast('已模拟接通意向（MOCK），预约草稿已生成');
    showConfirm.value = true;
  });
}
function doConfirm() {
  return wrap(async () => {
    if (!draftAppt.value) return;
    const res = await LeadApi.confirmAppt(draftAppt.value.id);
    showConfirm.value = false;
    toast(res.event || '预约已确认');
  });
}
function doNote() {
  return wrap(async () => {
    await LeadApi.addActivity(route.params.id, { kind: 'note', body: note.value });
    note.value = '';
    toast('已添加跟进');
  });
}

onMounted(() => load().catch((e) => toast(e.message)));
</script>
