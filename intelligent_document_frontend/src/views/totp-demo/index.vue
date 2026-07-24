<template>
  <div class="totp-demo">
    <el-card class="card" shadow="hover">
      <template #header>
        <span>TOTP 二维码演示（本地联调 Microsoft Authenticator）</span>
      </template>

      <p class="hint">
        用手机扫描下方二维码，验证器会保存密钥并每 30 秒刷新 6 位数字。本页仅用于开发验证标准
        <code>otpauth://</code> 是否被正确识别，<strong>与正式登录无关</strong>，密钥仅存在于当前浏览器内存。
      </p>

      <div class="actions">
        <el-button type="primary" @click="regenerate">重新生成密钥与二维码</el-button>
      </div>

      <div v-if="secret" class="content">
        <div class="qr-wrap">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="TOTP QR" class="qr-img" />
        </div>

        <div class="meta">
          <div class="row">
            <span class="label">手动输入密钥（Base32）</span>
            <el-input :model-value="secret" readonly class="mono">
              <template #append>
                <el-button @click="copySecret">复制</el-button>
              </template>
            </el-input>
          </div>

          <div class="row">
            <span class="label">otpauth 链接（调试用）</span>
            <el-input :model-value="otpauthUrl" type="textarea" :rows="2" readonly class="mono small" />
          </div>

          <div class="row verify">
            <span class="label">输入验证器上的 6 位数字，点校验（与当前密钥比对）</span>
            <div class="verify-line">
              <el-input
                v-model="verifyInput"
                maxlength="6"
                placeholder="123456"
                class="mono code-input"
                @keyup.enter="verifyCode"
              />
              <el-button type="success" :disabled="verifyInput.length !== 6" @click="verifyCode">校验</el-button>
            </div>
            <p v-if="verifyMessage" :class="['verify-msg', verifyOk === true ? 'ok' : verifyOk === false ? 'bad' : '']">
              {{ verifyMessage }}
            </p>
          </div>
        </div>
      </div>
    </el-card>

    <p class="footer-link">
      <router-link to="/login">返回登录</router-link>
    </p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { generateSecret, generateURI, verifySync } from 'otplib'
import QRCode from 'qrcode'

const ISSUER = 'FileManagementDev'
const ACCOUNT = 'demo@local'

const secret = ref('')
const otpauthUrl = ref('')
const qrDataUrl = ref('')
const verifyInput = ref('')
const verifyMessage = ref('')
const verifyOk = ref<boolean | null>(null)

async function regenerate() {
  verifyInput.value = ''
  verifyMessage.value = ''
  verifyOk.value = null

  const s = generateSecret()
  secret.value = s
  const uri = generateURI({ issuer: ISSUER, label: ACCOUNT, secret: s })
  otpauthUrl.value = uri
  qrDataUrl.value = await QRCode.toDataURL(uri, { width: 240, margin: 2 })
}

function copySecret() {
  if (!secret.value) return
  void navigator.clipboard.writeText(secret.value).then(
    () => ElMessage.success('已复制密钥'),
    () => ElMessage.error('复制失败')
  )
}

function verifyCode() {
  if (!secret.value || verifyInput.value.length !== 6) return
  const ok = verifySync({ token: verifyInput.value, secret: secret.value }).valid
  verifyOk.value = ok
  verifyMessage.value = ok ? '校验通过：与当前页面生成的密钥一致。' : '校验失败：请确认未换过密钥、手机时间自动对时、且输入的是当前这一轮的 6 位数。'
}

onMounted(() => {
  void regenerate()
})
</script>

<style scoped lang="scss">
.totp-demo {
  min-height: 100vh;
  padding: 24px;
  box-sizing: border-box;
  background: linear-gradient(160deg, #f0f4f8 0%, #e8eef5 100%);
}

.card {
  max-width: 720px;
  margin: 0 auto;
}

.hint {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;

  code {
    background: #f4f4f5;
    padding: 0 6px;
    border-radius: 4px;
  }
}

.actions {
  margin-bottom: 20px;
}

.content {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.qr-wrap {
  flex-shrink: 0;
  padding: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}

.qr-img {
  display: block;
  width: 240px;
  height: 240px;
}

.meta {
  flex: 1;
  min-width: 260px;
}

.row {
  margin-bottom: 16px;
}

.label {
  display: block;
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.mono :deep(.el-input__inner),
.mono :deep(textarea) {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 13px;
}

.small :deep(textarea) {
  font-size: 12px;
}

.verify-line {
  display: flex;
  gap: 12px;
  align-items: center;
}

.code-input {
  max-width: 160px;
}

.verify-msg {
  margin: 8px 0 0;
  font-size: 13px;
  color: #606266;

  &.ok {
    color: #67c23a;
  }

  &.bad {
    color: #f56c6c;
  }
}

.footer-link {
  text-align: center;
  margin-top: 20px;

  a {
    color: var(--el-color-primary);
    text-decoration: none;
  }
}
</style>
