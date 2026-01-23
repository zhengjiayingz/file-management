// 完整的文件上传功能测试脚本
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';

// 创建测试文件
function createTestFile(filename, size = 1024) {
  const content = Buffer.alloc(size, 'A');
  fs.writeFileSync(filename, content);
  return filename;
}

// 计算文件MD5
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

// 测试函数
async function testCompleteFlow() {
  console.log('🚀 开始完整的文件上传功能测试...\n');

  let authToken = '';

  try {
    // 1. 注册用户
    console.log('1. 测试用户注册...');
    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'testuser',
        password: 'Test123!@#',
        email: 'test@example.com'
      })
    });

    if (registerResponse.ok) {
      const registerData = await registerResponse.json();
      console.log('✅ 用户注册成功');
      authToken = registerData.data.accessToken;
      console.log('📝 获得访问令牌:', authToken.substring(0, 20) + '...');
    } else {
      const errorData = await registerResponse.json();
      console.log('❌ 用户注册失败:', errorData.message);
      
      // 如果用户已存在，尝试登录
      if (errorData.message.includes('已存在')) {
        console.log('🔄 尝试登录现有用户...');
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

        if (loginResponse.ok) {
          const loginData = await loginResponse.json();
          console.log('✅ 用户登录成功');
          authToken = loginData.data.accessToken;
          console.log('📝 获得访问令牌:', authToken.substring(0, 20) + '...');
        } else {
          throw new Error('登录失败');
        }
      } else {
        throw new Error('注册失败: ' + errorData.message);
      }
    }

    // 2. 测试获取文件列表
    console.log('\n2. 测试获取文件列表...');
    const filesResponse = await fetch(`${API_BASE}/files`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (filesResponse.ok) {
      const filesData = await filesResponse.json();
      console.log('✅ 获取文件列表成功');
      console.log('📁 当前文件数量:', filesData.data.length);
    } else {
      console.log('❌ 获取文件列表失败');
    }

    // 3. 创建测试文件
    console.log('\n3. 创建测试文件...');
    const testFileName = 'test-file.txt';
    const testFilePath = createTestFile(testFileName, 2048); // 2KB文件
    const fileHash = calculateFileHash(testFilePath);
    console.log('✅ 测试文件创建成功');
    console.log('📄 文件名:', testFileName);
    console.log('🔍 文件哈希:', fileHash);

    // 4. 测试文件存在检查（秒传检测）
    console.log('\n4. 测试文件存在检查...');
    const checkResponse = await fetch(`${API_BASE}/files/check-exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ fileHash })
    });

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      console.log('✅ 文件存在检查成功');
      console.log('📋 文件是否存在:', checkData.data.exists);
      
      if (checkData.data.exists) {
        console.log('⚡ 可以进行秒传');
      } else {
        console.log('📤 需要上传文件');
      }
    } else {
      console.log('❌ 文件存在检查失败');
    }

    // 5. 测试传统文件上传
    console.log('\n5. 测试传统文件上传...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));

    const uploadResponse = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    if (uploadResponse.ok) {
      const uploadData = await uploadResponse.json();
      console.log('✅ 文件上传成功');
      console.log('📁 上传的文件ID:', uploadData.data.id);
      console.log('📄 文件名:', uploadData.data.fileName);
      console.log('📏 文件大小:', uploadData.data.fileSize, 'bytes');
    } else {
      const errorData = await uploadResponse.json();
      console.log('❌ 文件上传失败:', errorData.message);
    }

    // 6. 再次检查文件列表
    console.log('\n6. 再次检查文件列表...');
    const files2Response = await fetch(`${API_BASE}/files`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (files2Response.ok) {
      const files2Data = await files2Response.json();
      console.log('✅ 获取文件列表成功');
      console.log('📁 当前文件数量:', files2Data.data.length);
      
      if (files2Data.data.length > 0) {
        console.log('📋 文件列表:');
        files2Data.data.forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.fileName} (${file.fileSize} bytes)`);
        });
      }
    }

    // 7. 测试创建文件夹
    console.log('\n7. 测试创建文件夹...');
    const folderResponse = await fetch(`${API_BASE}/files/folder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: '测试文件夹-' + Date.now()
      })
    });

    if (folderResponse.ok) {
      const folderData = await folderResponse.json();
      console.log('✅ 文件夹创建成功');
      console.log('📁 文件夹ID:', folderData.data.id);
      console.log('📄 文件夹名:', folderData.data.fileName);
    } else {
      const errorData = await folderResponse.json();
      console.log('❌ 文件夹创建失败:', errorData.message);
    }

    // 清理测试文件
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log('\n🧹 测试文件已清理');
    }

    console.log('\n🎉 完整测试流程完成！');

  } catch (error) {
    console.error('\n💥 测试过程中发生错误:', error.message);
  }
}

// 运行测试
testCompleteFlow();