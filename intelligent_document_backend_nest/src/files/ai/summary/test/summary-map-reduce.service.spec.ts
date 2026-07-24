import { generateStructuredObject } from '@/files/ai/chat/utils/structured-object.util';
import { SummaryMapReduceService } from '@/files/ai/summary/service/summary-map-reduce.service';

jest.mock('@/files/ai/chat/utils/structured-object.util', () => ({
  generateStructuredObject: jest.fn(),
}));

const generateStructuredObjectMock =
  generateStructuredObject as jest.MockedFunction<
    typeof generateStructuredObject
  >;

describe('SummaryMapReduceService', () => {
  const upsert = jest.fn();
  const prisma = {
    documentSummary: { upsert },
  } as never;

  const service = new SummaryMapReduceService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    let call = 0;
    generateStructuredObjectMock.mockImplementation(() => {
      call += 1;
      // 前 3 次 chunk，第 4 次 book
      if (call <= 3) {
        return Promise.resolve({
          summary: `chunk-${call}`,
          keyPoints: [],
        });
      }
      return Promise.resolve({
        oneLiner: '全书一句话',
        overview: '全书概览',
        plotPoints: ['A', 'B'],
        characters: [{ name: '主角', role: '主人公' }],
      });
    });
  });

  it('3 个 chunk → 3 条 chunk + 1 条 book（跳过 chapter）', async () => {
    const chunks = [
      { chunkIndex: 0, chapterNo: null, content: '第一段' },
      { chunkIndex: 1, chapterNo: null, content: '第二段' },
      { chunkIndex: 2, chapterNo: null, content: '第三段' },
    ];

    await service.runMapReduce(1, 'novel', chunks);

    expect(generateStructuredObjectMock).toHaveBeenCalledTimes(4); // 3 map + 1 book
    expect(upsert).toHaveBeenCalledTimes(4);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userFileId_type_refKey: {
            userFileId: 1,
            type: 'chunk',
            refKey: 'chunk:0',
          },
        },
      }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userFileId_type_refKey: {
            userFileId: 1,
            type: 'book',
            refKey: 'book',
          },
        },
      }),
    );
  });
});
