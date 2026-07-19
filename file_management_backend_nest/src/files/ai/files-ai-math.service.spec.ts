jest.mock('@/files/ai/vision/math-vision.provider', () => ({
  streamMathVisionChat: jest.fn(),
  getMathVisionConfig: jest.fn(),
}));

import {
  SOLVE_MATH_HISTORY_LIMIT,
  takeLastMessages,
  validateSolveMathInput,
  assertSolveMathImageFile,
} from './files-ai-math.service';
import type { ChatMessage } from '@/files/ai/utils/chat-message.util';

describe('FilesAiMathService helpers', () => {
  it('校验拒绝空 question', () => {
    expect(() => validateSolveMathInput({})).toThrow(/问题/);
    expect(() => validateSolveMathInput({ question: '   ' })).toThrow(/问题/);
  });

  it('校验接受合法 body 并 trim question', () => {
    const input = validateSolveMathInput({
      question: '  请分步解答本题  ',
      fileName: 'a.png',
      messages: [{ role: 'user', content: '上一问' }],
    });
    expect(input.question).toBe('请分步解答本题');
    expect(input.fileName).toBe('a.png');
    expect(input.messages).toHaveLength(1);
  });

  it('takeLastMessages：不超过 limit 原样返回', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
    ];
    expect(takeLastMessages(msgs)).toEqual(msgs);
  });

  it('takeLastMessages：超过 limit 只留末尾 N 条', () => {
    const msgs: ChatMessage[] = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: String(i),
    }));
    const out = takeLastMessages(msgs, SOLVE_MATH_HISTORY_LIMIT);
    expect(out).toHaveLength(6);
    expect(out[0]?.content).toBe('2');
    expect(out[5]?.content).toBe('7');
  });

  it('assertSolveMathImageFile 拒绝非图片', () => {
    expect(() => assertSolveMathImageFile('a.txt', 'text/plain')).toThrow(
      /仅支持/,
    );
  });
});
