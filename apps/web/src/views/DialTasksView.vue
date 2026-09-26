<template>
  <div class="page" data-testid="dial-page">
    <div class="topbar">
      <div>
        <button class="btn btn-ghost" @click="$router.push('/')">← 工作台</button>
        <h2 style="margin:8px 0 0">外呼任务</h2>
        <p class="muted" style="margin:0">供应商 <span class="tag mock">{{ provider }}</span></p>
      </div>
      <button v-if="isAdmin" class="btn btn-primary" @click="showCreate = !showCreate">新建任务包</button>
    </div>
    <div v-if="showCreate" class="card stack" style="margin-bottom:12px">
      <input class="input" v-model="createForm.name" placeholder="任务名称" />
      <textarea class="textarea" v-model="createForm.case_ids_text" placeholder="案件 ID，每行一个（可从工作台复制）"></textarea>
      <button class="btn btn-primary" @click="createTask">创建</button>
    </div>
    <div class="grid-2">
      <div class="card stack">
        <p class="section-title">任务列表</p>
        <div v-for="t in tasks" :key="t.id" class="list-item" @click="select(t.id)">
          <div>{{ t.name }} <span class="tag">{{ t.status }}</span></div>
          <div class="muted" style="font-size:12px">完成 {{ t.done_items }}/{{ t.total_items }}</div>
        </div>
        <div v-if="!tasks.length" class="empty">暂无任务包</div>
      </div>
      <div class="card stack" v-if="detail" data-testid="dial-queue">
        <p class="section-title">{{ detail.task.name }} · 完成率 {{ detail.completion_rate }}%</p>
        <button class="btn btn-primary" data-testid="dial-next" :disabled="busy" @click="next">领取下一条</button>
        <div v-if="current" class="stack" style="gap:8px;margin-top:8px">
          <div>{{ current.identity?.company_name || current.identity?.name || current.item.case_id.slice(0, 8) }}</div>
          <div class="muted">{{ current.identity?.phone || '无号码' }}</div>
          <select class="input" v-model="result">
            <option value="no_answer">未接</option>
            <option value="connected">接通</option>
            <option value="callback">预约</option>
            <option value="rejected">拒绝</option>
            <option value="invalid">无效</option>
          </select>
          <input class="input" v-model="note" placeholder="备注" />
          <button class="btn btn-primary" data-testid="dial-result" @click="submitResult">回写结果并拨打(MOCK)</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, inject } from 'vue';
import { DialApi } from '../api/client';
const toast = inject('toast', () => {});
const user = ref(null);
try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch {}
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const tasks = ref([]);
const detail = ref(null);
const current = ref(null);
const provider = ref('mock');
const showCreate = ref(false);
const createForm = ref({ name: '', case_ids_text: '' });
const result = ref('connected');
const note = ref('');
const busy = ref(false);
async function load() {
  tasks.value = await DialApi.listTasks();
  const p = await DialApi.provider().catch(() => null);
  if (p) provider.value = p.call_provider;
}
async function select(id) {
  detail.value = await DialApi.getTask(id);
  current.value = null;
}
async function createTask() {
  const case_ids = createForm.value.case_ids_text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  try {
    await DialApi.createTask({ name: createForm.value.name, case_ids });
    toast('任务已创建');
    showCreate.value = false;
    createForm.value = { name: '', case_ids_text: '' };
    await load();
  } catch (e) { toast(e.message); }
}
async function next() {
  if (!detail.value) return;
  busy.value = true;
  try {
    const res = await DialApi.next(detail.value.task.id);
    current.value = res.item ? res : null;
    if (!res.item) toast(res.message || '队列已空');
  } catch (e) { toast(e.message); }
  finally { busy.value = false; }
}
async function submitResult() {
  if (!current.value?.item) return;
  try {
    await DialApi.result(current.value.item.id, { result: result.value, note: note.value, start_call: true });
    toast('已回写');
    current.value = null;
    note.value = '';
    await select(detail.value.task.id);
  } catch (e) { toast(e.message); }
}
onMounted(() => load().catch((e) => toast(e.message)));
</script>
