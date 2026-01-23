// 分片上传测试
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';
const CHUNK_SIZE = 1024; // 1KB分片用于测试

// 创建测试文件
function createTestFile(filename, size = 5120) { // 5KB文件
  const content = Buffer.alloc(size);
  // 填充一些内容使每个分片不同
  for (let i = 0; i < size; i++) {
    content[i] = i % 256;
  }
  fs.writeFileSync(filename, content);
  return filename;
}

// 计算文件MD5
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
}

// 计算分片MD5
function calculateChunkHash(chunk) {
  return crypto.createHash('md5').update(chunk).digest('hex');
}

// 创建文件分片
function createFileChunks(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const chunks = [];
  const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
    chunks.push(fileBuffer.slice(start, end));
  }

  return chunks;
}

async function testChunkedUpload() {
  console.log('🚀 开始分片上传测试...\n');

  let authToken = '';

  try {
    // 1. 注册/登录用户
    console.log('1. 注册新用户...');
    const randomUser = 'chunkuser' + Date.now();
    
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

    if (registerResponse.ok) {
      const registerData = await registerResponse.json();
      console.log('✅ 用户注册成功');
      authToken = registerData.data.accessToken;
    } else {
      throw new Error('注册失败');
    }

    // 2. 创建测试文件
    console.log('\n2. 创建测试文件...');
    const testFileName = 'chunk-test-file.bin';
    const testFilePath = createTestFile(testFileName, 5120); // 5KB文件
    const fileHash = calculateFileHash(testFilePath);
    const fileSize = fs.statSync(testFilePath).size;
    
    console.log('✅ 测试文件创建成功');
    console.log('📄 文件名:', testFileName);
    console.log('📏 文件大小:', fileSize, 'bytes');
    console.log('🔍 文件哈希:', fileHash);

    // 3. 检查文件是否存在
    console.log('\n3. 检查文件是否存在...');
    const checkResponse = await fetch(`${API_BASE}/files/check-exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ fileHash })
    });

    const checkData = await checkResponse.json();
    console.log('📋 文件存在检查结果:', checkData.data.exists);

    if (checkData.data.exists) {
      console.log('⚡ 可以秒传，跳过分片上传');
      return;
    }

    // 4. 创建分片
    console.log('\n4. 创建文件分片...');
    const chunks = createFileChunks(testFilePath);
    console.log('📦 分片数量:', chunks.length);
    console.log('📏 分片大小:', CHUNK_SIZE, 'bytes');

    // 5. 上传分片
    console.log('\n5. 开始上传分片...');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkHash = calculateChunkHash(chunk);
      
      console.log(`📤 上传分片 ${i + 1}/${chunks.length} (${chunk.length} bytes)`);

      const formData = new FormData();
      formData.append('fileHash', fileHash);
      formData.append('chunkIndex', i.toString());
      formData.append('chunkHash', chunkHash);
      formData.append('chunk', chunk, {
        filename: `chunk-${i}`,
        contentType: 'application/octet-stream'
      });

      const uploadResponse = await fetch(`${API_BASE}/files/upload-chunk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      });

      if (uploadResponse.ok) {
        console.log(`✅ 分片 ${i + 1} 上传成功`);
      } else {
        const errorData = await uploadResponse.json();
        console.log(`❌ 分片 ${i + 1} 上传失败:`, errorData.message);
        throw new Error(`分片上传失败: ${errorData.message}`);
      }
    }

    // 6. 检查已上传的分片
    console.log('\n6. 检查已上传的分片...');
    const chunksResponse = await fetch(`${API_BASE}/files/chunks/${fileHash}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (chunksResponse.ok) {
      const chunksData = await chunksResponse.json();
      console.log('📋 已上传分片:', chunksData.data);
      console.log('✅ 已上传分片数量:', chunksData.data.length);
    }

    // 7. 合并分片
    console.log('\n7. 合并分片...');
    const mergeResponse = await fetch(`${API_BASE}/files/merge-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        fileHash,
        fileName: testFileName,
        fileSize,
        mimeType: 'application/octet-stream',
        totalChunks: chunks.length
      })
    });

    if (mergeResponse.ok) {
      const mergeData = await mergeResponse.json();
      console.log('✅ 分片合并成功');
      console.log('📁 文件ID:', mergeData.data.id);
      console.log('📄 文件名:', mergeData.data.fileName);
      console.log('📏 文件大小:', mergeData.data.fileSize);
    } else {
      const errorData = await mergeResponse.json();
      console.log('❌ 分片合并失败:', errorData.message);
    }

    // 8. 验证文件列表
    console.log('\n8. 验证文件列表...');
    const filesResponse = await fetch(`${API_BASE}/files`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (filesResponse.ok) {
      const filesData = await filesResponse.json();
      console.log('📁 文件列表:');
      filesData.data.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.fileName} (${file.fileSize} bytes)`);
      });
    }

    // 清理测试文件
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log('\n🧹 测试文件已清理');
    }

    console.log('\n🎉 分片上传测试完成！');

  } catch (error) {
    console.error('\n💥 测试过程中发生错误:', error.message);
  }
}

// 运行测试
testChunkedUpload();