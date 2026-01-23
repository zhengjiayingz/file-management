// 简单的API测试脚本
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000/api';

// 测试函数
async function testAPI() {
  console.log('开始测试API...\n');

  // 测试1: 检查服务器是否运行
  try {
    console.log('1. 测试服务器连接...');
    const response = await fetch(`${API_BASE}/files/check-exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({ fileHash: 'test-hash' })
    });
    
    if (response.ok) {
      console.log('✅ 服务器连接正常');
    } else {
      console.log('❌ 服务器连接失败:', response.status);
    }
  } catch (error) {
    console.log('❌ 服务器连接错误:', error.message);
  }

  // 测试2: 测试文件存在检查API
  try {
    console.log('\n2. 测试文件存在检查API...');
    const response = await fetch(`${API_BASE}/files/check-exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileHash: 'non-existent-hash' })
    });
    
    const data = await response.json();
    console.log('响应:', data);
  } catch (error) {
    console.log('❌ API测试错误:', error.message);
  }

  console.log('\nAPI测试完成');
}

// 运行测试
testAPI();