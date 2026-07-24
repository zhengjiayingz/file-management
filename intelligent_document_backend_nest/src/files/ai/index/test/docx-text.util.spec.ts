import archiver from 'archiver';
import {
  extractTextFromDocumentXml,
  extractDocxText,
} from '@/files/ai/index/utils/docx-text.util';

function buildMinimalDocx(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver('zip');
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body>
</w:document>`;
    archive.append(xml, { name: 'word/document.xml' });
    void archive.finalize();
  });
}

describe('docx-text.util', () => {
  it('应从 document.xml 提取段落文本', () => {
    const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>第一段</w:t></w:r></w:p>
<w:p><w:r><w:t>第二</w:t></w:r><w:r><w:t>段</w:t></w:r></w:p>
</w:body>
</w:document>`;

    expect(extractTextFromDocumentXml(xml)).toBe('第一段\n第二段');
  });

  it('应从 docx 压缩包提取足够长的正文', async () => {
    const buf = await buildMinimalDocx(
      'Word document content for indexing pipeline validation.',
    );
    const text = await extractDocxText(buf);
    expect(text).toContain('Word document content');
  });

  it('正文过短应抛 EmptyDocxError', async () => {
    const buf = await buildMinimalDocx('short');
    await expect(extractDocxText(buf)).rejects.toThrow(
      'Word 文档未检测到可索引文字',
    );
  });
});
