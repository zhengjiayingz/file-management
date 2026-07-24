jest.mock('ai', () => ({
  streamText: jest.fn(),
}));
jest.mock('@/files/ai/chat/provider/chat-model.provider', () => ({
  getChatModel: jest.fn(),
}));

import {
  resolveTargetLang,
  validateTranslateInput,
} from '@/files/ai/translate/service/files-ai-translate.service';

describe('FilesAiTranslateService helpers', () => {
  it('default：中文为主 → en', () => {
    expect(resolveTargetLang('这是一段中文测试内容', 'default')).toBe('en');
  });

  it('default：英文为主 → zh', () => {
    expect(resolveTargetLang('This is mostly English text', 'default')).toBe(
      'zh',
    );
  });

  it('显式 ja / zh / en 不被 default 覆盖', () => {
    expect(resolveTargetLang('hello', 'ja')).toBe('ja');
    expect(resolveTargetLang('hello', 'zh')).toBe('zh');
    expect(resolveTargetLang('中文', 'en')).toBe('en');
  });

  it('校验拒绝空文本与非法语言', () => {
    expect(() => validateTranslateInput({})).toThrow(/选中/);
    expect(() =>
      validateTranslateInput({ text: 'hi', targetLang: 'fr' }),
    ).toThrow(/目标语言/);
  });

  it('校验接受合法 body', () => {
    const input = validateTranslateInput({
      text: '  hello world  ',
      targetLang: 'ja',
      fileName: 'a.pdf',
    });
    expect(input.text).toBe('hello world');
    expect(input.targetLang).toBe('ja');
    expect(input.fileName).toBe('a.pdf');
  });
});
