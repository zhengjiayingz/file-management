<template>
    <div class="tts-page">
        <Sidebar />
        <el-container class="main-container">
            <GlobalHeader>
                <template #left>
                    <h3>{{ t('ttsPage.title') }}</h3>
                </template>
            </GlobalHeader>

            <el-main class="content-area">
                <p class="hint">{{ t('ttsPage.hint', { max: maxChars }) }}</p>

                <el-input v-model="text" type="textarea" :rows="10" :maxlength="maxChars" show-word-limit
                    :placeholder="t('ttsPage.placeholder')" :disabled="loading" />

                <div class="toolbar">
                    <el-select v-model="voiceId" class="voice-select" :disabled="loading"
                        :title="t('preview.aiTtsVoice')">
                        <el-option v-for="v in voices" :key="v.id" :label="v.label" :value="v.id" />
                    </el-select>
                    <el-select v-model="styleId" class="style-select" :disabled="loading"
                        :title="t('ttsPage.style')">
                        <el-option :label="t('ttsPage.styleDefault')" value="default" />
                        <el-option :label="t('ttsPage.styleEnglish')" value="english" />
                        <el-option :label="t('ttsPage.styleCantonese')" value="cantonese" />
                        <el-option :label="t('ttsPage.styleSichuan')" value="sichuan" />
                        <el-option :label="t('ttsPage.styleShanghai')" value="shanghai" />
                        <el-option :label="t('ttsPage.styleTianjin')" value="tianjin" />
                    </el-select>
                    <el-button type="primary" :loading="loading" :disabled="loading || !text.trim()"
                        @click="onSynthesize">
                        {{ t('ttsPage.generate') }}
                    </el-button>
                </div>

                <p v-if="error" class="err">{{ error }}</p>

                <div v-if="audioUrl" class="player">
                    <audio :src="audioUrl" controls />
                    <el-button link type="primary" @click="onDownload">
                        {{ t('preview.aiTtsDownload') }}
                    </el-button>
                </div>
            </el-main>
        </el-container>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Sidebar from '@views/index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import { getTtsVoices, synthesizeSpeech, type TtsStyleId, type TtsVoice } from '@api/ai'

const { t } = useI18n()

const text = ref('')
const voices = ref<TtsVoice[]>([])
const voiceId = ref('alex')
const styleId = ref<TtsStyleId>('default')
const maxChars = ref(2000)
const loading = ref(false)
const error = ref('')
const audioUrl = ref('')

function revokeUrl() {
    if (audioUrl.value) {
        URL.revokeObjectURL(audioUrl.value)
        audioUrl.value = ''
    }
}

async function loadVoices() {
    const data = await getTtsVoices()
    voices.value = data.voices
    maxChars.value = data.maxChars
    if (!data.voices.some((v) => v.id === voiceId.value) && data.voices[0]) {
        voiceId.value = data.voices[0].id
    }
}

async function onSynthesize() {
    error.value = ''
    const trimmed = text.value.trim()
    if (!trimmed) {
        error.value = t('ttsPage.empty')
        return
    }
    if (trimmed.length > maxChars.value) {
        error.value = t('ttsPage.tooLong', { max: maxChars.value })
        return
    }
    loading.value = true
    try {
        const blob = await synthesizeSpeech({
            text: trimmed,
            voiceId: voiceId.value,
            style: styleId.value,
        })
        revokeUrl()
        audioUrl.value = URL.createObjectURL(blob)
    } catch (e: unknown) {
        error.value = e instanceof Error ? e.message : t('preview.aiTtsError')
    } finally {
        loading.value = false
    }
}

function onDownload() {
    if (!audioUrl.value) return
    const a = document.createElement('a')
    a.href = audioUrl.value
    a.download = 'speech.mp3'
    a.click()
}

onMounted(() => {
    void loadVoices().catch((e: unknown) => {
        error.value = e instanceof Error ? e.message : t('preview.aiTtsError')
    })
})

onUnmounted(() => {
    revokeUrl()
})
</script>

<style scoped>
.tts-page {
    display: flex;
    height: 100vh;
    overflow: hidden;
}

.main-container {
    flex: 1;
    flex-direction: column;
    overflow: hidden;
}

.content-area {
    max-width: 720px;
    padding: 20px 24px;
}

.hint {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.toolbar {
    display: flex;
    gap: 12px;
    margin-top: 12px;
    align-items: center;
}

.voice-select {
    width: 140px;
}

.style-select {
    width: 120px;
}

.err {
    margin: 12px 0 0;
    color: var(--el-color-danger);
    font-size: 13px;
}

.player {
    margin-top: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.player audio {
    max-width: 100%;
}
</style>