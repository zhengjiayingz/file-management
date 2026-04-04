<template>
  <div class="login-container">
    <div class="login-form">
      <h1>{{ isRegister ? t('login.register') : t('login.title') }}</h1>
      <el-form @submit.prevent="handleAuth">
        <el-form-item>
          <el-input v-model="loginForm.username" :placeholder="t('login.username')" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="loginForm.password" type="password" :placeholder="t('login.password')" size="large"
            :prefix-icon="Lock" @keyup.enter="handleAuth" />
        </el-form-item>

        <el-form-item v-if="isRegister">
          <el-input v-model="loginForm.email" placeholder="Email (Optional)" size="large" :prefix-icon="Message" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleAuth">
            {{ isRegister ? t('login.register') : t('login.login') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <el-link type="primary" @click="toggleMode">
          {{ isRegister ? t('login.hasAccount') : t('login.noAccount') }}
        </el-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, Message } from '@element-plus/icons-vue'
import { useAuthStore } from '@stores/auth'
import { authApi } from '@api/auth'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const isRegister = ref(false)
const loginForm = ref({
  username: '',
  password: '',
  email: ''
})

const loading = ref(false)

const handleAuth = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning(t('login.username') + ' / ' + t('login.password'))
    return
  }

  if (isRegister.value && !loginForm.value.email) {
    // Optional
  }

  try {
    loading.value = true

    if (isRegister.value) {
      // 注册流程
      await authApi.register({
        username: loginForm.value.username,
        password: loginForm.value.password,
        email: loginForm.value.email || undefined
      })

      ElMessage.success(t('login.register') + ' Success')

      // 注册成功后切换到登录模式
      toggleMode()
      // 保留用户名密码方便登录
      // loginForm.value.email = '' // 清理不需要的字段
    } else {
      // 登录流程
      console.log('🔵 [1] 开始登录,用户名:', loginForm.value.username)

      const res = await authApi.login({
        username: loginForm.value.username,
        password: loginForm.value.password
      })
      console.log('🔵 [2] API 返回数据:', res)
      console.log('🔵 [3] 检查 token:', res.token)
      console.log('🔵 [4] 检查 refreshToken:', res.refreshToken)
      console.log('🔵 [5] 检查 user:', res.user)

      ElMessage.success(t('login.login') + ' Success')

      // 登录成功
      console.log('🔵 [6] 准备保存到 store')
      await authStore.login({
        user: res.user,
        token: res.token,
        refreshToken: res.refreshToken
      })
      console.log('🔵 [7] Store 保存完成')
      console.log('🔵 [8] 检查 localStorage token:', localStorage.getItem('token'))
      console.log('🔵 [9] 检查 store.isLoggedIn:', authStore.isLoggedIn)

      console.log('🔵 [10] 准备跳转到首页')
      router.push('/')
    }

  } catch (error: any) {
    console.error('❌ [登录错误]', error)
    console.error('❌ [错误详情] response:', error.response)
    console.error('❌ [错误详情] message:', error.message)
    ElMessage.error((isRegister.value ? t('login.register') : t('login.login')) + ' Failed: ' + (error.response?.data?.message || error.message || 'Error'))
  } finally {
    loading.value = false
  }
}

const toggleMode = () => {
  isRegister.value = !isRegister.value
  loginForm.value = { username: '', password: '', email: '' }
}
</script>

<style lang="scss" scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-form {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: 400px;

  h1 {
    text-align: center;
    margin-bottom: 30px;
    color: #303133;
  }

  .form-footer {
    margin-top: 20px;
    text-align: center;
  }

  .test-accounts {
    margin-top: 20px;
    text-align: center;

    p {
      margin-bottom: 10px;
      color: #606266;
      font-size: 14px;
    }

    .el-button {
      margin: 0 5px;
    }
  }
}
</style>