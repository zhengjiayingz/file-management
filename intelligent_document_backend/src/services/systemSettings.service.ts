import prisma from '../lib/prisma.js';
import type { SystemSettings } from '@prisma/client';

export async function ensureSystemSettings(): Promise<SystemSettings> {
  const existing = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.systemSettings.create({ data: { id: 1 } });
}

export async function getSystemSettings(): Promise<SystemSettings> {
  return ensureSystemSettings();
}
