<template>
  <div class="landing">
    <div class="landing-inner">
      <header class="landing-hero">
        <p class="muted" style="margin:0;letter-spacing:.04em;font-size:12px">自愿留资 · 明确同意</p>
        <h1 style="margin:6px 0 4px">{{ product?.name_zh || '加载中…' }}</h1>
        <p class="muted" style="margin:0">{{ product?.tagline }}</p>
        <p v-if="product?.name_en" class="muted" style="margin:4px 0 0;font-size:12px">{{ product.name_en }}</p>
      </header>

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
          <input class="input" v-model="form.invite_code" maxlength="32" />
        </label>

        <label class="consent row" style="align-items:flex-start">
          <input type="checkbox" v-model="form.consent_accepted" style="margin-top:4px" />
          <span class="muted" style="font-size:13px">
            {{ product?.consent_text }}
            <span style="display:block;margin-top:4px;font-size:11px">文本版本 {{ product?.consent_version }}</span>
          </span>
        </label>

        <p v-if="error" class="tag warn" style="margin:0">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="busy || !form.consent_accepted">
          {{ busy ? '提交中…' : '提交意向' }}
        </button>
        <p class="muted" style="margin:0;font-size:12px">我们不会出售您的信息。提交即记录同意证据（文本版本、时间、IP/UA）。</p>
      </form>

      <div v-else class="card stack">
        <strong>已收到，感谢</strong>
        <p class="muted" style="margin:0">专属顾问将在业务沟通范围内联系您。案件号 {{ caseId?.slice(0, 8) }}…</p>
        <p v-if="merged" class="tag">已与既有身份合并（同手机/邮箱不重复建档）</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
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
.landing-hero { margin-bottom: 18px; }
.consent { gap: 10px; }
</style>
