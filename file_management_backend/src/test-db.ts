/**
 * 数据库连接测试服务
 * 不依赖 Prisma，直接使用 mysql2
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 解析 DATABASE_URL
function parseDatabaseUrl(url: string) {
  // mysql://user:password@host:port/database
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  
  if (!match) {
    throw new Error('Invalid DATABASE_URL format');
  }

  return {
    host: match[3],
    port: parseInt(match[4]),
    user: match[1],
    password: match[2],
    database: match[5]
  };
}

export async function testDatabaseConnection() {
  let connection;
  
  try {
    const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL!);
    
    // 测试 1: 连接到 MySQL 服务器（不指定数据库）
    console.log('📡 测试 1: 连接到 MySQL 服务器...');
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password
    });
    console.log('✅ MySQL 服务器连接成功！');

    // 测试 2: 检查数据库是否存在
    console.log('🗄️  测试 2: 检查数据库是否存在...');
    const [databases] = await connection.query(
      'SHOW DATABASES LIKE ?',
      [dbConfig.database]
    );
    
    if ((databases as any[]).length === 0) {
      console.log(`⚠️  数据库 "${dbConfig.database}" 不存在，正在创建...`);
      await connection.query(
        `CREATE DATABASE ${dbConfig.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
      console.log(`✅ 数据库 "${dbConfig.database}" 创建成功！`);
    } else {
      console.log(`✅ 数据库 "${dbConfig.database}" 已存在`);
    }

    // 关闭连接
    await connection.end();

    // 测试 3: 连接到指定数据库
    console.log('🔌 测试 3: 连接到指定数据库...');
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });
    console.log('✅ 数据库连接成功！');

    // 测试 4: 执行查询
    console.log('📊 测试 4: 执行测试查询...');
    const [result] = await connection.query('SELECT 1 + 1 AS result');
    console.log('✅ 查询执行成功！', result);

    // 测试 5: 获取数据库信息
    console.log('ℹ️  测试 5: 获取数据库信息...');
    const [info] = await connection.query(
      'SELECT DATABASE() as db_name, VERSION() as version, USER() as user'
    );
    console.log('✅ 数据库信息:', info);

    // 测试 6: 检查表
    console.log('📋 测试 6: 检查数据表...');
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✅ 当前有 ${(tables as any[]).length} 个表:`, tables);

    return {
      success: true,
      message: '数据库连接测试成功！',
      info: {
        database: dbConfig.database,
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        tables: tables
      }
    };

  } catch (error: any) {
    console.error('❌ 数据库连接失败！');
    console.error('错误信息:', error.message);
    
    return {
      success: false,
      message: '数据库连接失败',
      error: error.message,
      code: error.code
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

export async function createTestTable() {
  let connection;
  
  try {
    const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL!);
    
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });

    console.log('📝 创建测试表...');
    
    // 删除已存在的测试表
    await connection.query('DROP TABLE IF EXISTS test_connection');
    
    // 创建测试表
    await connection.query(`
      CREATE TABLE test_connection (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    
    console.log('✅ 测试表创建成功！');

    // 插入测试数据
    await connection.query(
      'INSERT INTO test_connection (message) VALUES (?)',
      ['数据库连接测试成功！']
    );
    
    console.log('✅ 测试数据插入成功！');

    // 查询测试数据
    const [rows] = await connection.query('SELECT * FROM test_connection');
    console.log('✅ 查询测试数据:', rows);

    return {
      success: true,
      message: '测试表创建成功！',
      data: rows
    };

  } catch (error: any) {
    console.error('❌ 创建测试表失败！');
    console.error('错误信息:', error.message);
    
    return {
      success: false,
      message: '创建测试表失败',
      error: error.message
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
