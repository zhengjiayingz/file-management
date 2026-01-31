<template>
    <el-dialog v-model="visible" fullscreen append-to-body :show-close="false" class="image-viewer-dialog"
        @closed="handleClosed">
        <div class="viewer-container">
            <!-- 关闭按钮 -->
            <div class="close-btn" @click="close">
                <el-icon>
                    <Close />
                </el-icon>
            </div>

            <!-- 轮播图 -->
            <el-carousel ref="carouselRef" :initial-index="initialIndex" :autoplay="false" indicator-position="none"
                arrow="always" height="100vh" :loop="true" @change="handleChange">
                <el-carousel-item v-for="(url, index) in urlList" :key="index">
                    <div class="image-wrapper" @wheel="handleWheel" @mousedown.prevent="handleMouseDown"
                        @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseLeave">
                        <!-- 使用 el-image 保持加载状态和简单的 fit -->
                        <el-image :src="url" fit="contain" class="carousel-image" @load="handleImageLoad" />
                    </div>
                </el-carousel-item>
            </el-carousel>

            <!-- 底部页码 -->
            <div class="viewer-footer">
                {{ currentIndex + 1 }} / {{ urlList.length }}
            </div>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Close } from '@element-plus/icons-vue'

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    urlList: {
        type: Array as () => string[],
        default: () => []
    },
    initialIndex: {
        type: Number,
        default: 0
    }
})

const emit = defineEmits(['update:modelValue', 'change'])

const visible = ref(false)
const carouselRef = ref()
const currentIndex = ref(0)

watch(() => props.modelValue, (val) => {
    visible.value = val
    if (val) {
        currentIndex.value = props.initialIndex
        // 确保打开时跳转到指定索引
        nextTick(() => {
            if (carouselRef.value) {
                carouselRef.value.setActiveItem(props.initialIndex)
            }
        })
    }
})

watch(() => visible.value, (val) => {
    emit('update:modelValue', val)
})

const close = () => {
    visible.value = false
}

const handleClosed = () => {
    // Reset or cleanup
}

const handleChange = (index: number) => {
    currentIndex.value = index
    emit('change', index)
}

// 简单的滚轮缩放支持（可选，为了更好的全屏体验）
// 注意：el-carousel 内嵌缩放可能会导致拖拽冲突，这里暂不深度实现复杂缩放
const handleWheel = (e: WheelEvent) => {
    // 阻止默认滚动行为，避免页面滚动
    // e.preventDefault() 
}

const handleImageLoad = () => {
    // 图片加载完成
}

// 拖拽切换逻辑
const isDragging = ref(false)
const startX = ref(0)
const threshold = 50 // 拖拽阈值

const handleMouseDown = (e: MouseEvent) => {
    isDragging.value = true
    startX.value = e.clientX
}

const handleMouseMove = (e: MouseEvent) => {
    // 这里可以加一些实时跟随效果，暂时只做切换判定
    if (!isDragging.value) return
}

const handleMouseUp = (e: MouseEvent) => {
    if (!isDragging.value) return
    const diff = e.clientX - startX.value

    if (Math.abs(diff) > threshold) {
        if (diff > 0) {
            carouselRef.value.prev()
        } else {
            carouselRef.value.next()
        }
    }
    isDragging.value = false
}

const handleMouseLeave = () => {
    isDragging.value = false
}

</script>

<style lang="scss">
// 覆盖 Dialog 默认样式
.image-viewer-dialog {
    background: transparent !important;
    box-shadow: none !important;

    .el-dialog__header {
        display: none;
    }

    .el-dialog__body {
        padding: 0;
        margin: 0;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
    }
}
</style>

<style lang="scss" scoped>
.viewer-container {
    position: relative;
    width: 100%;
    height: 100%;

    .close-btn {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2000;
        color: white;
        font-size: 20px;
        transition: background 0.3s;

        &:hover {
            background: rgba(255, 255, 255, 0.4);
        }
    }

    .image-wrapper {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;

        &:active {
            cursor: grabbing;
        }
    }

    .carousel-image {
        width: 100%;
        height: 100%;
        // el-image 默认是 inline-block，改为 block 撑满
        display: block;
    }

    .viewer-footer {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        background: rgba(0, 0, 0, 0.5);
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 14px;
        z-index: 10;
    }
}
</style>
