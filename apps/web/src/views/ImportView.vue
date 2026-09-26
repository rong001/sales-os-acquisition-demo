<template>
  <div class="page" data-testid="import-page">
    <div class="topbar">
      <div>
        <h2 style="margin:8px 0 0">导入中心</h2>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <AppNav />
        <a class="btn" :href="templateUrl" data-testid="csv-template-download">下载 CSV 模板</a>
      </div>
    </div>
    <div class="card stack">
      <p class="section-title">批量 CSV 导入</p>
      <p class="muted" style="margin:0;font-size:12px">来源（source）必填；坏行不影响好行；合并提示中文可读。</p>
      <textarea class="textarea" style="min-height:160px" v-model="csvText" data-testid="csv-textarea"
        placeholder="粘贴 CSV，或先下载模板填写后再粘贴"></textarea>
      <button class="btn btn-primary" :disabled="busy || !isAdmin" data-testid="csv-import-submit" @click="runImport">
        {{ busy ? '导入中…' : '开始导入' }}
      </button>
      <p v-if="!isAdmin" class="tag warn">仅经理/管理员可导入</p>
      <div v-if="report" data-testid="csv-import-report">
        <p>{{ report.summary_zh }}</p>
        <div v-for="i in report.items || []" :key="i.line" class="list-item static">
          行 {{ i.line }} · {{ i.merge_message_zh }} · case {{ (i.case_id || '').slice(0, 8) }}
        </div>
        <div v-if="report.failed_count" class="stack">
          <p class="tag warn">失败 {{ report.failed_count }} 行</p>
          <button class="btn" @click="downloadFailed">导出失败行</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import AppNav from '../components/AppNav.vue';
import { ref, computed, inject } from 'vue';
import { LeadApi } from '../api/client';
const toast = inject('toast', () => {});
const user = ref(null);
try { user.value = JSON.parse(localStorage.getItem('salesos_user') || 'null'); } catch {}
const isAdmin = computed(() => ['admin', 'supervisor'].includes(user.value?.role));
const csvText = ref('');
const busy = ref(false);
const report = ref(null);
const templateUrl = LeadApi.csvTemplateUrl();
async function runImport() {
  busy.value = true;
  try {
    report.value = await LeadApi.importCsv({ csv: csvText.value });
    toast(report.value.summary_zh);
  } catch (e) { toast(e.message); }
  finally { busy.value = false; }
}
function downloadFailed() {
  if (!report.value?.failed_csv) return;
  const blob = new Blob([report.value.failed_csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'import-failed-rows.csv';
  a.click();
}
</script>
