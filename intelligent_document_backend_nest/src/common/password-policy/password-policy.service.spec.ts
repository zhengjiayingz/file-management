import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  const svc = new PasswordPolicyService(null as never);

  it('policyToPublicDTO 返回结构化策略', () => {
    const policy = {
      minLength: 8,
      requiredCategories: ['digit', 'lower'] as const,
      minCategoriesInPool: 2,
    };
    expect(svc.policyToPublicDTO(policy)).toEqual({
      minLength: 8,
      requiredCategories: ['digit', 'lower'],
      minCategoriesInPool: 2,
    });
  });

  it('describePasswordPolicy 生成中文提示', () => {
    const policy = {
      minLength: 8,
      requiredCategories: ['digit', 'lower', 'upper'] as const,
      minCategoriesInPool: 2,
    };
    expect(svc.describePasswordPolicy(policy)).toContain('至少8位');
  });

  it('validatePasswordStrengthWithPolicy 弱密码返回错误文案', () => {
    const policy = {
      minLength: 8,
      requiredCategories: ['digit', 'lower', 'upper'] as const,
      minCategoriesInPool: 2,
    };
    const err = svc.validatePasswordStrengthWithPolicy('abc', policy);
    expect(err).toContain('至少');
  });
});
