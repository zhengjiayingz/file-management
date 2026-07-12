<template>
  <div class="document-preview-layout" :class="{ 'document-preview-layout--with-ai': showAiPanel }">
    <section class="document-preview-layout__preview">
      <slot name="preview" />
    </section>
    <section v-if="showAiPanel" class="document-preview-layout__ai">
      <slot name="ai" />
    </section>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    showAiPanel?: boolean
  }>(),
  { showAiPanel: true },
)
</script>

<style lang="scss" scoped>
.document-preview-layout {
  display: flex;
  gap: 14px;
  min-height: min(78vh, 720px);
  align-items: stretch;
  width: 100%;
}

.document-preview-layout__preview {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.document-preview-layout--with-ai .document-preview-layout__preview {
  flex: 1 1 56%;
}

.document-preview-layout__ai {
  flex: 1 1 44%;
  min-width: 300px;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .document-preview-layout {
    flex-direction: column;
    min-height: auto;
  }

  .document-preview-layout__ai {
    min-width: 0;
    min-height: 420px;
  }
}
</style>
