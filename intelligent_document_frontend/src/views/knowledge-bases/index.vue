<template>
    <div class="kb-page">
        <Sidebar />
        <el-container class="main-container">
            <GlobalHeader>
                <template #left>
                    <h3>{{ t('sidebar.knowledgeBases') }}</h3>
                </template>
                <template #right>
                    <el-button type="primary" @click="openCreate">新建知识库</el-button>
                </template>
            </GlobalHeader>

            <el-main v-loading="loading">
                <el-table :data="list" border stripe style="width: 100%">
                    <el-table-column prop="id" label="ID" width="80" align="center" />
                    <el-table-column prop="name" label="名称" min-width="160" />
                    <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
                    <el-table-column label="更新时间" width="180" align="center">
                        <template #default="{ row }">
                            {{ formatTime(row.updatedAt) }}
                        </template>
                    </el-table-column>
                    <el-table-column label="操作" width="200" align="center" fixed="right">
                        <template #default="{ row }">
                            <el-button link type="primary" @click="router.push(`/knowledge-bases/${row.id}`)">
                                进入
                            </el-button>
                            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
                        </template>
                    </el-table-column>
                </el-table>
            </el-main>
        </el-container>

        <el-dialog v-model="dialogVisible" :title="editingId == null ? '新建知识库' : '编辑知识库'" width="480px"
            @closed="resetForm">
            <el-form label-width="72px">
                <el-form-item label="名称" required>
                    <el-input v-model="form.name" maxlength="100" show-word-limit />
                </el-form-item>
                <el-form-item label="描述">
                    <el-input v-model="form.description" type="textarea" :rows="3" maxlength="500" show-word-limit />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="dialogVisible = false">取消</el-button>
                <el-button type="primary" :loading="saving" @click="onSubmit">
                    保存
                </el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import Sidebar from '../index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import {
    createKnowledgeBase,
    deleteKnowledgeBase,
    listKnowledgeBases,
    updateKnowledgeBase,
    type KnowledgeBase,
} from '@/api/knowledge-bases'

import { useRouter } from 'vue-router'
const router = useRouter()

const { t } = useI18n()

const loading = ref(false)
const saving = ref(false)
const list = ref<KnowledgeBase[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ name: '', description: '' })

function formatTime(v: string) {
    try {
        return new Date(v).toLocaleString()
    } catch {
        return v
    }
}

async function loadList() {
    loading.value = true
    try {
        list.value = await listKnowledgeBases()
    } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '加载失败')
    } finally {
        loading.value = false
    }
}

function openCreate() {
    editingId.value = null
    form.name = ''
    form.description = ''
    dialogVisible.value = true
}

function openEdit(row: KnowledgeBase) {
    editingId.value = row.id
    form.name = row.name
    form.description = row.description || ''
    dialogVisible.value = true
}

function resetForm() {
    editingId.value = null
    form.name = ''
    form.description = ''
}

async function onSubmit() {
    const name = form.name.trim()
    if (!name) {
        ElMessage.warning('名称不能为空')
        return
    }
    saving.value = true
    try {
        if (editingId.value == null) {
            await createKnowledgeBase({
                name,
                description: form.description.trim() || undefined,
            })
            ElMessage.success('已创建')
        } else {
            await updateKnowledgeBase(editingId.value, {
                name,
                description: form.description.trim(),
            })
            ElMessage.success('已更新')
        }
        dialogVisible.value = false
        await loadList()
    } catch (e: any) {
        ElMessage.error(e?.response?.data?.message || e?.message || '保存失败')
    } finally {
        saving.value = false
    }
}

async function onDelete(row: KnowledgeBase) {
    try {
        await ElMessageBox.confirm(`确定删除知识库「${row.name}」？`, '删除确认', {
            type: 'warning',
        })
        await deleteKnowledgeBase(row.id)
        ElMessage.success('已删除')
        await loadList()
    } catch (e: any) {
        if (e === 'cancel' || e === 'close') return
        ElMessage.error(e?.response?.data?.message || e?.message || '删除失败')
    }
}

onMounted(loadList)
</script>

<style scoped>
.kb-page {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

.main-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
</style>