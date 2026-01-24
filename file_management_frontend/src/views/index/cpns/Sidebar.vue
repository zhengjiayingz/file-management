<template>
    <el-aside class="sidebar" width="200px">
        <div class="sidebar-header">
            <h2 class="logo">{{ t('login.title') }}</h2>
        </div>
        <el-menu default-active="1" class="sidebar-menu" background-color="#f8f9fa" text-color="#333"
            active-text-color="#409eff">
            <el-menu-item index="1" @click="router.push('/')">
                <el-icon>
                    <Folder />
                </el-icon>
                <span>{{ t('sidebar.home') }}</span>
            </el-menu-item>
            <el-menu-item index="2">
                <el-icon>
                    <Clock />
                </el-icon>
                <span>{{ t('sidebar.sync') }}</span>
            </el-menu-item>
            <el-menu-item index="3">
                <el-icon>
                    <Star />
                </el-icon>
                <span>{{ t('sidebar.favorites') }}</span>
            </el-menu-item>
            <el-menu-item index="4" @click="router.push('/recycle-bin')">
                <el-icon>
                    <Delete />
                </el-icon>
                <span>{{ t('sidebar.recycleBin') }}</span>
            </el-menu-item>
            <el-menu-item index="5" @click="router.push('/logs')">
                <el-icon>
                    <List />
                </el-icon>
                <span>{{ t('sidebar.logs') }}</span>
            </el-menu-item>
        </el-menu>
    </el-aside>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Folder, Clock, Star, Delete, List } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const { t } = useI18n()
</script>

<style lang="scss" scoped>
.sidebar {
    background-color: #f8f9fa;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e4e7ed;

    &-header {
        height: 60px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        border-bottom: 1px solid #e4e7ed;
        background: white;

        .logo {
            margin: 0;
            font-size: 18px;
            color: #303133;
            font-weight: 600;
        }
    }

    &-menu {
        border-right: none;
        flex: 1;

        :deep(.el-menu-item) {
            &.is-active {
                background-color: #e6f6ff;
                border-right: 3px solid #409eff;
            }
        }
    }
}
</style>
