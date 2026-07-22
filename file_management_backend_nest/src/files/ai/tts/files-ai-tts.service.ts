import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getTtsMaxChars,
  synthesizeSpeech,
  TTS_STYLE_PRESETS,
  TTS_VOICE_PRESETS,
} from '@/files/ai/tts/tts.provider';

/** POST /ai/tts/speech 的请求体形状（校验前） */
type SpeechBody = {
  text?: unknown;
  voiceId?: unknown;
  style?: unknown;
  speed?: unknown;
};

@Injectable()
export class FilesAiTtsService {
  /**
   * 返回预设音色、方言风格与字数上限（登录即可；划词权限不在此校验）。
   */
  listVoices() {
    return {
      success: true,
      data: {
        maxChars: getTtsMaxChars(),
        voices: TTS_VOICE_PRESETS.map((v) => ({
          id: v.id,
          label: v.label,
          gender: v.gender,
        })),
        styles: TTS_STYLE_PRESETS.map((s) => ({ id: s.id })),
      },
    };
  }

  /**
   * 校验入参并合成 mp3（登录即可；划词入口权限由前端 can_use_tts 控制）。
   * @param body 原始请求体
   * @returns mp3 Buffer
   */
  async synthesize(body: unknown): Promise<Buffer> {
    if (body == null || typeof body !== 'object') {
      throw new BadRequestException('text 必填');
    }
    const payload = body as SpeechBody;
    if (typeof payload.text !== 'string') {
      throw new BadRequestException('text 必填');
    }
    const text = payload.text.trim();
    if (!text) {
      throw new BadRequestException('text 不能为空');
    }

    const maxChars = getTtsMaxChars();
    if (text.length > maxChars) {
      throw new BadRequestException(`文本过长，最多 ${maxChars} 字`);
    }

    const voiceId =
      typeof payload.voiceId === 'string' ? payload.voiceId : undefined;
    const style =
      typeof payload.style === 'string' ? payload.style : undefined;
    const speed = typeof payload.speed === 'number' ? payload.speed : undefined;

    try {
      return await synthesizeSpeech({ text, voiceId, style, speed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '语音合成失败';
      throw new BadRequestException(msg);
    }
  }
}
