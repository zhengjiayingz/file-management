import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

/**
 * 获取用户配置
 */
export const getUserPreference = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    let preference = await prisma.userPreference.findUnique({
      where: { userId: req.user.id }
    });

    // 如果用户没有配置，创建默认配置
    if (!preference) {
      preference = await prisma.userPreference.create({
        data: {
          userId: req.user.id,
          locale: 'auto',
          theme: 'auto'
        }
      });
    }

    res.json({
      success: true,
      data: {
        locale: preference.locale,
        theme: preference.theme
      }
    });
  } catch (error) {
    console.error('Get user preference error:', error);
    res.status(500).json({
      success: false,
      message: '获取用户配置失败'
    });
  }
};

/**
 * 更新用户配置
 */
export const updateUserPreference = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const { locale, theme } = req.body;

    // 验证参数
    const validLocales = ['zh-CN', 'zh-TW', 'en-US', 'auto'];
    const validThemes = ['light', 'dark', 'auto'];

    if (locale && !validLocales.includes(locale)) {
      res.status(400).json({
        success: false,
        message: '无效的语言设置'
      });
      return;
    }

    if (theme && !validThemes.includes(theme)) {
      res.status(400).json({
        success: false,
        message: '无效的主题设置'
      });
      return;
    }

    // 更新或创建配置
    const preference = await prisma.userPreference.upsert({
      where: { userId: req.user.id },
      update: {
        ...(locale && { locale }),
        ...(theme && { theme })
      },
      create: {
        userId: req.user.id,
        locale: locale || 'auto',
        theme: theme || 'auto'
      }
    });

    res.json({
      success: true,
      data: {
        locale: preference.locale,
        theme: preference.theme
      }
    });
  } catch (error) {
    console.error('Update user preference error:', error);
    res.status(500).json({
      success: false,
      message: '更新用户配置失败'
    });
  }
};
