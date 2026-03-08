import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ensureDirectoryExists } from '../utils/file.utils.js';

/**
 * Office 文档预览服务
 * 使用 LibreOffice 将 Word/PPT 文档转换为 PDF，实现在线预览
 * Excel 文件由前端直接下载，不走预览流程
 */

// 支持预览的 Office 文件扩展名（仅 Word 和 PPT，Excel 由前端直接下载）
const SUPPORTED_EXTENSIONS = ['.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp'];

// LibreOffice 可能的安装路径列表（Windows）
const SOFFICE_PATHS = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice' // 如果已加入 PATH 环境变量
];

// 预览文件缓存目录
const PREVIEWS_DIR = path.join(process.cwd(), 'previews');

// 转换超时时间（毫秒）
const CONVERSION_TIMEOUT = 60000; // 60 秒

// 转换锁：同一时间只允许一个转换任务，避免 LibreOffice 并发冲突
let isConverting = false;
const conversionQueue: Array<{
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
    sourceFilePath: string;
    fileHash: string;
}> = [];

/**
 * 查找 LibreOffice 可执行文件路径
 * @returns LibreOffice 路径，如果未找到则返回 null
 */
const findSofficePath = (): string | null => {
    for (const p of SOFFICE_PATHS) {
        if (path.isAbsolute(p)) {
            if (fs.existsSync(p)) {
                return p;
            }
        } else {
            return p;
        }
    }
    return null;
};

/**
 * 检查文件是否为支持的 Office 文档类型
 * @param fileName 文件名
 * @returns 是否支持预览
 */
export const isOfficeFile = (fileName: string): boolean => {
    const ext = path.extname(fileName).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
};

/**
 * 获取预览文件（PDF）的缓存路径
 * @param fileHash 文件哈希值
 * @returns PDF 缓存文件路径
 */
const getPreviewCachePath = (fileHash: string): string => {
    return path.join(PREVIEWS_DIR, `${fileHash}-preview.pdf`);
};

/**
 * 检查是否已有预览缓存
 * @param fileHash 文件哈希值
 * @returns 缓存文件路径（如果存在），否则返回 null
 */
export const getPreviewCache = (fileHash: string): string | null => {
    const cachePath = getPreviewCachePath(fileHash);
    if (fs.existsSync(cachePath)) {
        return cachePath;
    }
    return null;
};

/**
 * 清理残留的 LibreOffice 僵尸进程
 * 当 LibreOffice 异常退出时，可能留下锁文件和僵尸进程，导致后续转换无法启动
 */
const cleanupStaleProcesses = (): Promise<void> => {
    return new Promise((resolve) => {
        exec('taskkill /F /IM soffice.bin /T 2>NUL', { windowsHide: true }, () => {
            // 忽略错误（可能没有进程需要杀）
            resolve();
        });
    });
};

/**
 * 实际执行转换的内部函数
 */
const doConvert = async (sourceFilePath: string, fileHash: string): Promise<string> => {
    const sofficePath = findSofficePath();
    if (!sofficePath) {
        throw new Error('LibreOffice 未安装或未找到。请安装 LibreOffice 并确保路径正确。');
    }

    // 转换前清理可能残留的僵尸进程
    await cleanupStaleProcesses();

    if (!fs.existsSync(sourceFilePath)) {
        throw new Error('源文件不存在');
    }

    // 检查缓存
    const cachedPath = getPreviewCache(fileHash);
    if (cachedPath) {
        console.log(`[Preview] 使用缓存的 PDF: ${cachedPath}`);
        return cachedPath;
    }

    // 确保目录存在
    ensureDirectoryExists(PREVIEWS_DIR);

    // 创建临时输出目录
    const tempDir = path.join(PREVIEWS_DIR, `temp-${fileHash}-${Date.now()}`);
    ensureDirectoryExists(tempDir);

    try {
        // 调用 LibreOffice 进行转换
        // 关键：使用 cmd /c 方式调用，因为 LibreOffice 在 Windows 上
        // 通过 Node.js execFile 直接调用会被进程信号干扰导致卡住
        await new Promise<void>((resolve, reject) => {
            // 构建命令字符串，路径用双引号包裹以处理空格和中文
            const cmd = `cmd /c ""${sofficePath}" --headless --norestore --nolockcheck --convert-to pdf --outdir "${tempDir}" "${sourceFilePath}""`;

            console.log(`[Preview] 开始转换: ${sourceFilePath}`);

            exec(cmd, {
                timeout: CONVERSION_TIMEOUT,
                windowsHide: true
            }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[Preview] LibreOffice 转换失败:`, error.message);
                    if (stderr) console.error(`[Preview] stderr:`, stderr);
                    reject(new Error(`文档转换失败: ${error.message}`));
                    return;
                }
                if (stdout) console.log(`[Preview] stdout:`, stdout.trim());
                resolve();
            });
        });

        // 查找生成的 PDF 文件
        const sourceBaseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
        const generatedPdfPath = path.join(tempDir, `${sourceBaseName}.pdf`);

        let pdfSourcePath = generatedPdfPath;

        if (!fs.existsSync(generatedPdfPath)) {
            // 尝试查找临时目录中的任何 PDF 文件
            const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.pdf'));
            if (files.length === 0) {
                throw new Error('LibreOffice 未生成 PDF 文件，可能是文件格式不受支持');
            }
            pdfSourcePath = path.join(tempDir, files[0]);
        }

        // 移动到缓存位置
        const finalPath = getPreviewCachePath(fileHash);
        fs.renameSync(pdfSourcePath, finalPath);

        // 清理临时目录
        fs.rmSync(tempDir, { recursive: true, force: true });

        console.log(`[Preview] 转换完成: ${finalPath}`);
        return finalPath;
    } catch (error) {
        // 清理临时目录
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        throw error;
    }
};

/**
 * 处理转换队列中的下一个任务
 */
const processQueue = async () => {
    if (isConverting || conversionQueue.length === 0) return;

    isConverting = true;
    const task = conversionQueue.shift()!;

    try {
        const result = await doConvert(task.sourceFilePath, task.fileHash);
        task.resolve(result);
    } catch (error: any) {
        task.reject(error);
    } finally {
        isConverting = false;
        // 继续处理队列中的下一个任务
        processQueue();
    }
};

/**
 * 将 Office 文档转换为 PDF（公开接口）
 * 使用队列机制确保同一时间只有一个 LibreOffice 转换任务在执行
 *
 * @param sourceFilePath 源文件的物理路径
 * @param fileHash 文件哈希值（用于缓存命名）
 * @returns 转换后的 PDF 文件路径
 * @throws 如果 LibreOffice 未安装或转换失败
 */
export const convertToPdf = async (sourceFilePath: string, fileHash: string): Promise<string> => {
    // 先检查缓存，有缓存直接返回，不需要排队
    const cachedPath = getPreviewCache(fileHash);
    if (cachedPath) {
        console.log(`[Preview] 使用缓存的 PDF: ${cachedPath}`);
        return cachedPath;
    }

    // 没有缓存，加入转换队列
    return new Promise<string>((resolve, reject) => {
        conversionQueue.push({ resolve, reject, sourceFilePath, fileHash });
        processQueue();
    });
};

/**
 * 检查 LibreOffice 是否已安装
 * @returns 安装状态信息
 */
export const checkLibreOfficeInstallation = (): { installed: boolean; path: string | null } => {
    const sofficePath = findSofficePath();
    return {
        installed: sofficePath !== null,
        path: sofficePath
    };
};
