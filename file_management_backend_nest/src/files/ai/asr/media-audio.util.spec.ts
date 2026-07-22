const saveMock = jest.fn();
const onMock = jest.fn();
const formatMock = jest.fn();
const audioFrequencyMock = jest.fn();
const audioChannelsMock = jest.fn();
const noVideoMock = jest.fn();

function chain() {
  return {
    noVideo: noVideoMock,
    audioChannels: audioChannelsMock,
    audioFrequency: audioFrequencyMock,
    format: formatMock,
    on: onMock,
    save: saveMock,
  };
}

jest.mock('fluent-ffmpeg', () => {
  const fn = jest.fn(() => chain());
  (fn as unknown as { setFfmpegPath: jest.Mock }).setFfmpegPath = jest.fn();
  return { __esModule: true, default: fn };
});

jest.mock('@ffmpeg-installer/ffmpeg', () => ({
  __esModule: true,
  default: { path: '/fake/ffmpeg' },
}));

import { cleanupPreparedAudio, prepareAudioForAsr } from './media-audio.util';

describe('media-audio.util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    noVideoMock.mockReturnValue(chain());
    audioChannelsMock.mockReturnValue(chain());
    audioFrequencyMock.mockReturnValue(chain());
    formatMock.mockReturnValue(chain());
    onMock.mockImplementation(function (
      this: unknown,
      event: string,
      cb: () => void,
    ) {
      if (event === 'end') {
        // 下一 tick 触发成功，模拟异步转码结束
        queueMicrotask(() => cb());
      }
      return chain();
    });
    saveMock.mockReturnValue(undefined);
  });

  it('prepareAudioForAsr 配置 16k mono wav 并返回路径', async () => {
    const prepared = await prepareAudioForAsr('C:\\in\\a.mp3');
    expect(prepared.wavPath).toContain('audio-16k-mono.wav');
    expect(prepared.tempDir).toBeTruthy();
    expect(audioChannelsMock).toHaveBeenCalledWith(1);
    expect(audioFrequencyMock).toHaveBeenCalledWith(16000);
    expect(formatMock).toHaveBeenCalledWith('wav');
    await cleanupPreparedAudio(prepared);
  });

  it('ffmpeg error 时抛错', async () => {
    onMock.mockImplementation(function (
      event: string,
      cb: (err?: Error) => void,
    ) {
      if (event === 'error') {
        queueMicrotask(() => cb(new Error('ffmpeg failed')));
      }
      return chain();
    });
    await expect(prepareAudioForAsr('C:\\in\\bad.mp3')).rejects.toThrow(
      /ffmpeg failed/,
    );
  });
});
