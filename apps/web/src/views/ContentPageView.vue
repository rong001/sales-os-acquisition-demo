<template>
  <div class="landing">
    <div class="landing-inner" style="max-width:640px">
      <p v-if="error" class="tag warn">{{ error }}</p>
      <article v-else-if="page" class="card stack">
        <p class="muted" style="margin:0;font-size:12px">公开内容 · /c/{{ page.slug }}</p>
        <h1 style="margin:0">{{ page.title }}</h1>
        <p v-if="page.description" class="muted" style="margin:0">{{ page.description }}</p>
        <div class="body" v-html="rendered"></div>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <router-link
            v-if="page.product_code"
            class="btn btn-primary"
            :to="`/p/${page.product_code}`"
          >去留资（演示）</router-link>
          <router-link class="btn" to="/">坐席登录</router-link>
        </div>
        <p class="muted" style="margin:0;font-size:11px">演示留资 ≠ 正式服务合同。更新于 {{ formatTime(page.updated_at) }}</p>
      </article>
      <p v-else class="muted">加载中…</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PublicApi } from '../api/client';

const route = useRoute();
const page = ref(null);
const error = ref('');

function simpleMd(src) {
  if (!src) return '';
  return src
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '<br/><br/>');
}

const rendered = computed(() => simpleMd(page.value?.body || ''));

function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}

async function load() {
  error.value = '';
  try {
    page.value = await PublicApi.page(route.params.slug);
    document.title = `${page.value.title} · 获客演示`;
    const desc = page.value.description || page.value.title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', desc);
  } catch (e) {
    error.value = e.message || '页面不存在';
  }
}

onMounted(load);
watch(() => route.params.slug, load);
</script>

<style scoped>
.landing { min-height: 100vh; background: linear-gradient(180deg, #eef2f6 0%, var(--bg) 40%); padding: 32px 16px 48px; }
.landing-inner { margin: 0 auto; }
.body { font-size: 14px; line-height: 1.6; }
.body :deep(h2) { font-size: 16px; margin: 12px 0 6px; }
.body :deep(li) { margin-left: 18px; }
.body :deep(blockquote) { margin: 8px 0; padding: 8px 12px; background: var(--accent-soft); border-radius: 6px; font-size: 13px; }
</style>
