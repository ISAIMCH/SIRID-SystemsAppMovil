import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api } from './api';

export type StaffInvitation = {
  id: string;
  roles: ('Gerente' | 'Coach' | 'Recepcion')[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  gym: { id: string; name: string | null };
  organization: { id: string; name: string | null };
  invitedBy: { id: string; name: string | null } | null;
  createdAt: string;
  expiresAt: string;
};

export async function fetchMyStaffInvitations() {
  return (await api.get<{ invitations: StaffInvitation[] }>('/staff-invitations/me')).data.invitations;
}

// The staff of the inviting gym also gets 'staff-invitation:updated', so every event re-reads the person's own list
// instead of trusting the event.
function useStaffInvitationUpdates(onUpdate: () => void) {
  useEffect(() => {
    const socket = connectSocket();
    socket.on('staff-invitation:updated', onUpdate);
    return () => { socket.off('staff-invitation:updated', onUpdate); };
  }, [onUpdate]);
}

// How many gyms are waiting for the person to answer an invitation to their staff.
export function usePendingStaffInvitations() {
  const [count, setCount] = useState(0);
  const [reloadNumber, setReloadNumber] = useState(0);
  const reload = useCallback(() => setReloadNumber((value) => value + 1), []);

  useEffect(() => {
    let isCurrent = true;
    fetchMyStaffInvitations()
      .then((invitations) => { if (isCurrent) setCount(invitations.length); })
      .catch(() => undefined);
    return () => { isCurrent = false; };
  }, [reloadNumber]);

  useStaffInvitationUpdates(reload);
  return count;
}

// Invitations already announced in this session, so a gym change does not repeat them.
const announced = new Set<string>();

function announce(invitations: StaffInvitation[]) {
  const fresh = invitations.filter((invitation) => !announced.has(invitation.id));
  if (fresh.length === 0) return;
  fresh.forEach((invitation) => announced.add(invitation.id));
  Alert.alert(
    'Invitación al staff',
    fresh.length === 1
      ? `${fresh[0].organization.name ?? 'Un gimnasio'} te invita a su staff. Tú decides si aceptas.`
      : `${fresh.length} gimnasios te invitan a su staff. Tú decides si aceptas.`,
    [
      { text: 'Después', style: 'cancel' },
      { text: 'Revisar', onPress: () => router.push('/staff-invitations' as Href) },
    ],
  );
}

// In-app notice (no push) for anyone signed in, clients and staff alike: on opening the app and as invitations arrive.
export default function StaffInvitationNotifier() {
  const check = useCallback(() => {
    fetchMyStaffInvitations().then(announce).catch(() => undefined);
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useStaffInvitationUpdates(check);
  return null;
}
