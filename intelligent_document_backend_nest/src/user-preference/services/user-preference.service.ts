import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateUserPreferenceDto } from '../dto/update-user-preference.dto';

const VALID_LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'auto'] as const;
const VALID_THEMES = ['light', 'dark', 'auto'] as const;

@Injectable()
export class UserPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreference(userId: number) {
    let preference = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    if (!preference) {
      preference = await this.prisma.userPreference.create({
        data: {
          userId,
          locale: 'auto',
          theme: 'auto',
        },
      });
    }

    return {
      success: true,
      data: {
        locale: preference.locale,
        theme: preference.theme,
      },
    };
  }

  async updatePreference(userId: number, dto: UpdateUserPreferenceDto) {
    const { locale, theme } = dto;

    if (
      locale &&
      !VALID_LOCALES.includes(locale as (typeof VALID_LOCALES)[number])
    ) {
      throw new BadRequestException('无效的语言设置');
    }
    if (
      theme &&
      !VALID_THEMES.includes(theme as (typeof VALID_THEMES)[number])
    ) {
      throw new BadRequestException('无效的主题设置');
    }

    const preference = await this.prisma.userPreference.upsert({
      where: { userId },
      update: {
        ...(locale ? { locale } : {}),
        ...(theme ? { theme } : {}),
      },
      create: {
        userId,
        locale: locale || 'auto',
        theme: theme || 'auto',
      },
    });

    return {
      success: true,
      data: {
        locale: preference.locale,
        theme: preference.theme,
      },
    };
  }
}
