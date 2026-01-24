<template>
  <el-config-provider :locale="elementPlusLocale">
    <div id="app">
      <router-view />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElConfigProvider } from 'element-plus'
import { elementPlusLocaleMap } from './locales'

const { locale } = useI18n()

// 根据当前语言动态获取 Element Plus 语言包
const elementPlusLocale = computed(() => {
  const localeKey = locale.value
  const elLocale = elementPlusLocaleMap[localeKey]
  return elLocale
})
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}

#app {
  height: 100%;
}

/* Element Plus 全局样式调整 */
.el-button {
  font-weight: 500;
}

.el-card {
  border-radius: 8px;
}

.el-input__wrapper {
  border-radius: 6px;
}
</style>
