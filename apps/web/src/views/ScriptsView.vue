<template>
  <div class="page" data-testid="scripts-page">
    <div class="topbar">
      <div>
        <button class="btn btn-ghost" @click="$router.push('/')">← 工作台</button>
        <h2 style="margin:8px 0 0">话术库</h2>
      </div>
      <button class="btn btn-primary" @click="showForm = !showForm">新建话术</button>
    </div>
    <div v-if="showForm" class="card stack" style="margin-bottom:12px">
      <input class="input" v-model="form.scene" placeholder="场景（开场/异议/邀约…）" />
      <input class="input" v-model="form.title" placeholder="标题" />
      <textarea class="textarea" v-model="form.body" placeholder="正文"></textarea>
      <input class="input" v-model="form.tags" placeholder="标签，逗号分隔" />
      <button class="btn btn-primary" @click="create">保存</button>
    </div>
    <div class="card stack">
      <div v-for="s in list" :key="s.id" class="list-item static">
        <div><strong>{{ s.title }}</strong> <span class="tag">{{ s.scene }}</span>
          <span v-if="!s.enabled" class="tag warn">已停用</span>
        </div>
        <div class="muted" style="font-size:12px;white-space:pre-wrap">{{ s.body }}</div>
      </div>
      <div v-if="!list.length" class="empty">暂无话术</div>
    </div>
    <div class="card stack" style="margin-top:12px">
      <p class="section-title">优秀录音（标星）</p>
      <div v-for="c in starred" :key="c.id" class="list-item static">
        <div>★ {{ c.result }} · {{ c.duration_sec || 0 }}s <span class="tag mock">{{ c.mode }}</span></div>
        <div class="muted" style="font-size:12px">{{ c.recording_url }}</div>
      </div>
      <div v-if="!starred.length" class="empty">暂无标星录音</div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, inject } from 'vue';
import { ScriptsApi, DialApi } from '../api/client';
const toast = inject('toast', () => {});
const list = ref([]);
const starred = ref([]);
const showForm = ref(false);
const form = ref({ scene: '开场', title: '', body: '', tags: '' });
async function load() {
  list.value = await ScriptsApi.listAll();
  starred.value = await DialApi.starred().catch(() => []);
}
async function create() {
  try {
    await ScriptsApi.create({
      scene: form.value.scene,
      title: form.value.title,
      body: form.value.body,
      tags: form.value.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    toast('已保存');
    showForm.value = false;
    form.value = { scene: '开场', title: '', body: '', tags: '' };
    await load();
  } catch (e) { toast(e.message); }
}
onMounted(() => load().catch((e) => toast(e.message)));
</script>
