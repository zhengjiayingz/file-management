<template>
  <div
    class="document-preview-layout"
    :class="{
      'document-preview-layout--with-ai': showAiPanel,
      'document-preview-layout--fullscreen': fullscreen,
    }"
  >
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
    /** 全屏 Dialog：布局吃满视口可用高度 */
    fullscreen?: boolean
  }>(),
  { showAiPanel: true, fullscreen: false },
)
</script>

<style lang="scss" scoped>
/* 固定高度：AI 消息区才能 overflow 出滚动条，避免撑开整页 */
.document-preview-layout {
  display: flex;
  gap: 14px;
  width: 100%;
  height: min(78vh, 720px);
  max-height: min(78vh, 720px);
  min-height: 0;
  align-items: stretch;
  overflow: hidden;

  &--fullscreen {
    height: calc(100vh - 120px);
    max-height: calc(100vh - 120px);
  }
}

.document-preview-layout__preview {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.document-preview-layout--with-ai .document-preview-layout__preview {
  flex: 1 1 56%;
}

.document-preview-layout__ai {
  flex: 1 1 44%;
  min-width: 300px;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: contain;
}

@media (max-width: 900px) {
  .document-preview-layout {
    flex-direction: column;
    height: auto;
    max-height: none;
    min-height: min(78vh, 720px);
    overflow: visible;

    &--fullscreen {
      height: auto;
      max-height: none;
      min-height: calc(100vh - 120px);
    }
  }

  .document-preview-layout__ai {
    min-width: 0;
    min-height: 420px;
    height: min(52vh, 480px);
    max-height: min(52vh, 480px);
    overflow: hidden;
  }
}
</style>
