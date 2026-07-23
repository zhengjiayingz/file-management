import { extractTextFromImage } from '@/files/ai/index/provider/vision.provider';

type FetchMock = jest.MockedFunction<typeof fetch>;

describe('extractTextFromImage', () => {
  const originalFetch = global.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    process.env.AI_VISION_BASE_URL = 'https://api.example.com/v1';
    process.env.AI_VISION_API_KEY = 'test-vision-key';
    process.env.AI_VISION_MODEL = 'deepseek-ai/DeepSeek-OCR';
    fetchMock = jest.fn() as FetchMock;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('成功时返回 OCR 文本', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [{ message: { content: '  Hello OCR  ' } }],
          }),
        ),
    } as Response);

    const text = await extractTextFromImage(
      Buffer.from('fake-png'),
      'image/png',
    );

    expect(text).toBe('Hello OCR');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer test-vision-key');
  });

  it('HTTP 失败时抛错', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: { message: 'invalid api key' } }),
        ),
    } as Response);

    await expect(
      extractTextFromImage(Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow(/invalid api key/);
  });

  it('空识别结果时抛错', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ choices: [{ message: { content: '   ' } }] }),
        ),
    } as Response);

    await expect(
      extractTextFromImage(Buffer.from('x'), 'image/png'),
    ).rejects.toThrow(/未识别到可用文字/);
  });
});
