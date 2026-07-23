<template>
  <div class="assistant-page">
    <Sidebar />
    <el-container class="main-container">
      <GlobalHeader>
        <template #left>
          <h3>{{ t('assistantPage.title') }}</h3>
        </template>
      </GlobalHeader>

      <el-main class="content-area">
        <p class="hint">{{ t('assistantPage.hint') }}</p>

        <div ref="listEl" class="msg-list">
          <div
            v-for="(m, i) in messages"
            :key="i"
            class="msg"
            :class="m.role"
          >
            <div class="role">
              {{ m.role === 'user' ? t('assistantPage.you') : t('assistantPage.bot') }}
            </div>
            <div class="bubble">{{ m.content }}</div>
          </div>
          <div v-if="loading && !streamingText" class="msg assistant">
            <div class="role">{{ t('assistantPage.bot') }}</div>
            <div class="bubble muted">{{ t('assistantPage.thinking') }}</div>
          </div>
          <div v-if="streamingText" class="msg assistant">
            <div class="role">{{ t('assistantPage.bot') }}</div>
            <div class="bubble">{{ streamingText }}</div>
          </div>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <div class="composer">
          <el-input
            v-model="input"
            type="textarea"
            :rows="3"
            :placeholder="t('assistantPage.placeholder')"
            :disabled="loading"
            @keydown.enter.exact.prevent="onSend"
          />
          <div class="actions">
            <el-button :disabled="loading || messages.length === 0" @click="onClear">
              {{ t('assistantPage.clear') }}
            </el-button>
            <el-button
              type="primary"
              :loading="loading"
              :disabled="loading || !input.trim()"
              @click="onSend"
            >
              {{ t('assistantPage.send') }}
            </el-button>
          </div>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Sidebar from '@views/index/cpns/Sidebar.vue'
import GlobalHeader from '@components/GlobalHeader/index.vue'
import {
  streamAssistantChat,
} from '@api/assistantChat'
import type { AiChatMessage } from '@api/ai'

const { t } = useI18n()

const messages = ref<AiChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const error = ref('')
const streamingText = ref('')
const listEl = ref<HTMLElement | null>(null)
let abort: AbortController | null = null

async function scrollBottom() {
  await nextTick()
  const el = listEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function onClear() {
  if (loading.value) return
  messages.value = []
  streamingText.value = ''
  error.value = ''
}

async function onSend() {
  const text = input.value.trim()
  if (!text || loading.value) return

  error.value = ''
  const history = [...messages.value]
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  streamingText.value = ''
  abort?.abort()
  abort = new AbortController()
  await scrollBottom()

  try {
    let acc = ''
    await streamAssistantChat({
      message: text,
      messages: history,
      signal: abort.signal,
      onChunk: (chunk) => {
        acc += chunk
        streamingText.value = acc
        void scrollBottom()
      },
    })
    const finalText = acc.trim() || t('assistantPage.emptyReply')
    messages.value.push({ role: 'assistant', content: finalText })
    streamingText.value = ''
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') return
    error.value = e instanceof Error ? e.message : t('assistantPage.error')
    streamingText.value = ''
  } finally {
    loading.value = false
    await scrollBottom()
  }
}
</script>

<style scoped>
.assistant-page {
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
  display: flex;
  flex-direction: column;
  max-width: 800px;
  height: calc(100vh - 60px);
  padding: 16px 24px 24px;
  box-sizing: border-box;
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg .role {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.msg.user {
  align-self: flex-end;
  max-width: 85%;
}

.msg.assistant {
  align-self: flex-start;
  max-width: 90%;
}

.bubble {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
  font-size: 14px;
}

.msg.user .bubble {
  background: var(--el-color-primary-light-7);
}

.bubble.muted {
  color: var(--el-text-color-secondary);
}

.err {
  color: var(--el-color-danger);
  font-size: 13px;
  margin: 0 0 8px;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
