import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'File Management System API',
      version: '1.0.0',
      description: '文件管理系统 RESTful API 文档',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: '开发环境服务器'
      },
      {
        url: 'https://api.example.com',
        description: '生产环境服务器'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '输入 JWT token（不需要 "Bearer" 前缀）'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: '错误信息'
            },
            error: {
              type: 'string',
              description: '错误详情'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '用户 ID'
            },
            username: {
              type: 'string',
              description: '用户名'
            },
            email: {
              type: 'string',
              format: 'email',
              description: '邮箱地址'
            },
            role: {
              type: 'string',
              enum: ['user', 'vip', 'admin'],
              description: '用户角色'
            },
            storageQuota: {
              type: 'integer',
              description: '存储配额（字节）'
            },
            storageUsed: {
              type: 'integer',
              description: '已使用存储（字节）'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: '创建时间'
            }
          }
        },
        UserPreference: {
          type: 'object',
          properties: {
            locale: {
              type: 'string',
              enum: ['auto', 'zh-CN', 'zh-TW', 'en-US'],
              description: '语言偏好'
            },
            theme: {
              type: 'string',
              enum: ['auto', 'light', 'dark'],
              description: '主题偏好'
            }
          }
        },
        File: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '文件 ID'
            },
            fileName: {
              type: 'string',
              description: '文件名'
            },
            fileType: {
              type: 'string',
              enum: ['file', 'folder'],
              description: '文件类型'
            },
            storage: {
              type: 'object',
              properties: {
                fileSize: {
                  type: 'integer',
                  description: '文件大小（字节）'
                },
                mimeType: {
                  type: 'string',
                  description: 'MIME 类型'
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: '创建时间'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: '更新时间'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: '未授权 - Token 无效或已过期',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                message: 'Unauthorized',
                error: 'Invalid or expired token'
              }
            }
          }
        },
        NotFoundError: {
          description: '资源未找到',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                message: 'Not Found',
                error: 'Resource not found'
              }
            }
          }
        },
        ValidationError: {
          description: '请求参数验证失败',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                message: 'Validation Error',
                error: 'Invalid request parameters'
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.ts', './src/routes/*.js'] // 扫描路由文件中的注释
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * 配置 Swagger 文档
 * @param app Express 应用实例
 */
export function setupSwagger(app: Application): void {
  // Swagger UI 配置
  const swaggerUiOptions = {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'File Management API Docs',
    swaggerOptions: {
      persistAuthorization: true, // 持久化认证信息
      displayRequestDuration: true, // 显示请求耗时
      filter: true, // 启用过滤器
      tryItOutEnabled: true // 默认启用 "Try it out"
    }
  };

  // 挂载 Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

  // 提供 JSON 格式的 API 文档
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 Swagger documentation available at /api-docs');
}

export default setupSwagger;
