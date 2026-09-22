<template>
  <div class="landing">
    <div class="landing-inner">
      <header class="landing-hero">
        <p class="muted" style="margin:0;letter-spacing:.04em;font-size:12px">自愿留资 · 明确同意 · 演示入口</p>
        <h1 style="margin:6px 0 4px">{{ product?.name_zh || '加载中…' }}</h1>
        <p class="muted" style="margin:0">{{ product?.tagline }}</p>
        <p v-if="product?.status_label" class="tag warn" style="margin-top:8px">{{ product.status_label }}</p>
      </header>

      <aside v-if="product?.service_disclaimer" class="guide-card card stack" data-testid="demo-vs-formal">
        <strong style="font-size:14px">演示留资 ≠ 正式服务合同</strong>
        <p class="muted" style="margin:0;font-size:13px">{{ product.service_disclaimer }}</p>
        <p class="muted" style="margin:0;font-size:12px">
          CTA：下方提交仅进入<strong>演示线索库</strong>，由坐席跟进咨询意向；
          <strong>不构成</strong>可售承诺、效果承诺或自动购票/真面板开通。
        </p>
      </aside>

      <aside v-if="product && (product.intake_url || product.repo_url)" class="guide-card card stack">
        <strong style="font-size:14px">现网演示与公开仓</strong>
        <div class="guide-links">
          <a
            v-if="product.intake_url"
            class="btn btn-primary guide-btn"
            :href="product.intake_url"
            target="_blank"
            rel="noopener"
          >打开现网{{ isTicket ? '抢票 intake' : 'MOCK 门户' }}</a>
          <a
            v-if="product.capabilities_url"
            class="btn guide-btn"
            :href="product.capabilities_url"
            target="_blank"
            rel="noopener"
          >capabilities</a>
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
          >公开仓{{ product.repo_tip ? ` @${product.repo_tip}` : '' }}</a>
          <a
            v-for="r in (product.secondary_repos || [])"
            :key="r.url"
            class="btn guide-btn"
            :href="r.url"
            target="_blank"
            rel="noopener"
          >{{ r.name }}{{ r.tip ? ` @${r.tip}` : '' }}</a>
          <router-link
            v-if="overviewSlug"
            class="btn guide-btn"
            :to="`/c/${overviewSlug}`"
          >能力说明页</router-link>
        </div>
        <ul v-if="product.capabilities?.length" class="cap-list muted">
          <li v-for="(c, i) in product.capabilities" :key="'c'+i">{{ c }}</li>
        </ul>
        <ul v-if="product.honesty?.length" class="cap-list honesty" data-testid="honesty">
          <li v-for="(c, i) in product.honesty" :key="'h'+i">{{ c }}</li>
        </ul>
        <p class="muted" style="margin:0;font-size:11px">
          外链为现网/开源制品；本页仅获客留资。触达默认 MOCK；邮件未配置时为未送达（非成功 MOCK）。
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

        <p v-if="error" class="tag warn" style="margin:0" data-testid="error">{{ error }}</p>
        <button class="btn btn-primary" type="submit" :disabled="busy || !form.consent_accepted" data-testid="submit">
          {{ busy ? '提交中…' : '提交演示意向' }}
        </button>
        <p class="muted" style="margin:0;font-size:12px">提交即记录同意证据（文本版本/哈希、时间、IP/UA、渠道与 UTM）。无同意拒收。</p>
      </form>

      <div v-else class="card stack" data-testid="done">
        <strong>已收到演示留资，感谢</strong>
        <p class="muted" style="margin:0">这不等于正式合同。顾问将在业务沟通范围内联系您。案件号 {{ caseId?.slice(0, 8) }}…</p>
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
const overviewSlug = computed(() =>
  route.params.product === 'ticket-grab' ? 'ticket-grab-overview'
    : route.params.product === 'usgate' ? 'usgate-overview' : null,
);

const utmPreview = computed(() => {
  const q = route.query;
  const parts = [
    q.utm_source && `source=${q.utm_source}`,
    q.utm_medium && `medium=${q.utm_medium}`,
    q.utm_campaign && `campaign=${q.utm_campaign}`,
    q.channel && `channel=${q.channel}`,
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
    source_channel: q.channel || q.utm_source || 'landing_form',
  };
}

onMounted(async () => {
  const code = route.params.product;
  try {
    product.value = await PublicApi.product(code);
    document.title = `${product.value.name_zh} · 演示留资`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', product.value.service_disclaimer || product.value.tagline || '');
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
      consent_channels: ['call', 'sms', 'email'],
      source_type: 'landing_form',
      source_channel: utm.source_channel,
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
.landing-inner { max-width: 520px; margin: 0 auto; }
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
.honesty { color: #8a5a00; }
.utm-preview {
  margin: 0;
  font-size: 12px;
  padding: 6px 8px;
  background: var(--accent-soft);
  border-radius: 6px;
}
</style>
