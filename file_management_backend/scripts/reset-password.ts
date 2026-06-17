import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

const hashPassword = (password: string): string => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

async function resetPassword(username: string, newPassword: string) {
    const hashedPassword = hashPassword(newPassword);

    await prisma.user.update({
        where: { username },
        data: { password: hashedPassword },
    });

    console.log(`\n\n✅ 密码已重置: ${username}\n`);
}

const username = process.argv[2] ?? process.env.RESET_USERNAME;
const newPassword = process.argv[3] ?? process.env.RESET_PASSWORD;

if (!username || !newPassword) {
    console.error('用法: tsx scripts/reset-password.ts <username> [password]');
    console.error('或在 .env 中设置 RESET_USERNAME、RESET_PASSWORD');
    process.exit(1);
}

resetPassword(username, newPassword)
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e);
        prisma.$disconnect();
        process.exit(1);
    });
