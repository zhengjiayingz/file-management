<template>
    <el-dialog v-model="visible" :title="isCropped ? '确认裁剪结果' : '图片裁剪预览'" width="800px" :close-on-click-modal="false"
        destroy-on-close append-to-body>

        <!-- 裁剪编辑模式 -->
        <div v-if="!isCropped" class="cropper-container" v-loading="loading">
            <div class="cropper-area">
                <vue-cropper ref="cropperRef" :img="imgSrc" :output-size="option.size" :output-type="option.outputType"
                    :info="true" :full="option.full" :can-move="option.canMove" :can-move-box="option.canMoveBox"
                    :fixed-box="option.fixedBox" :original="option.original" :auto-crop="option.autoCrop"
                    :auto-crop-width="option.autoCropWidth" :auto-crop-height="option.autoCropHeight"
                    :center-box="option.centerBox" :high="option.high" @real-time="realTime" />
            </div>

            <div class="preview-area">
                <div class="preview-title">预览</div>
                <div class="preview-box">
                    <div :style="previewWrapperStyle">
                        <div :style="previewStyle">
                            <div :style="preview.div"> 
                                <img :src="preview.url" :style="preview.img">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="action-buttons">
                    <el-button-group>
                        <el-button type="primary" plain @click="rotateLeft">
                            <el-icon>
                                <RefreshLeft />
                            </el-icon> 向左旋转
                        </el-button>
                        <el-button type="primary" plain @click="rotateRight">
                            向右旋转 <el-icon>
                                <RefreshRight />
                            </el-icon>
                        </el-button>
                    </el-button-group>

                    <div class="reset-btn">
                        <el-button type="warning" @click="resetCropper">
                            <el-icon>
                                <Refresh />
                            </el-icon> 重置/撤销
                        </el-button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 裁剪结果确认模式 -->
        <div v-else class="cropped-result-container" v-loading="uploading">
            <div class="result-image-wrapper">
                <img :src="croppedImageUrl" alt="裁剪结果" />
            </div>
        </div>

        <template #footer>
            <span class="dialog-footer">
                <template v-if="!isCropped">
                    <el-button @click="handleCancel">取消</el-button>
                    <el-button type="primary" @click="handleConfirmCrop">
                        确认裁剪
                    </el-button>
                </template>
                <template v-else>
                    <el-button @click="handleUndoCrop">重新裁剪</el-button>
                    <el-button type="primary" @click="handleConfirmUpload" :loading="uploading">
                        确认上传
                    </el-button>
                </template>
            </span>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { VueCropper } from 'vue-cropper'
import { RefreshLeft, RefreshRight, Refresh } from '@element-plus/icons-vue'
import 'vue-cropper/dist/index.css'

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    imgFile: { // 传入的原始文件对象
        type: File,
        default: null
    }
})

const emit = defineEmits(['update:modelValue', 'upload'])

const visible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

const cropperRef = ref()
const imgSrc = ref('')
const loading = ref(false)
const uploading = ref(false)
const preview = ref<any>({})

// 配置项
const option = reactive({
    size: 1,
    full: false,
    outputType: 'png',
    canMove: true,
    fixedBox: false,
    original: false,
    canMoveBox: true,
    autoCrop: true,
    // 只有自动截图开启 宽度高度才生效
    autoCropWidth: 400,
    autoCropHeight: 300,
    centerBox: true,
    high: true
})

// 监听文件变化，加载图片
import { watch } from 'vue'
watch(() => props.imgFile, (file) => {
    if (file) {
        loading.value = true
        const reader = new FileReader()
        reader.onload = (e) => {
            imgSrc.value = e.target?.result as string
            loading.value = false
        }
        reader.readAsDataURL(file)
    }
}, { immediate: true })

const realTime = (data: any) => {
    preview.value = data
}

const previewWrapperStyle = computed(() => {
    if (!preview.value.w || !preview.value.h) return {}

    // 目标显示区域: 200x200
    const maxWidth = 200
    const maxHeight = 200

    const wScale = maxWidth / preview.value.w
    const hScale = maxHeight / preview.value.h

    // 取较小的比例
    let scale = Math.min(wScale, hScale)
    if (scale > 1) scale = 1

    return {
        width: (preview.value.w * scale) + 'px',
        height: (preview.value.h * scale) + 'px',
        overflow: 'hidden',
        position: 'relative' as const
    }
})

