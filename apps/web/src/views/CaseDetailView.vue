<template>
  <div class="page" v-if="detail" data-testid="case-detail-page">
    <div class="topbar">
      <AppNav />
      <div>
        <h2 style="margin:8px 0 0">案件详情</h2>
        <p class="muted" style="margin:0">{{ detail.case.id.slice(0, 8) }}
          <span v-if="detail.case.product_code" class="tag" style="margin-left:6px">{{ detail.case.product_code }}</span>
          <span class="tag" style="margin-left:6px">{{ detail.case.sea_status === 'public' ? '公海' : '私海' }}</span>
        </p>
      </div>
      <span class="tag">{{ detail.case.stage }}</span>
    </div>

    <div class="grid-3">
      <div class="card stack">
        <p class="section-title">概况</p>
        <dl class="kv">
          <dt>客户</dt><dd>{{ detail.identity?.name || '—' }} / {{ detail.identity?.phone || '—' }}</dd>
          <dt>公司</dt><dd>{{ detail.identity?.company_name || '—' }}</dd>
          <dt>意向</dt><dd>{{ detail.case.intent_level }} {{ detail.case.intent_qualified ? '·已合格' : '' }}</dd>
          <dt>来源</dt><dd>{{ detail.source?.type }} / {{ detail.source?.utm_campaign || detail.source?.campaign || '—' }}</dd>
        </dl>
        <div v-if="canWrite" class="row" style="flex-wrap:wrap">
          <button class="btn" :disabled="busy" @click="doQualify">核验合格</button>
          <button class="btn" :disabled="busy" @click="doAssign">分配给我</button>
          <button class="btn" :disabled="busy" @click="doMockCall">外呼 <span class="tag mock">MOCK</span></button>
        </div>
        <div v-if="canWrite" class="row" style="flex-wrap:wrap" data-testid="mark-result">
          <select class="input" style="width:auto" v-model="resultMark">
            <option value="">标记结果…</option>
            <option value="won">won 赢单</option>
            <option value="lost">lost 丢单</option>
            <option value="invalid">invalid 无效</option>
            <option value="nurture">nurture 培育</option>
            <option value="blocked">blocked 冻结</option>
          </select>
          <button class="btn" :disabled="busy || !resultMark" @click="doMarkResult">保存</button>
        </div>
      </div>

      <div class="card stack" data-testid="followup-form">
        <p class="section-title">极简跟进</p>
        <p class="muted" style="margin:0;font-size:12px">结果 · 备注 · 下次时间（必填）</p>
        <select class="input" v-model="followResult" data-testid="follow-result">
          <option value="connected">接通/有效沟通</option>
          <option value="no_answer">未接</option>
          <option value="callback">预约再跟</option>
          <option value="rejected">拒绝</option>
          <option value="other">其他</option>
        </select>
        <textarea class="textarea" v-model="note" placeholder="跟进备注…" data-testid="follow-note"></textarea>
        <label class="stack" style="gap:4px">
          <span class="muted" style="font-size:12px">下次跟进时间（必填）</span>
          <input class="input" type="datetime-local" v-model="nextFollowLocal" data-testid="next-follow-at" />
        </label>
        <p v-if="followError" class="tag warn" data-testid="follow-error">{{ followError }}</p>
        <button
          class="btn btn-primary"
          :disabled="busy || !canWrite"
          data-testid="follow-submit"
          @click="doNote"
        >保存跟进</button>
        <div v-if="detail.case.next_follow_at" data-testid="case-next-follow">
          <span class="muted" style="font-size:12px">下次：{{ formatTime(detail.case.next_follow_at) }}</span>
          <span class="tag" :class="detail.case.follow_up_status === 'open' ? 'warn' : 'ok'" style="margin-left:6px">
            {{ detail.case.follow_up_status === 'open' ? '待处理' : (detail.case.follow_up_status || '—') }}
          </span>
        </div>
      </div>

      <div class="card stack" data-testid="script-recommend">
        <p class="section-title">话术推荐</p>
        <div v-if="!(scripts || []).length" class="empty">{{ scriptsHint || '加载中…' }}</div>
        <div v-for="s in scripts || []" :key="s.id" class="list-item static">
          <div><strong>{{ s.title }}</strong> <span class="tag">{{ s.scene }}</span></div>
          <div class="muted" style="font-size:12px;white-space:pre-wrap">{{ s.body.slice(0, 120) }}{{ s.body.length > 120 ? '…' : '' }}</div>
        </div>
      </div>
    </div>

    <div v-if="sourceProvenance" class="card stack" style="margin-top:12px" data-testid="source-verification-provenance">
      <p class="section-title">公开来源核验</p>
      <dl class="kv">
        <dt>当前状态</dt><dd data-testid="verification-status-current">{{ sourceProvenance.verification_status || '—' }}</dd>
        <dt>说明</dt><dd data-testid="verification-explanation">{{ sourceProvenance.verification_explanation || '—' }}</dd>
      </dl>
    </div>

    <div class="card stack" style="margin-top:12px" data-testid="activity-timeline">
      <p class="section-title">活动时间轴</p>
      <div v-for="a in detail.activities || []" :key="a.id" class="list-item static">
        <div>{{ a.body }}</div>
        <div class="muted" style="font-size:12px">{{ a.kind }} · {{ formatTime(a.created_at) }}
          <span v-if="a.meta?.recording_url"> · 录音占位</span>
          <span v-if="a.meta?.mode" class="tag mock" style="margin-left:4px">{{ a.meta.mode }}</span>
        </div>
      </div>
      <div v-if="!(detail.activities || []).length" class="empty">暂无跟进记录</div>
    </div>

    <div class="card stack" style="margin-top:12px" data-testid="contracts-panel">
      <div class="row" style="justify-content:space-between">
        <p class="section-title">合同与回款</p>
        <button v-if="canWrite" class="btn" @click="showContractForm = !showContractForm">{{ showContractForm ? '收起' : '新建合同' }}</button>
      </div>
      <p v-if="detail.case.stage === 'WON' && !(contracts || []).length" class="tag warn">赢单建议补建合同</p>
      <div v-if="showContractForm" class="stack" style="gap:8px">
        <input class="input" v-model="contractForm.amount" placeholder="金额 如 50000" data-testid="contract-amount" />
        <select class="input" v-model="contractForm.status">
          <option value="draft">draft 草稿</option>
          <option value="signed">signed 已签</option>
        </select>
        <input class="input" v-model="contractForm.note" placeholder="备注（可选）" />
        <button class="btn btn-primary" :disabled="busy" data-testid="contract-create" @click="doCreateContract">保存合同</button>
      </div>
      <div v-for="c in contracts || []" :key="c.id" class="list-item static">
        <div>{{ c.amount }} {{ c.currency }} <span class="tag">{{ c.status }}</span></div>
        <div class="muted" style="font-size:12px">{{ formatTime(c.signed_at || c.created_at) }}</div>
        <div v-if="canWrite && c.status === 'signed'" class="row" style="margin-top:6px;flex-wrap:wrap">
          <input class="input" style="width:120px" v-model="planForms[c.id].amount" placeholder="计划金额" />
          <input class="input" style="width:auto" type="date" v-model="planForms[c.id].due" />
          <button class="btn" @click="doCreatePlan(c.id)">加回款计划</button>
          <input class="input" style="width:120px" v-model="receiptForms[c.id].amount" placeholder="实收金额" />
          <button class="btn btn-primary" @click="doCreateReceipt(c.id)">录实收</button>
        </div>
      </div>
      <div v-if="(plans || []).length" class="disclosure">
        <p class="muted" style="margin:0;font-size:12px">回款计划</p>
        <div v-for="p in plans" :key="p.id" class="list-item static">
          {{ p.amount }} · 到期 {{ formatTime(p.due_at) }} <span class="tag" :class="p.status === 'pending' ? 'warn' : 'ok'">{{ p.status }}</span>
        </div>
      </div>
      <div v-if="(receipts || []).length" class="disclosure">
        <p class="muted" style="margin:0;font-size:12px">实收</p>
        <div v-for="r in receipts" :key="r.id" class="list-item static">
          {{ r.amount }} · {{ formatTime(r.paid_at) }} · {{ r.method }}
        </div>
      </div>
    </div>

    <div class="card stack" style="margin-top:12px" data-testid="calls-panel">
      <div class="row" style="justify-content:space-between">
        <p class="section-title">通话 / 录音</p>
        <span class="tag mock">{{ callProvider }}</span>
      </div>
      <div v-for="c in calls || []" :key="c.id" class="list-item static row">
        <div class="grow">
          <div>{{ c.result || '—' }} · {{ c.duration_sec || 0 }}s
            <span class="tag mock">{{ c.mode }}</span>
            <span v-if="c.starred" class="tag ok">★ 优秀</span>
          </div>
          <div class="muted" style="font-size:12px">{{ c.recording_url || '无录音' }} · {{ formatTime(c.created_at) }}</div>
        </div>
        <button v-if="canWrite && !c.starred" class="btn" @click="doStar(c.id)">标星</button>
      </div>
      <div v-if="!(calls || []).length" class="empty">暂无通话记录</div>
    </div>

    <div class="card stack" style="margin-top:12px">
      <div class="row" style="justify-content:space-between">
        <p class="section-title">事件轨迹</p>
        <button class="btn btn-ghost" @click="showHistory = !showHistory">{{ showHistory ? '收起' : '展开' }}</button>
      </div>
      <div v-if="showHistory">
        <div v-for="e in detail.events" :key="e.id" class="list-item static">
          <div>{{ e.type }}</div>
          <div class="muted" style="font-size:12px">{{ formatTime(e.occurred_at) }}</div>
        </div>
      </div>
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
import AppNav from '../components/AppNav.vue';
import { ref, computed, reactive, onMounted, inject } from 'vue';
import { useRoute } from 'vue-router';
import { LeadApi, FinanceApi, DialApi, ScriptsApi } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const route = useRoute();
const toast = inject('toast', () => {});
const detail = ref(null);
const busy = ref(false);
const showConfirm = ref(false);
const showHistory = ref(false);
const note = ref('');
const nextFollowLocal = ref('');
const followResult = ref('connected');
const followError = ref('');
const resultMark = ref('');
const contracts = ref([]);
const plans = ref([]);
const receipts = ref([]);
const calls = ref([]);
const scripts = ref([]);
const scriptsHint = ref('');
const callProvider = ref('mock');
const showContractForm = ref(false);
const contractForm = ref({ amount: '', status: 'draft', note: '' });
const planForms = reactive({});
const receiptForms = reactive({});
const user = ref(null);
try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch { /* */ }
const canWrite = computed(() => user.value?.role !== 'viewer');
const draftAppt = computed(() =>
  (detail.value?.appointments || []).find((a) => a.status === 'draft') || null,
);
const sourceProvenance = computed(() => {
  const f = detail.value?.case?.flags || {};
  if (f.source_type !== 'authorized_public_list_import') return null;
  return {
    verification_status: f.verification_status,
    verification_explanation: f.verification_explanation,
  };
});

