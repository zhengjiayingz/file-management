import { requireEnv } from '@/files/ai/utils/env.util';

/** 硅基 CosyVoice 系统预置音色列表（短 id，请求时再拼成 model:id） */
export const TTS_VOICE_PRESETS = [
  { id: 'alex', label: 'Alex', gender: 'male' as const },
  { id: 'anna', label: 'Anna', gender: 'female' as const },
  { id: 'bella', label: 'Bella', gender: 'female' as const },
  { id: 'benjamin', label: 'Benjamin', gender: 'male' as const },
  { id: 'charles', label: 'Charles', gender: 'male' as const },
  { id: 'claire', label: 'Claire', gender: 'female' as const },
  { id: 'david', label: 'David', gender: 'male' as const },
  { id: 'diana', label: 'Diana', gender: 'female' as const },
] as const;

/** 自定义克隆音色在前端下拉中的短 id（对应 env AI_TTS_CUSTOM_VOICE_URI） */
export const TTS_CUSTOM_VOICE_ID = 'custom';

/** 预置音色短 id（如 alex / anna） */
export type TtsVoiceId = (typeof TTS_VOICE_PRESETS)[number]['id'];

/**
 * CosyVoice 方言/风格预设（通过 instruct + <|endofprompt|> 控制；default 不加油指令）。
 * 文档示例：用粤语说这句话<|endofprompt|>正文
 */
export const TTS_STYLE_PRESETS = [
  { id: 'default', instruct: '' },
  { id: 'english', instruct: '用英语说这句话' },
  { id: 'cantonese', instruct: '用粤语说这句话' },
  { id: 'sichuan', instruct: '用四川话说这句话' },
  { id: 'shanghai', instruct: '用上海话说这句话' },
  { id: 'tianjin', instruct: '用天津话说这句话' },
] as const;

/** 方言/风格短 id */
export type TtsStyleId = (typeof TTS_STYLE_PRESETS)[number]['id'];

/** 一次 TTS 合成请求的入参 */
export type SynthesizeSpeechInput = {
  /** 要朗读的文本（正文；方言指令由 style 自动拼接） */
  text: string;
  /** 预设音色短 id；非法或不传时由 resolveTtsVoice 回退 alex */
  voiceId?: string;
  /** 方言/风格；缺省或 default 为普通话直读 */
  style?: string;
  /** 语速，缺省 1；实际请求时夹在 0.25～4 */
  speed?: number;
};

/**
 * 把用户正文与方言指令拼成 CosyVoice input。
 * 若正文已含 `<|endofprompt|>`，视为用户自带指令，原样返回。
 * @param text 朗读正文
 * @param styleId 方言预设 id；非法则按 default
 * @returns 发给上游的 input 字符串
 */
export function buildTtsInput(text: string, styleId?: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.includes('<|endofprompt|>')) return trimmed;
  const style =
    TTS_STYLE_PRESETS.find((s) => s.id === styleId) ?? TTS_STYLE_PRESETS[0];
  if (!style.instruct) return trimmed;
  return `${style.instruct}<|endofprompt|>${trimmed}`;
}

/**
 * 读取 TTS 的 baseURL / apiKey / model（Key 回退链对齐 ASR）。
 * @returns apiKey、去尾斜杠的 baseURL、模型名
 */
export function getTtsConfig() {
  const baseURL = (
    process.env.AI_TTS_BASE_URL?.trim() ||
    process.env.AI_VISION_BASE_URL?.trim() ||
    'https://api.siliconflow.cn/v1'
  ).replace(/\/$/, '');
  const apiKey =
    process.env.AI_TTS_API_KEY?.trim() ||
    process.env.AI_VISION_API_KEY?.trim() ||
    process.env.AI_EMBEDDING_API_KEY?.trim() ||
    requireEnv('AI_API_KEY');
  const model =
    process.env.AI_TTS_MODEL?.trim() || 'FunAudioLLM/CosyVoice2-0.5B';
  return { apiKey, baseURL, model };
}

/**
 * 读取单次合成允许的最大字数。
 * @returns 正整数上限；未配置 AI_TTS_MAX_CHARS 时默认 2000
 */
