type MembershipLike = {
  status: 'pending' | 'active' | 'suspended' | 'expired';
  startsAt?: string;
  expiresAt?: string;
} | null | undefined;

export type MembershipDisplayStatus = 'none' | 'pending' | 'active' | 'suspended' | 'expired';

export const membershipStatusLabels: Record<MembershipDisplayStatus, string> = {
  none: 'Sin membresía',
  pending: 'Pendiente',
  active: 'Activa',
  suspended: 'Suspendida',
  expired: 'Vencida',
};

// The API keeps status 'active' until something renews or expires it, and every new client starts
// with an empty 'pending' membership; show what the client actually has today.
export function membershipDisplayStatus(membership: MembershipLike, now = Date.now()): MembershipDisplayStatus {
  if (!membership) return 'none';
  const expiresAt = membership.expiresAt ? new Date(membership.expiresAt).getTime() : null;
  if (membership.status === 'active' && expiresAt !== null && expiresAt < now) return 'expired';
  if (membership.status === 'pending' && !membership.startsAt && !membership.expiresAt) return 'none';
  return membership.status;
}

export function membershipLabel(membership: MembershipLike) {
  return membershipStatusLabels[membershipDisplayStatus(membership)];
}
