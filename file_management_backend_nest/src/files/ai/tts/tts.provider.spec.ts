jest.mock('@/files/ai/utils/env.util', () => ({
  requireEnv: jest.fn((name: string) => {
    if (name === 'AI_API_KEY') return 'test-api-key';
    throw new Error(`Missing environment variable: ${name}`);
  }),
}));

import {
  buildTtsInput,
  getTtsMaxChars,
  listTtsVoiceOptions,
  resolveTtsVoice,
  synthesizeSpeech,
} from './tts.provider';

type FetchMock = jest.MockedFunction<typeof fetch>;

describe('tts.provider', () => {
  const originalFetch = global.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env.AI_TTS_BASE_URL = 'https://api.example.com/v1';
    process.env.AI_TTS_API_KEY = 'test-tts-key';
    process.env.AI_TTS_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
    delete process.env.AI_TTS_MAX_CHARS;
    delete process.env.AI_TTS_CUSTOM_VOICE_URI;
    fetchMock = jest.fn() as FetchMock;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('resolveTtsVoice 拼出 model:id，非法 id 回退 alex', () => {
    expect(resolveTtsVoice('bella', 'FunAudioLLM/CosyVoice2-0.5B')).toBe(
      'FunAudioLLM/CosyVoice2-0.5B:bella',
    );
    expect(resolveTtsVoice('nope', 'FunAudioLLM/CosyVoice2-0.5B')).toBe(
      'FunAudioLLM/CosyVoice2-0.5B:alex',
    );
  });

  it('resolveTtsVoice 支持 custom / speech: uri', () => {
    process.env.AI_TTS_CUSTOM_VOICE_URI =
      'speech:jianggu-ref:aaa:bbb';
    expect(resolveTtsVoice('custom', 'FunAudioLLM/CosyVoice2-0.5B')).toBe(
      'speech:jianggu-ref:aaa:bbb',
    );
    expect(
      resolveTtsVoice('speech:other:x:y', 'FunAudioLLM/CosyVoice2-0.5B'),
    ).toBe('speech:other:x:y');
    delete process.env.AI_TTS_CUSTOM_VOICE_URI;
    expect(() => resolveTtsVoice('custom', 'm')).toThrow(/未配置自定义音色/);
  });

  it('listTtsVoiceOptions 配置 uri 时首项为自定义', () => {
    expect(listTtsVoiceOptions()[0]?.id).toBe('alex');
    process.env.AI_TTS_CUSTOM_VOICE_URI = 'speech:jianggu-ref:aaa:bbb';
    const list = listTtsVoiceOptions();
    expect(list[0]).toEqual({
      id: 'custom',
      label: '自定义',
      gender: 'male',
    });
  });

  it('buildTtsInput 粤语/英语加 instruct；已有 endofprompt 不重复包', () => {
    expect(buildTtsInput('唔该晒', 'cantonese')).toBe(
      '用粤语说这句话<|endofprompt|>唔该晒',
    );
    expect(buildTtsInput('Hello world', 'english')).toBe(
      '用英语说这句话<|endofprompt|>Hello world',
    );
    expect(buildTtsInput('你好', 'default')).toBe('你好');
    expect(
      buildTtsInput('自定义指令<|endofprompt|>正文', 'cantonese'),
    ).toBe('自定义指令<|endofprompt|>正文');
  });

  it('getTtsMaxChars 默认 2000', () => {
    expect(getTtsMaxChars()).toBe(2000);
  });

  it('成功时返回 Buffer，并 POST /audio/speech', async () => {
    const bytes = Buffer.from([0xff, 0xfb, 0x90]);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () =>
        Promise.resolve(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        ),
    } as Response);

    const out = await synthesizeSpeech({
      text: '你好',
      voiceId: 'anna',
      style: 'cantonese',
    });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.equals(bytes)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/v1/audio/speech');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer test-tts-key');
    expect(typeof init?.body).toBe('string');
    const body = JSON.parse(init!.body as string) as {
      input: string;
      voice: string;
      response_format: string;
    };
    expect(body.input).toBe('用粤语说这句话<|endofprompt|>你好');
    expect(body.voice).toBe('FunAudioLLM/CosyVoice2-0.5B:anna');
    expect(body.response_format).toBe('mp3');
  });

  it('HTTP 失败时抛错', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(JSON.stringify({ error: { message: 'bad key' } })),
    } as Response);

    await expect(synthesizeSpeech({ text: 'hi' })).rejects.toThrow(/bad key/);
  });

  it('空 text 抛错', async () => {
    await expect(synthesizeSpeech({ text: '  ' })).rejects.toThrow(/不能为空/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
