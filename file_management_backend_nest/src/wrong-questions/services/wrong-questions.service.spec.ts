import { normalizeTags, tagsFromJson, needsOcrQuestionText } from './wrong-questions.service';

describe('wrong-questions helpers', () => {
  it('normalizeTags trims, dedupes, caps length', () => {
    expect(normalizeTags([' 代数 ', '代数', '', '  '])).toEqual(['代数']);
    expect(normalizeTags(undefined)).toEqual([]);
  });

  it('tagsFromJson handles non-array', () => {
    expect(tagsFromJson(null)).toEqual([]);
    expect(tagsFromJson(['a', 1, 'b'])).toEqual(['a', 'b']);
  });

  it('needsOcrQuestionText detects placeholders and solve prompts', () => {
    expect(needsOcrQuestionText('')).toBe(true);
    expect(needsOcrQuestionText('见原题图片')).toBe(true);
    expect(
      needsOcrQuestionText('请根据题目图片分步解答，公式使用 LaTeX'),
    ).toBe(true);
    expect(needsOcrQuestionText('设 f(x) 是偶函数')).toBe(false);
  });
});