export function getTtsMaxChars(): number {
  const n = Number(process.env.AI_TTS_MAX_CHARS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2000;
}

/**
 * 读取自定义克隆音色 uri（硅基 upload-voice 返回的 speech:…）。
 * 未配置或非法时返回 undefined，「自定义」选项不会出现在列表里。
 */
export function getCustomVoiceUri(): string | undefined {
  const uri = process.env.AI_TTS_CUSTOM_VOICE_URI?.trim();
  if (!uri || !uri.startsWith('speech:')) return undefined;
  return uri;
}

/**
 * 列表用：系统预置 +（若已配置 uri）自定义。
 */
export function listTtsVoiceOptions(): Array<{
  id: string;
  label: string;
  gender: 'male' | 'female';
}> {
  const presets = TTS_VOICE_PRESETS.map((v) => ({
    id: v.id,
    label: v.label,
    gender: v.gender,
  }));
  if (!getCustomVoiceUri()) return [...presets];
  return [
    { id: TTS_CUSTOM_VOICE_ID, label: '自定义', gender: 'male' },
    ...presets,
  ];
}

/**
 * 把短 id 拼成硅基 voice 字符串；非法 id 回退 alex。
 * `custom` 使用 AI_TTS_CUSTOM_VOICE_URI；也可直接传 speech: 完整 uri。
 * @param voiceId 预设 id / custom / speech:uri；可为空
 * @param model 当前 TTS 模型名
 * @returns 形如 `FunAudioLLM/CosyVoice2-0.5B:alex` 或 speech:… 的 voice
 */
export function resolveTtsVoice(
  voiceId: string | undefined,
  model: string,
): string {
  const raw = voiceId?.trim();
  if (raw?.startsWith('speech:')) {
    return raw;
  }
  if (raw === TTS_CUSTOM_VOICE_ID) {
    const uri = getCustomVoiceUri();
    if (!uri) {
      throw new Error('未配置自定义音色（AI_TTS_CUSTOM_VOICE_URI）');
    }
    return uri;
  }
  const id =
    TTS_VOICE_PRESETS.find((v) => v.id === raw)?.id ?? TTS_VOICE_PRESETS[0].id;
  return `${model}:${id}`;
}

/**
 * 调用硅基 /audio/speech，返回 mp3 二进制。
 * @param input 合成入参（text / voiceId / style / speed）；空 text 会抛错；超长校验可在 service 层做
 * @returns mp3 内容的 Buffer
 */
export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<Buffer> {
  const text = input.text?.trim() ?? '';
  if (!text) {
    throw new Error('text 不能为空');
  }

  const { apiKey, baseURL, model } = getTtsConfig();
  const voice = resolveTtsVoice(input.voiceId, model);
  const payloadInput = buildTtsInput(text, input.style);
  let speed = 1;
  if (typeof input.speed === 'number' && Number.isFinite(input.speed)) {
    speed = Math.min(4, Math.max(0.25, input.speed));
  }

  // 调用硅基 TTS：JSON 体含 model / input / voice / response_format / speed
  const res = await fetch(`${baseURL}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: payloadInput,
      voice,
      response_format: 'mp3', // 响应格式固定为 mp3
      speed,
    }),
  });
  // 失败分支
  if (!res.ok) {
    // 先把响应体当文本读完（失败时一般是 JSON 或纯文本，不是 mp3）
    const raw = await res.text();
    let message = `TTS API failed: ${res.status}`;
    try {
      const json = JSON.parse(raw) as {
        error?: { message?: string };
        message?: string;
      };
      message = json.error?.message || json.message || message;
    } catch {
      if (raw.trim()) message = raw.slice(0, 200);
    }
    throw new Error(message);
  }
  // 把响应体读成浏览器/Fetch 标准的「原始字节块」ArrayBuffer。
  // 成功时 body 是二进制音频，不能用 res.text() / res.json()。
  const ab = await res.arrayBuffer();
  // 转成 Node.js 的 Buffer。
  // 面 Nest 回传、写文件、单测里 Buffer.isBuffer 都认这个类型。
  const buf = Buffer.from(ab);
  if (buf.length === 0) {
    throw new Error('TTS 返回空音频');
  }
  return buf;
}
