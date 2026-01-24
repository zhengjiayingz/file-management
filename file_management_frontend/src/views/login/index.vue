<template>
  <div class="login-container">
    <div class="login-form">
      <h1>{{ isRegister ? '注册账号' : '文件管理系统' }}</h1>
      <el-form @submit.prevent="handleAuth">
        <el-form-item>
          <el-input v-model="loginForm.username" placeholder="用户名" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="loginForm.password" type="password" placeholder="密码" size="large" :prefix-icon="Lock"
            @keyup.enter="handleAuth" />
        </el-form-item>

        <el-form-item v-if="isRegister">
          <el-input v-model="loginForm.email" placeholder="电子邮箱 (可选)" size="large" :prefix-icon="Message" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="handleAuth">
            {{ isRegister ? '立即注册' : '登录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <el-link type="primary" @click="toggleMode">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
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
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'

const router = useRouter()
const authStore = useAuthStore()

const isRegister = ref(false)
const loginForm = ref({
  username: '',
  password: '',
  email: ''
})

const loading = ref(false)

const handleAuth = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  if (isRegister.value && !loginForm.value.email) {
    // 虽然API可选，但作为注册入口建议提示
    // ElMessage.warning('请输入邮箱')
    // 暂不强制
  }

  try {
    loading.value = true

    let data;
    if (isRegister.value) {
      const res = await authApi.register({
        username: loginForm.value.username,
        password: loginForm.value.password,
        email: loginForm.value.email || undefined
      })
      data = res // authApi 已经解包了 .data
      ElMessage.success('注册成功，已自动登录')
    } else {
      const res = await authApi.login({
        username: loginForm.value.username,
        password: loginForm.value.password
      })
      data = res
      ElMessage.success('登录成功')
    }

    // 登录或注册成功后更新状态
    if (data.success && data.data) {
      authStore.login({
        user: data.data.user,
        token: data.data.accessToken,
        refreshToken: data.data.refreshToken
      })
      router.push('/')
    } else {
      // 兼容某些API返回格式差异，虽然 axios 拦截器通常处理了 error
      throw new Error(data.message || '操作失败')
    }

  } catch (error: any) {
    // axios 错误对象 message
    ElMessage.error((isRegister.value ? '注册' : '登录') + '失败: ' + (error.response?.data?.message || error.message || '未知错误'))
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