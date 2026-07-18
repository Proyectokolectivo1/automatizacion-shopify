export function membershipTransactionLockKey(organizationId: string): string {
  return `identity.memberships:${organizationId}`;
}
