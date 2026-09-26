<template>
  <div class="page page-narrow" data-testid="wecom-sidepanel">
    <div class="card stack">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0;font-size:18px">企微侧边栏</h2>
        <span class="tag mock">{{ status?.honest_label || 'MOCK' }}</span>
      </div>
      <p class="muted" style="margin:0;font-size:12px">{{ status?.setup_hint || '官方应用配置后可切 REAL' }}</p>
      <label class="stack" style="gap:4px"><span class="muted">外部联系人 ID / 手机 / 案件 ID</span>
        <input class="input" v-model="query.external_userid" placeholder="external_userid（MOCK 可任意）" />
        <input class="input" v-model="query.phone" placeholder="手机号（可选）" />
        <input class="input" v-model="query.case_id" placeholder="case_id（可选）" />
      </label>
      <button class="btn btn-primary" @click="resolve">解析案件</button>
      <div v-if="ctx?.case" class="stack" style="gap:6px">
        <div>案件 {{ ctx.case.id.slice(0, 8) }} · {{ ctx.case.stage }}</div>
        <div class="muted">{{ ctx.identity?.name }} / {{ ctx.identity?.phone }} / {{ ctx.identity?.company_name }}</div>
        <select class="input" v-model="follow.result">
          <option value="connected">有效沟通</option>
          <option value="callback">再跟</option>
          <option value="rejected">拒绝</option>
        </select>
        <textarea class="textarea" v-model="follow.body" placeholder="跟进备注"></textarea>
        <input class="input" type="datetime-local" v-model="follow.next_follow_at" />
        <input class="input" v-model="follow.tags" placeholder="标签，逗号分隔" />
        <button class="btn btn-primary" data-testid="wecom-follow-submit" @click="submit">写跟进</button>
      </div>
      <p v-if="msg" class="muted" style="margin:0;font-size:12px">{{ msg }}</p>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, inject } from 'vue';
import { WecomApi } from '../api/client';
const toast = inject('toast', () => {});
const status = ref(null);
const query = ref({ external_userid: 'mock-ext-001', phone: '', case_id: '' });
const ctx = ref(null);
const follow = ref({ body: '', next_follow_at: '', result: 'connected', tags: '' });
const msg = ref('');
async function loadStatus() { status.value = await WecomApi.status(); }
async function resolve() {
  try {
    ctx.value = await WecomApi.context({ ...query.value, mock: '1' });
    if (!ctx.value.case) msg.value = ctx.value.error || '未解析到案件';
    else msg.value = '';
  } catch (e) { toast(e.message); }
}
async function submit() {
  if (!ctx.value?.case) return;
  if (!follow.value.next_follow_at) { toast('下次跟进时间必填'); return; }
  try {
    const iso = new Date(follow.value.next_follow_at).toISOString();
    await WecomApi.followUp({
      case_id: ctx.value.case.id,
      body: follow.value.body,
      next_follow_at: iso,
      result: follow.value.result,
      tags: follow.value.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    toast('企微侧栏跟进已写入');
    msg.value = '已保存';
  } catch (e) { toast(e.message); }
}
onMounted(() => loadStatus().catch(() => {}));
</script>
