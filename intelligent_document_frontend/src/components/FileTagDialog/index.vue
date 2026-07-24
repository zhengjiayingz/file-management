<template>
  <el-dialog
    v-model="visible"
    title="管理标签"
    width="520px"
    destroy-on-close
    @closed="onClosed"
  >
    <p v-if="files.length > 1" class="hint">
      将为已选的 {{ files.length }} 项设置相同标签（会覆盖每项原有标签）。
    </p>
    <p class="hint">选择或新建标签后，请点击「保存」才会写入数据库。</p>
    <el-form label-position="top">
      <el-form-item label="选择已有标签">
        <el-select
          v-model="selectedTagIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="可多选"
          style="width: 100%"
        >
          <el-option v-for="t in allTags" :key="t.id" :label="t.tagName" :value="t.id">
            <span class="opt-row">
              <span class="opt-swatch" :style="{ background: t.color || '#909399' }" />
              {{ t.tagName }}
            </span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="新建标签">
        <div class="new-row">
          <el-input
            v-model="newTagName"
            placeholder="标签名称"
            maxlength="50"
            show-word-limit
            class="name-inp"
          />
          <el-color-picker v-model="newTagColor" :show-alpha="false" />
          <el-input
            v-model="colorHexInput"
            placeholder="#409EFF"
            maxlength="7"
            class="hex-inp"
            @blur="applyHexInput"
            @keyup.enter="applyHexInput"
          />
        </div>
        <el-button type="primary" link :disabled="!newTagName.trim()" @click="createAndSelect">
          创建并选中
        </el-button>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="files.length === 0" @click="save">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import fileApiService from '@api/file'
import type { FileItem as FileInfo, FileTagItem } from '@typing/file'

const props = defineProps<{
  modelValue: boolean
  files: FileInfo[]
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  success: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const allTags = ref<FileTagItem[]>([])
const selectedTagIds = ref<number[]>([])
const newTagName = ref('')
const newTagColor = ref('#409EFF')
const colorHexInput = ref('#409EFF')
const saving = ref(false)

const HEX = /^#[0-9A-Fa-f]{6}$/

watch(newTagColor, (c) => {
  if (typeof c === 'string' && HEX.test(c)) {
    colorHexInput.value = c
  }
})

async function refreshTagList() {
  allTags.value = await fileApiService.listFileTags()
}

function applyHexInput() {
  const s = colorHexInput.value.trim()
  if (HEX.test(s)) {
    newTagColor.value = s
  } else if (s !== '') {
    ElMessage.warning('颜色须为 #RRGGBB，例如 #409EFF')
  }
}

async function createAndSelect() {
  const name = newTagName.value.trim()
  if (!name) return
  applyHexInput()
  const color = HEX.test(newTagColor.value) ? newTagColor.value : null
  try {
    const created = await fileApiService.createFileTag(name, color)
    newTagName.value = ''
    await refreshTagList()
    const cid = Number(created.id)
    const has = selectedTagIds.value.some((x) => Number(x) === cid)
    if (!has) {
      selectedTagIds.value = [...selectedTagIds.value, cid]
    }
    ElMessage.success('已创建标签')
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '创建失败'
    ElMessage.error(msg)
  }
}

async function save() {
  if (props.files.length === 0) return
  saving.value = true
  try {
    const ids = [
      ...new Set(
        selectedTagIds.value
          .map((x) => (typeof x === 'string' ? parseInt(x, 10) : Number(x)))
          .filter((n) => Number.isInteger(n) && n > 0)
      )
    ]
    await Promise.all(
      props.files.map((f) => {
        if (!Number.isInteger(f.id)) {
          throw new Error('无效的文件 id')
        }
        return fileApiService.setFileTags(f.id, ids)
      })
    )
    ElMessage.success('已保存标签')
    visible.value = false
    emit('success')
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '保存失败'
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

function onClosed() {
  newTagName.value = ''
  selectedTagIds.value = []
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    await refreshTagList()
    const first = props.files[0]
    if (props.files.length === 1 && first) {
      selectedTagIds.value = (first.tags || []).map((t) => Number(t.id))
    } else {
      selectedTagIds.value = []
    }
    newTagName.value = ''
    newTagColor.value = '#409EFF'
    colorHexInput.value = '#409EFF'
  }
)
</script>

<style scoped lang="scss">
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.opt-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}
.new-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  .name-inp {
    flex: 1 1 160px;
    min-width: 120px;
  }
  .hex-inp {
    width: 112px;
  }
}
</style>
