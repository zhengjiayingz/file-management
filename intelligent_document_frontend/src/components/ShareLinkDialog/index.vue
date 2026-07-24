<template>
  <el-dialog
    :model-value="modelValue"
    width="720px"
    class="share-link-dialog"
    destroy-on-close
    :show-close="true"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="onClosed"
  >
    <template #header>
      <span class="share-dialog-title">{{ dialogTitle }}</span>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="链接分享" name="link">
        <el-row :gutter="20">
          <el-col :span="linkCreated ? 15 : 24">
            <div class="share-form">
              <div class="form-row">
                <label class="form-label">有效期</label>
                <el-radio-group v-model="validity" size="small" :disabled="linkCreated">
                  <el-radio-button label="1d">1天</el-radio-button>
                  <el-radio-button label="7d">7天</el-radio-button>
                  <el-radio-button label="30d">30天</el-radio-button>
                  <el-radio-button label="1y">1年</el-radio-button>
                  <el-radio-button label="forever">永久有效</el-radio-button>
                </el-radio-group>
              </div>

              <div class="form-row">
                <label class="form-label">提取码</label>
                <div class="form-field-col">
                  <el-radio-group v-model="extractMode" size="small" :disabled="linkCreated">
                    <el-radio-button label="random">随机生成</el-radio-button>
                    <el-radio-button label="custom">自定义</el-radio-button>
                  </el-radio-group>
                  <el-input
                    v-if="extractMode === 'custom'"
                    v-model="customExtract"
                    placeholder="4 位字母或数字"
                    maxlength="4"
                    show-word-limit
                    class="custom-extract-input"
                    :disabled="linkCreated"
                    @input="onCustomExtractInput"
                  />
                </div>
              </div>

              <div class="form-row">
                <label class="form-label">提取码自动填充</label>
                <div class="form-field-col">
                  <el-checkbox v-model="autoFillExtract" :disabled="linkCreated">
                    分享链接自动填充提取码
                  </el-checkbox>
                  <el-tooltip content="开启后，复制链接将包含提取码参数，便于访客直接打开。" placement="top">
                    <el-icon class="info-icon"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
              </div>

              <div class="form-row">
                <label class="form-label">访问人数限制</label>
                <div class="form-field-col limit-row">
                  <el-select
                    v-model="maxVisitorsModel"
                    placeholder="不限制"
                    clearable
                    style="width: 120px"
                    :disabled="linkCreated"
                  >
                    <el-option v-for="n in 10" :key="n" :label="String(n)" :value="n" />
                  </el-select>
                  <span class="hint-inline">可直接选择 1～10 人，或选择不限制</span>
                </div>
              </div>
            </div>
          </el-col>

          <el-col v-if="linkCreated && result" :span="9">
            <div class="share-result-card">
              <div class="result-title">通过网盘分享的文件：{{ resultSummaryText }}</div>
              <div class="result-url">{{ displayShareUrl }}</div>
              <div v-if="result.extractCode" class="result-code">提取码：{{ result.extractCode }}</div>
              <div class="result-footer muted">— 来自本系统的分享</div>
            </div>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane label="发给网盘好友" name="friends">
        <el-empty description="请通过右下角或通讯录向好友发送文件（会话内分享）" :image-size="80" />
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <div class="share-footer">
        <p class="compliance-text">
          请遵守法律法规，不得分享违法违规内容。违规可能导致分享失效或账号限制。
        </p>
        <div class="footer-actions">
          <el-button v-if="!linkCreated" type="primary" :loading="creating" @click="handleCreate">
            <el-icon class="btn-icon"><Link /></el-icon>
            创建链接
          </el-button>
          <el-button v-else type="primary" @click="handleCopy">
            <el-icon class="btn-icon"><Check /></el-icon>
            复制链接
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { Link, Check, QuestionFilled } from '@element-plus/icons-vue'
import type { FileItem } from '@typing/file'
import { createShareLink, type CreateShareResult } from '@api/share'

