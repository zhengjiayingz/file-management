<template>
  <div class="login-container">
    <div class="login-form">
      <h1>文件管理系统</h1>
      <el-form @submit.prevent="handleLogin">
        <el-form-item>
          <el-input
            v-model="loginForm.username"
            placeholder="用户名"
            size="large"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="test-accounts">
        <p>测试功能：</p>
        <el-button size="small" @click="useTestAccount('admin')">管理员账号</el-button>
        <el-button size="small" @click="useTestAccount('user')">普通用户</el-button>
        <el-button size="small" type="success" @click="handleRegister">快速注册</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const loginForm = ref({
  username: '',
  password: ''
})

const loading = ref(false)

const handleLogin = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  try {
    loading.value = true
    
    // 调用真实的登录API
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: loginForm.value.username,
        password: loginForm.value.password
      })
    })

    const data = await response.json()

    if (response.ok && data.success) {
      authStore.login({
        user: data.data.user,
        token: data.data.accessToken,
        refreshToken: data.data.refreshToken
      })

      ElMessage.success('登录成功')
      router.push('/')
    } else {
      ElMessage.error('登录失败: ' + (data.message || '未知错误'))
    }
  } catch (error: any) {
    ElMessage.error('登录失败: ' + (error?.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

const useTestAccount = (type: 'admin' | 'user') => {
  if (type === 'admin') {
    loginForm.value.username = 'admin'
    loginForm.value.password = 'admin123'
  } else {
    loginForm.value.username = 'user'
    loginForm.value.password = 'user123'
  }
}

const handleRegister = async () => {
  if (!loginForm.value.username || !loginForm.value.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  try {
    loading.value = true
    
    // 调用注册API
    const response = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: loginForm.value.username,
        password: loginForm.value.password,
        email: loginForm.value.username + '@example.com'
      })
    })

    const data = await response.json()

    if (response.ok && data.success) {
      authStore.login({
        user: data.data.user,
        token: data.data.accessToken,
        refreshToken: data.data.refreshToken
      })

      ElMessage.success('注册并登录成功')
      router.push('/')
    } else {
      ElMessage.error('注册失败: ' + (data.message || '未知错误'))
    }
  } catch (error: any) {
    ElMessage.error('注册失败: ' + (error?.message || '网络错误'))
  } finally {
    loading.value = false
  }
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