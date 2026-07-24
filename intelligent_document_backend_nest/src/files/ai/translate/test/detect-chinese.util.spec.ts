import { isMostlyChinese } from '@/files/ai/translate/utils/detect-chinese.util';

describe('detect-chinese.util', () => {
  it('纯中文应判定为主要中文', () => {
    expect(isMostlyChinese('德思礼一家在女贞路几乎没变')).toBe(true);
  });

  it('纯英文应判定为非主要中文', () => {
    expect(
      isMostlyChinese(
        'Nearly ten years had passed since the Dursleys had woken up',
      ),
    ).toBe(false);
  });

  it('中英混排汉字占比高时应为主要中文', () => {
    expect(isMostlyChinese('这是一段中文 with few English')).toBe(true);
  });

  it('中英混排英文为主时应为非主要中文', () => {
    expect(isMostlyChinese('This is mostly English with 少量中文 words')).toBe(
      false,
    );
  });

  it('仅标点数字时返回 false', () => {
    expect(isMostlyChinese('123 ... !!!')).toBe(false);
  });
});
