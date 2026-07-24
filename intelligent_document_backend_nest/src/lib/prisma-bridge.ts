import type { PrismaService } from '../prisma/prisma.service';

let prismaInstance: PrismaService | null = null;

export function setPrismaBridge(prisma: PrismaService): void {
  prismaInstance = prisma;
}

export function getPrismaBridge(): PrismaService {
  if (!prismaInstance) {
    throw new Error('Prisma bridge not initialized');
  }
  return prismaInstance;
}

/** Express 遗留代码兼容：与 `import prisma from '../lib/prisma.js'` 等价 */
const prismaBridge = new Proxy({} as PrismaService, {
  get(_target, prop): unknown {
    const p = getPrismaBridge();
    const value: unknown = Reflect.get(
      p as unknown as Record<string | symbol, unknown>,
      prop,
    );
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(p)
      : value;
  },
});

export default prismaBridge;
