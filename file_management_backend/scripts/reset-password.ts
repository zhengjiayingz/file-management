import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const hashPassword = (password: string): string => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

async function resetPassword(username: string, newPassword: string) {
    const hashedPassword = hashPassword(newPassword);

    await prisma.user.update({
        where: { username },
        data: { password: hashedPassword }
    });

    console.log(`\n\n✅ 密码已重置: ${username} -> 新密码为 ${newPassword}\n`);
}

// 使用示例
resetPassword('admin', '123456')
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e);
        prisma.$disconnect();
    });
