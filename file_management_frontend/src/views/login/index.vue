<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h2>{{ isLogin ? '用户登录' : '用户注册' }}</h2>
        <p>{{ isLogin ? '欢迎使用文件管理系统' : '创建您的账户' }}</p>
      </div>
      
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        class="login-form"
        @submit.prevent="handleSubmit"
      >
        <el-form-item prop="username">
          <el-input
            v-model="formData.username"
            placeholder="请输入用户名"
            size="large"
            prefix-icon="User"
          />
        </el-form-item>

        <el-form-item v-if="!isLogin" prop="email">
          <el-input
            v-model="formData.email"
            placeholder="请输入邮箱（可选）"
            size="large"
            prefix-icon="Message"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="formData.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-form-item v-if="!isLogin" prop="confirmPassword">
          <el-input
            v-model="formData.confirmPassword"
            type="password"
            placeholder="请确认密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleSubmit"
            class="submit-button"
          >
            {{ loading ? (isLogin ? '登录中...' : '注册中...') : (isLogin ? '登录' : '注册') }}
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="form-footer">
        <div class="switch-mode">
          <span>{{ isLogin ? '还没有账户？' : '已有账户？' }}</span>
          <el-button type="text" @click="toggleMode">
            {{ isLogin ? '立即注册' : '立即登录' }}
          </el-button>
        </div>
        
        <div v-if="isLogin" class="demo-account">
          <p>演示账号：admin / Admin@123</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '../../stores/auth'
import { authApi } from '../../api/auth'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const isLogin = ref(true)

// 表单数据
const formData = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
})

// 验证确认密码
const validateConfirmPassword = (_rule: any, value: any, callback: any) => {
  if (value === '') {
    callback(new Error('请再次输入密码'))
  } else if (value !== formData.password) {
    callback(new Error('两次输入密码不一致'))
  } else {
    callback()
  }
}

// 验证密码强度
const validatePassword = (_rule: any, value: any, callback: any) => {
  if (!value) {
    callback(new Error('请输入密码'))
    return
  }
  
  if (value.length < 8) {
    callback(new Error('密码长度至少8位'))
    return
  }
  
  if (!isLogin.value) {
    // 注册时验证密码强度
    const hasNumber = /\d/.test(value)
    const hasLower = /[a-z]/.test(value)
    const hasUpper = /[A-Z]/.test(value)
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value)
    
    const strengthCount = [hasNumber, hasLower, hasUpper, hasSpecial].filter(Boolean).length
    
    if (strengthCount < 3) {
      callback(new Error('密码必须包含数字、字母、大小写、特殊字符中至少3种'))
      return
    }
  }
  
  callback()
}

// 表单验证规则
const formRules = computed((): FormRules => {
  const rules: FormRules = {
    username: [
      { required: true, message: '请输入用户名', trigger: 'blur' },
      { min: 3, max: 50, message: '用户名长度在 3 到 50 个字符', trigger: 'blur' }
    ],
    password: [
      { validator: validatePassword, trigger: 'blur' }
    ]
  }
  
  if (!isLogin.value) {
    rules.email = [
      { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
    ]
    rules.confirmPassword = [
      { validator: validateConfirmPassword, trigger: 'blur' }
    ]
  }
  
  return rules
})

// 切换登录/注册模式
const toggleMode = () => {
  isLogin.value = !isLogin.value
  // 清空表单
  formData.username = ''
  formData.email = ''
  formData.password = ''
  formData.confirmPassword = ''
  // 清除验证错误
  formRef.value?.clearValidate()
}

// 处理提交
const handleSubmit = async () => {
  if (!formRef.value) return
  
  try {
    const valid = await formRef.value.validate()
    if (!valid) return
    
    loading.value = true
    
    if (isLogin.value) {
      await handleLogin()
    } else {
      await handleRegister()
    }
  } catch (error) {
    console.error('Form validation failed:', error)
  } finally {
    loading.value = false
  }
}

// 处理登录
const handleLogin = async () => {
  try {
    const response = await authApi.login({
      username: formData.username,
      password: formData.password
    })
    
    console.log('Login response:', response) // 添加调试日志
    
    if (response.success) {
      // 保存登录状态
      authStore.login({
        username: response.data.user.username,
        token: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        user: response.data.user
      })
      
      ElMessage.success('登录成功！')
      
      // 跳转到首页
      router.push('/')
    } else {
      ElMessage.error(response.message || '登录失败')
    }
  } catch (error: any) {
    console.error('Login error:', error)
    ElMessage.error(error.response?.data?.message || '登录失败，请稍后重试')
  }
}

// 处理注册
const handleRegister = async () => {
  try {
    const response = await authApi.register({
      username: formData.username,
      email: formData.email || undefined,
      password: formData.password
    })
    
    console.log('Register response:', response) // 添加调试日志
    
    if (response.success) {
      // 保存登录状态
      authStore.login({
        username: response.data.user.username,
        token: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        user: response.data.user
      })
      
      ElMessage.success('注册成功！')
      
      // 跳转到首页
      router.push('/')
    } else {
      ElMessage.error(response.message || '注册失败')
    }
  } catch (error: any) {
    console.error('Register error:', error)
    ElMessage.error(error.response?.data?.message || '注册失败，请稍后重试')
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 30%, #90caf9 60%, #ffffff 100%);
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  padding: 40px;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h2 {
  color: #303133;
  margin: 0 0 10px 0;
  font-size: 28px;
  font-weight: 600;
}

.login-header p {
  color: #909399;
  margin: 0;
  font-size: 14px;
}

.login-form {
  margin-bottom: 20px;
}

.submit-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  font-weight: 500;
}

.form-footer {
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}

.switch-mode {
  margin-bottom: 15px;
}

.switch-mode span {
  color: #909399;
  font-size: 14px;
  margin-right: 8px;
}

.demo-account p {
  color: #909399;
  font-size: 12px;
  margin: 0;
}

:deep(.el-input__wrapper) {
  padding: 12px 15px;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-button--text) {
  color: #409eff;
  font-size: 14px;
  padding: 0;
}

:deep(.el-button--text:hover) {
  color: #66b1ff;
}
</style>