const props = defineProps<{
  modelValue: boolean
  files: FileItem[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const activeTab = ref('link')
const validity = ref<'1d' | '7d' | '30d' | '1y' | 'forever'>('30d')
const extractMode = ref<'random' | 'custom'>('random')
const customExtract = ref('')
const autoFillExtract = ref(true)
const maxVisitorsModel = ref<number | undefined>(undefined)

const linkCreated = ref(false)
const creating = ref(false)
const result = ref<CreateShareResult | null>(null)

const dialogTitle = computed(() => {
  const list = props.files
  if (!list.length) return '分享'
  const first = list[0]!.fileName
  const n = list.length
  if (n === 1) return `分享：${first}`
  return `分享：${first}等共${n}项`
})

const resultSummaryText = computed(() => {
  const list = props.files
  if (!list.length) return ''
  const first = list[0]!.fileName
  const n = list.length
  if (n === 1) return `${first}`
  return `${first}等${n}个文件`
})

const displayShareUrl = computed(() => {
  if (!result.value) return ''
  const origin = window.location.origin
  const path = `/share/${result.value.shareCode}`
  let url = `${origin}${path}`
  if (result.value.autoFillExtract && result.value.extractCode) {
    url += `?e=${encodeURIComponent(result.value.extractCode)}`
  }
  return url
})

const copyText = computed(() => {
  if (!result.value) return ''
  const url = displayShareUrl.value
  const code = result.value.extractCode
  if (!code) return url
  return `${url}\n提取码：${code}`
})

function onCustomExtractInput() {
  customExtract.value = customExtract.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

function resetForm() {
  activeTab.value = 'link'
  validity.value = '30d'
  extractMode.value = 'random'
  customExtract.value = ''
  autoFillExtract.value = true
  maxVisitorsModel.value = undefined
  linkCreated.value = false
  result.value = null
}

function onClosed() {
  resetForm()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm()
  }
)

async function handleCreate() {
  if (!props.files.length) {
    ElMessage.warning('请先选择要分享的文件或文件夹')
    return
  }
  if (extractMode.value === 'custom') {
    const raw = customExtract.value.trim()
    if (!/^[A-Z0-9]{4}$/.test(raw)) {
      ElMessage.warning('自定义提取码须为 4 位字母或数字')
      return
    }
  }

  creating.value = true
  try {
    const data = await createShareLink({
      userFileIds: props.files.map((f) => f.id),
      validity: validity.value,
      extractMode: extractMode.value,
      customExtract: extractMode.value === 'custom' ? customExtract.value.trim() : undefined,
      autoFillExtract: autoFillExtract.value,
      maxVisitors: maxVisitorsModel.value ?? null
    })
    result.value = data
    linkCreated.value = true
    ElMessage.success('链接已生成，可复制分享')
  } catch (e: unknown) {
    let msg = '创建失败'
    if (axios.isAxiosError(e)) {
      const data = e.response?.data as { message?: string; hint?: string } | undefined
      msg = data?.message || e.message || msg
      if (data?.hint) console.warn('[share]', data.hint)
    } else if (e instanceof Error) {
      msg = e.message
    }
    ElMessage.error(msg)
  } finally {
    creating.value = false
  }
}

async function handleCopy() {
  const text = copyText.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败，请手动选择链接复制')
  }
}
</script>

<style scoped>
.share-dialog-title {
  font-size: 16px;
  font-weight: 600;
}

.share-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.form-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.form-label {
  flex: 0 0 120px;
  text-align: right;
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 32px;
}

.form-field-col {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.custom-extract-input {
  width: 200px;
  margin-top: 4px;
}

.info-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
}

.limit-row {
  align-items: center;
}

.hint-inline {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.share-result-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 14px;
  background: var(--el-fill-color-blank);
  font-size: 13px;
}

.result-title {
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}

.result-url {
  word-break: break-all;
  color: var(--el-color-primary);
  margin-bottom: 8px;
}

.result-code {
  font-weight: 500;
  margin-bottom: 8px;
}

.result-footer.muted {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.share-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}

.compliance-text {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-icon {
  margin-right: 4px;
  vertical-align: middle;
}
</style>