function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}
function toIsoFromLocal(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function loadFinance() {
  const id = route.params.id;
  contracts.value = await FinanceApi.listContracts(id).catch(() => []);
  plans.value = await FinanceApi.listPlans(id).catch(() => []);
  receipts.value = await FinanceApi.listReceipts(id).catch(() => []);
  for (const c of contracts.value) {
    if (!planForms[c.id]) planForms[c.id] = { amount: '', due: '' };
    if (!receiptForms[c.id]) receiptForms[c.id] = { amount: '' };
  }
}
async function loadCalls() {
  calls.value = await DialApi.listCalls(route.params.id).catch(() => []);
  const p = await DialApi.provider().catch(() => null);
  if (p) callProvider.value = p.call_provider || 'mock';
}
async function loadScripts() {
  const res = await ScriptsApi.recommend(route.params.id).catch(() => null);
  scripts.value = res?.items || [];
  scriptsHint.value = res?.empty_hint || '';
}

async function load() {
  detail.value = await LeadApi.getCase(route.params.id);
  if (route.query.confirm && draftAppt.value) showConfirm.value = true;
  await Promise.all([loadFinance(), loadCalls(), loadScripts()]);
}

async function wrap(fn) {
  busy.value = true;
  try { await fn(); await load(); }
  catch (e) { toast(e.message || '操作失败'); }
  finally { busy.value = false; }
}

function doQualify() { return wrap(() => LeadApi.qualify(route.params.id)); }
function doAssign() { return wrap(() => LeadApi.assign(route.params.id, user.value?.agent_seat_id)); }
function doMarkResult() {
  return wrap(async () => {
    await LeadApi.markResult(route.params.id, resultMark.value);
    toast('已标记: ' + resultMark.value);
    resultMark.value = '';
  });
}
function doMockCall() {
  return wrap(async () => {
    await DialApi.startCall({ case_id: route.params.id, result: 'connected' });
    toast('已写入 MOCK 通话记录');
  });
}
function doConfirm() {
  return wrap(async () => {
    if (!draftAppt.value) return;
    await LeadApi.confirmAppt(draftAppt.value.id);
    showConfirm.value = false;
    toast('预约已确认');
  });
}

async function doNote() {
  followError.value = '';
  const iso = toIsoFromLocal(nextFollowLocal.value);
  if (!iso) {
    followError.value = '请填写下次跟进时间';
    return;
  }
  if (!note.value.trim()) {
    followError.value = '请填写跟进备注';
    return;
  }
  return wrap(async () => {
    await LeadApi.addActivity(route.params.id, {
      kind: 'followup',
      body: `[${followResult.value}] ${note.value.trim()}`,
      next_follow_at: iso,
      meta: { result: followResult.value },
    });
    note.value = '';
    nextFollowLocal.value = '';
    toast('已保存跟进');
  });
}

async function doCreateContract() {
  return wrap(async () => {
    await FinanceApi.createContract({
      case_id: route.params.id,
      amount: contractForm.value.amount,
      status: contractForm.value.status,
      note: contractForm.value.note || undefined,
    });
    contractForm.value = { amount: '', status: 'draft', note: '' };
    showContractForm.value = false;
    toast('合同已创建');
  });
}
async function doCreatePlan(contractId) {
  const f = planForms[contractId] || {};
  if (!f.amount || !f.due) { toast('请填计划金额与到期日'); return; }
  return wrap(async () => {
    await FinanceApi.createPlan({
      contract_id: contractId,
      amount: f.amount,
      due_at: new Date(f.due).toISOString(),
    });
    toast('回款计划已添加');
  });
}
async function doCreateReceipt(contractId) {
  const f = receiptForms[contractId] || {};
  if (!f.amount) { toast('请填实收金额'); return; }
  return wrap(async () => {
    await FinanceApi.createReceipt({ contract_id: contractId, amount: f.amount });
    toast('实收已录入');
  });
}
async function doStar(callId) {
  return wrap(async () => {
    await DialApi.star(callId, {});
    toast('已标星优秀录音');
  });
}

onMounted(() => load().catch((e) => toast(e.message)));
</script>
