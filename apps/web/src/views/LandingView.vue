<template>
  <div class="landing">
    <div class="landing-inner">
      <header class="landing-hero">
        <p class="muted" style="margin:0;letter-spacing:.04em;font-size:12px">自愿留资 · 明确同意</p>
        <h1 style="margin:6px 0 4px">{{ product?.name_zh || '加载中…' }}</h1>
        <p class="muted" style="margin:0">{{ product?.tagline }}</p>
        <p v-if="product?.name_en" class="muted" style="margin:4px 0 0;font-size:12px">{{ product.name_en }}</p>
      </header>

      <aside v-if="product && (product.intake_url || product.repo_url)" class="guide-card card stack">
        <strong style="font-size:14px">现网演示与公开仓</strong>
        <div class="guide-links">
          <a
            v-if="product.intake_url"
            class="btn btn-primary guide-btn"
            :href="product.intake_url"
            target="_blank"
            rel="noopener"
          >打开现网{{ isTicket ? '抢票 intake' : '演示门户' }}</a>
          <a
            v-if="product.demo_live_url && product.demo_live_url !== product.intake_url"
            class="btn guide-btn"
            :href="product.demo_live_url"
            target="_blank"
            rel="noopener"
          >现网首页</a>
          <a
            v-if="product.repo_url"
            class="btn guide-btn"
            :href="product.repo_url"
            target="_blank"
            rel="noopener"
          >能力说明 / 公开仓</a>
        </div>
        <ul v-if="product.capabilities?.length" class="cap-list muted">
          <li v-for="(c, i) in product.capabilities" :key="i">{{ c }}</li>
        </ul>
        <p class="muted" style="margin:0;font-size:11px">
          外链为现网/开源制品；本页仅获客留资，不代替现网产品操作。
        </p>
      </aside>

      <form class="card stack" @submit.prevent="submit" v-if="!done">
        <label class="stack" style="gap:6px">
          <span>姓名</span>
          <input class="input" v-model="form.name" required maxlength="40" placeholder="怎么称呼您" />
        </label>
        <label class="stack" style="gap:6px">
          <span>手机号</span>
          <input class="input" v-model="form.phone" required pattern="1\d{10}" placeholder="11 位手机号" />
        </label>
        <label class="stack" style="gap:6px">
          <span>邮箱（可选）</span>
          <input class="input" type="email" v-model="form.email" placeholder="name@example.com" />
        </label>
        <label class="stack" style="gap:6px">
          <span>邀请码（可选）</span>
          <input class="input" v-model="form.invite_code" maxlength="32" data-testid="invite" />
        </label>
        <p v-if="utmPreview" class="utm-preview muted" data-testid="utm-preview">
          来源追踪：{{ utmPreview }}
        </p>

        <label class="consent row" style="align-items:flex-start" data-testid="consent-label">
          <input type="checkbox" v-model="form.consent_accepted" style="margin-top:4px" data-testid="consent" />
          <span class="muted" style="font-size:13px">
            {{ product?.consent_text }}
            <span style="display:block;margin-top:4px;font-size:11px">文本版本 {{ product?.consent_version }}</span>
          </span>
        </label>

        <p v-if="error" class="tag warn" style="margin:0">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="busy || !form.consent_accepted" data-testid="submit">
          {{ busy ? '提交中…' : '提交意向' }}
        </button>
        <p class="muted" style="margin:0;font-size:12px">我们不会出售您的信息。提交即记录同意证据（文本版本、时间、IP/UA）。</p>
      </form>

      <div v-else class="card stack" data-testid="done">
        <strong>已收到，感谢</strong>
        <p class="muted" style="margin:0">专属顾问将在业务沟通范围内联系您。案件号 {{ caseId?.slice(0, 8) }}…</p>
        <p v-if="merged" class="tag">已与既有身份合并（同手机/邮箱不重复建档）</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { PublicApi } from '../api/client';

const route = useRoute();
const product = ref(null);
const busy = ref(false);
const done = ref(false);
const error = ref('');
const caseId = ref('');
const merged = ref(false);

const form = reactive({
  name: '',
  phone: '',
  email: '',
  invite_code: '',
  consent_accepted: false,
});

const isTicket = computed(() => route.params.product === 'ticket-grab');

const utmPreview = computed(() => {
  const q = route.query;
  const parts = [
    q.utm_source && `source=${q.utm_source}`,
    q.utm_medium && `medium=${q.utm_medium}`,
    q.utm_campaign && `campaign=${q.utm_campaign}`,
    (q.invite || q.invite_code) && `invite=${q.invite || q.invite_code}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
});

function readUtm() {
  const q = route.query;
  return {
    utm_source: q.utm_source || q.source || '',
    utm_medium: q.utm_medium || q.medium || '',
    utm_campaign: q.utm_campaign || q.campaign || '',
    utm_content: q.utm_content || '',
    utm_term: q.utm_term || '',
    invite_code: q.invite || q.invite_code || form.invite_code || '',
  };
}

onMounted(async () => {
  const code = route.params.product;
  try {
    product.value = await PublicApi.product(code);
    const q = route.query;
    if (q.invite || q.invite_code) form.invite_code = String(q.invite || q.invite_code);
  } catch (e) {
    error.value = e.message || '产品不存在';
  }
});

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const utm = readUtm();
    const res = await PublicApi.intake({
      product_code: route.params.product,
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      invite_code: form.invite_code || utm.invite_code || undefined,
      consent_accepted: form.consent_accepted,
      consent_text: product.value?.consent_text,
      consent_version: product.value?.consent_version,
      consent_channels: ['call', 'sms'],
      source_type: 'landing_form',
      landing_url: window.location.href,
      form_id: `landing:${route.params.product}`,
      ...utm,
    });
    caseId.value = res.case?.id;
    merged.value = !!res.merged;
    done.value = true;
  } catch (e) {
    error.value = e.message || '提交失败';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.landing {
  min-height: 100vh;
  background: linear-gradient(180deg, #eef2f6 0%, var(--bg) 40%);
  padding: 32px 16px 48px;
}
.landing-inner { max-width: 480px; margin: 0 auto; }
.landing-hero { margin-bottom: 14px; }
.consent { gap: 10px; }
.guide-card {
  margin-bottom: 14px;
  border-color: #c5d4e8;
  background: linear-gradient(180deg, #f7fafc 0%, #fff 100%);
}
.guide-links { display: flex; flex-wrap: wrap; gap: 8px; }
.guide-btn { font-size: 13px; text-align: center; }
.cap-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
}
.cap-list li { margin: 2px 0; }
.utm-preview {
  margin: 0;
  font-size: 12px;
  padding: 6px 8px;
  background: var(--accent-soft);
  border-radius: 6px;
}
</style>
