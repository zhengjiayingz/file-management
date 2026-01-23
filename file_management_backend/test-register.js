// 注册新用户测试
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

async function testRegister() {
  console.log('📝 测试用户注册...\n');

  try {
    // 生成随机用户名
    const randomUser = 'user' + Date.now();
    
    console.log('注册用户:', randomUser);
    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: randomUser,
        password: 'Test123!@#',
        email: randomUser + '@example.com'
      })
    });

    console.log('注册响应状态:', registerResponse.status);
    const registerData = await registerResponse.json();
    console.log('注册响应数据:', JSON.stringify(registerData, null, 2));

    if (registerResponse.ok && registerData.success) {
      console.log('✅ 注册成功');
      const token = registerData.data.accessToken;
      
      // 测试文件API
      console.log('\n测试文件API...');
      const filesResponse = await fetch(`${API_BASE}/files`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('文件列表响应状态:', filesResponse.status);
      const filesData = await filesResponse.json();
      console.log('文件列表:', JSON.stringify(filesData, null, 2));

      // 测试文件存在检查
      console.log('\n测试文件存在检查...');
      const checkResponse = await fetch(`${API_BASE}/files/check-exists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileHash: 'test-hash-123' })
      });

      console.log('文件检查响应状态:', checkResponse.status);
      const checkData = await checkResponse.json();
      console.log('文件检查结果:', JSON.stringify(checkData, null, 2));

    } else {
      console.log('❌ 注册失败');
    }

  } catch (error) {
    console.error('💥 测试错误:', error.message);
  }
}

testRegister();