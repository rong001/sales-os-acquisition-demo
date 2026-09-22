<template>
  <div v-if="open" class="modal-mask" @click.self="$emit('cancel')">
    <div class="modal stack">
      <h3 style="margin:0">确认预约</h3>
      <p class="muted" style="margin:0">请确认以下信息后再提交。确认后产生 P2 有效预约事件。</p>
      <dl class="kv">
        <dt>产品/项目</dt><dd>{{ appointment?.product_or_program || '—' }}</dd>
        <dt>时段</dt>
        <dd>
          {{ formatTime(appointment?.slot_start) }}
          ~
          {{ formatTime(appointment?.slot_end) }}
        </dd>
        <dt>地点/链接</dt><dd>{{ appointment?.location_or_link || '—' }}</dd>
        <dt>费用说明</dt><dd>{{ appointment?.amount_hint || '—' }}</dd>
        <dt>取消规则</dt><dd>{{ appointment?.cancel_policy || '—' }}</dd>
        <dt>承诺边界</dt><dd>{{ appointment?.commitment_boundary || '—' }}</dd>
      </dl>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" type="button" @click="$emit('cancel')">取消</button>
        <button class="btn btn-primary" type="button" :disabled="loading" @click="$emit('confirm')">
          {{ loading ? '提交中…' : '确认预约' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  open: Boolean,
  appointment: Object,
  loading: Boolean,
});
defineEmits(['confirm', 'cancel']);

function formatTime(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('zh-CN'); } catch { return String(v); }
}
</script>
