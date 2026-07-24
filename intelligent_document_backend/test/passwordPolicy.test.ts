import { describe, it, expect } from 'vitest';
import { validatePasswordStrengthWithPolicy, type PasswordPolicy, settingsRowToPolicy } from '../src/services/passwordPolicy.service.js';

const PASSWORD_POLICY: PasswordPolicy = {
    minLength: 8,
    requiredCategories: ['lower', 'upper', 'digit', 'special'],
    minCategoriesInPool: 3
}

describe('密码策略 validatePasswordStrengthWithPolicy', () => {
    it('合法密码返回 null', () => {
        expect(validatePasswordStrengthWithPolicy('12345678aB', PASSWORD_POLICY)).toBeNull()
    });

    it("太短", () => {
        const err = validatePasswordStrengthWithPolicy('123456', PASSWORD_POLICY);
        expect(err).toContain('密码长度至少8位')
    })

    it('长度够但字符类不足（只有数字）', () => {
        const err = validatePasswordStrengthWithPolicy('12345678', PASSWORD_POLICY);
        expect(err).toContain('至少须满足3类');
        expect(err).toContain('当前满足1类');
    });
    it('缺一类仍不够（数字+小写）', () => {
        const err = validatePasswordStrengthWithPolicy('12345678a', PASSWORD_POLICY);
        expect(err).toContain('当前满足2类');
    });

    it("settingsRowToPolicy：模拟管理员改库后的策略", () => {
        //mock 模拟 system_settings 表里 id=1 这一行被管理员改过了
        const rowAfterAdminChange = {
            id: 1,
            passwordMinLength: 10,
            passwordRequiredCategories: ['digit', 'lower', 'upper'],
            passwordMinCategoriesInPool: 2,
            storageQuotaUserBytes: BigInt(1073741824),
            storageQuotaVipBytes: BigInt(2147483648),
            storageQuotaAdminBytes: BigInt(107374182400),
            maxTagsUser: 2,
            maxTagsVip: 5,
            updatedAt: new Date(),
        };

        const policy = settingsRowToPolicy(rowAfterAdminChange);
        // 确认解析结果（和 设置的row 一致)
        expect(policy.minLength).toBe(10);
        expect(policy.requiredCategories).toEqual(['digit', 'lower', 'upper']);
        expect(policy.minCategoriesInPool).toBe(2);

        expect(validatePasswordStrengthWithPolicy('abcd123456', policy)).toBeNull();

        // 只有 9 位 → 长度不够
        expect(validatePasswordStrengthWithPolicy('abcd12345', policy)).toContain('密码长度至少10位');

        // 10 位但只有数字 → 只满足 1 类
        expect(validatePasswordStrengthWithPolicy('1234567890', policy)).toContain('至少须满足2类');
        expect(validatePasswordStrengthWithPolicy('1234567890', policy)).toContain('当前满足1类');
    })
});
