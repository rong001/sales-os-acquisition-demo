<template>
  <div class="page">
    <div class="topbar">
      <div>
        <button class="btn" @click="$router.push('/')">← 作战台</button>
        <h2 style="margin:8px 0 0">获客配置</h2>
        <p class="muted" style="margin:0">渠道短链 / 邀请码 / 活动 / 审计（管理员可写；viewer 只读）</p>
      </div>
    </div>
    <p v-if="error" class="tag warn">{{ error }}</p>
    <div class="grid-3">
      <div class="card stack">
        <strong>渠道链接 <span class="tag">/r/:code</span></strong>
        <div v-for="l in links" :key="l.id" class="list-item" style="cursor:default">
          <div class="row"><span class="grow">{{ l.name }}</span><span class="tag">{{ l.code }}</span></div>
          <div class="muted" style="font-size:12px">命中 {{ l.hit_count }} · {{ l.utm_source }}/{{ l.utm_medium }} · invite {{ l.invite_code || '—' }}</div>
        </div>
      </div>
      <div class="card stack">
        <strong>邀请码</strong>
        <div v-for="i in invites" :key="i.id" class="list-item row" style="cursor:default">
          <span class="grow">{{ i.code }} · {{ i.label }}</span>
          <span class="tag">用 {{ i.use_count }}</span>
        </div>
      </div>
      <div class="card stack">
        <strong>活动</strong>
        <div v-for="c in campaigns" :key="c.id" class="list-item" style="cursor:default">
          <div>{{ c.name }} <span class="tag" :class="c.enabled ? 'ok' : ''">{{ c.enabled ? '启用' : '停用' }}</span></div>
          <div class="muted" style="font-size:12px">{{ c.landing_product }} · {{ c.utm_campaign }}</div>
        </div>
      </div>
    </div>
    <div class="card stack" style="margin-top:12px">
      <strong>审计（最近）</strong>
      <div v-for="a in audits" :key="a.id" class="list-item row" style="cursor:default">
        <span class="grow">{{ a.action }} · {{ a.resource_type }}</span>
        <span class="muted" style="font-size:12px">{{ formatTime(a.created_at) }}</span>
      </div>
      <div v-if="!audits.length" class="muted">暂无</div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { LeadApi } from '../api/client';
const links = ref([]); const invites = ref([]); const campaigns = ref([]); const audits = ref([]);
const error = ref('');
function formatTime(v) { try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); } }
onMounted(async () => {
  try {
    [links.value, invites.value, campaigns.value, audits.value] = await Promise.all([
      LeadApi.channelLinks(), LeadApi.inviteCodes(), LeadApi.campaigns(), LeadApi.audits(40),
    ]);
  } catch (e) { error.value = e.message; }
});
</script>
