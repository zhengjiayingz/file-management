export class SessionLimitError extends Error {
  constructor(
    public readonly uid: number,
    public readonly role: string,
  ) {
    super('SESSION_LIMIT');
    this.name = 'SessionLimitError';
  }
}

export class InvalidRevokeSessionError extends Error {
  constructor() {
    super('INVALID_REVOKE_SESSION');
    this.name = 'InvalidRevokeSessionError';
  }
}
