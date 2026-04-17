<template>
  <!-- 使用 iconfont Symbol 注入的彩色路径（与 TTF 单色字体不同） -->
  <svg
    class="file-type-colored-icon"
    :class="size === 'grid' ? 'file-type-colored-icon--grid' : 'file-type-colored-icon--list'"
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    aria-hidden="true"
    focusable="false"
  >
    <use :href="href" :xlink:href="href" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FileTypeSymbolId } from '@utils/fileTypeIcons'

const props = defineProps<{
  name: FileTypeSymbolId
  size: 'list' | 'grid'
}>()

const href = computed(() => `#icon-${props.name}`)
</script>

<style scoped lang="scss">
.file-type-colored-icon {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}

.file-type-colored-icon--list {
  width: 26px;
  height: 26px;
}

.file-type-colored-icon--grid {
  width: 64px;
  height: 64px;
}
</style>