const previewStyle = computed(() => {
    if (!preview.value.w || !preview.value.h) return {}

    const maxWidth = 200
    const maxHeight = 200

    const wScale = maxWidth / preview.value.w
    const hScale = maxHeight / preview.value.h

    let scale = Math.min(wScale, hScale)
    if (scale > 1) scale = 1

    return {
        width: preview.value.w + 'px',
        height: preview.value.h + 'px',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        position: 'relative' as const
    }
})

const rotateLeft = () => {
    cropperRef.value.rotateLeft()
}

const rotateRight = () => {
    cropperRef.value.rotateRight()
}

const resetCropper = () => {
    cropperRef.value.refresh() // 重置裁剪框
    // 如果需要完全重置旋转等，可能需要重新reload图片或者手动设置 rotate 为 0
    // vue-cropper 的 refresh 主要是重置位置
}

const isCropped = ref(false)
const croppedImageUrl = ref('')
const croppedBlob = ref<Blob | null>(null)

const handleCancel = () => {
    visible.value = false
    handleUndoCrop() // 重置状态
}

const handleConfirmCrop = () => {
    loading.value = true
    // getCropBlob 是库提供的方法：根据当前裁剪框从原图里裁出一块，异步得到 Blob（一般是 PNG，与 option.outputType 等有关）
    cropperRef.value.getCropBlob((blob: Blob) => {
        // 若上一次裁剪已经生成过 blob URL，先 revokeObjectURL 释放内存，避免泄漏；本次确认会重新生成新 URL。
        if (croppedImageUrl.value) {
            URL.revokeObjectURL(croppedImageUrl.value)
        }
        // 把裁好的 Blob 存起来，后面 「确认上传」 会用它构造 
        croppedBlob.value = blob
        // 为这份 Blob 生成一个临时本地 URL（blob:http://...），给下面确认页的 <img :src="croppedImageUrl"> 用，让用户看到裁剪结果大图。
        croppedImageUrl.value = URL.createObjectURL(blob)
        // 切换到确认页
        isCropped.value = true
        // 关闭加载状态
        loading.value = false
    })
}

const handleUndoCrop = () => {
    isCropped.value = false
    croppedBlob.value = null
    // 不一定要销毁 URL，留着下次可能还要用？还是销毁好
    // 如果想要保留“上次结果”，可以不销毁。
    // 但按照需求，重新裁剪意味着废弃结果。
}

const handleConfirmUpload = () => {
    if (!croppedBlob.value) return

    uploading.value = true
    // 将 Blob 转为 File 对象
    const fileName = props.imgFile?.name || 'cropped-image.png'
    const file = new File([croppedBlob.value], fileName, { type: 'image/png' })

    // 触发上传事件
    emit('upload', file)

    uploading.value = false
    visible.value = false
}

// 监听弹窗关闭或文件变化，重置状态
watch(() => visible.value, (val) => {
    if (!val) {
        // 关闭时延迟重置，避免闪烁
        setTimeout(() => {
            isCropped.value = false
            croppedBlob.value = null
        }, 300)
    }
})
</script>

<style lang="scss" scoped>
.cropper-container {
    display: flex;
    height: 400px;
    gap: 20px;
}

.cropper-area {
    flex: 1;
    height: 100%;
}

.preview-area {
    width: 250px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    border-left: 1px solid #eee;
    padding-left: 20px;

    .preview-title {
        font-weight: bold;
        color: #333;
        margin-bottom: 10px;
    }

    .preview-box {
        border: 1px dashed #ccc;
        background: #f5f5f5;
        // 限制预览区域最大高度
        max-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .action-buttons {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;

        .el-button-group {
            display: flex;

            .el-button {
                flex: 1;
            }
        }

        .reset-btn {
            width: 100%;

            .el-button {
                width: 100%;
            }
        }
    }
}

.cropped-result-container {
    height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f5f5f5;
    border: 1px dashed #dcdfe6;
    border-radius: 4px;
    padding: 20px;

    .result-image-wrapper {
        max-width: 100%;
        max-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;

        img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    }
}
</style>
