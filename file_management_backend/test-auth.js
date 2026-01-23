// 简单的认证测试
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

async function testAuth() {
  console.log('🔐 测试认证功能...\n');

  try {
    // 1. 测试登录
    console.log('1. 测试登录...');
    const loginResponse = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'testuser',
        password: 'Test123!@#'
      })
    });

    console.log('登录响应状态:', loginResponse.status);
    const loginData = await loginResponse.json();
    console.log('登录响应数据:', JSON.stringify(loginData, null, 2));

    if (loginResponse.ok && loginData.success) {
      console.log('✅ 登录成功');
      const token = loginData.data.accessToken;
      
      // 2. 测试获取用户信息
      console.log('\n2. 测试获取用户信息...');
      const userResponse = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('用户信息响应状态:', userResponse.status);
      const userData = await userResponse.json();
      console.log('用户信息:', JSON.stringify(userData, null, 2));

      // 3. 测试文件API
      console.log('\n3. 测试文件API...');
      const filesResponse = await fetch(`${API_BASE}/files`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('文件列表响应状态:', filesResponse.status);
      const filesData = await filesResponse.json();
      console.log('文件列表:', JSON.stringify(filesData, null, 2));

    } else {
      console.log('❌ 登录失败');
    }

  } catch (error) {
    console.error('💥 测试错误:', error.message);
  }
}

testAuth();