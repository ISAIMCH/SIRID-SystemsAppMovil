import { useCallback, useEffect } from 'react';
import { Alert } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api } from './api';
import { useAuth } from './auth-context';

type EnrollmentNotice = {
  organization: { id: string; name: string };
  gym: { id: string; name: string };
  createdAt: string;
};

async function fetchEnrollmentNotices() {
  return (await api.get<{ notices: EnrollmentNotice[] }>('/auth/me/enrollment-notices')).data.notices;
}

function dismissNotices(notices: EnrollmentNotice[]) {
  notices.forEach((notice) => {
    api.post(`/auth/me/enrollment-notices/${notice.organization.id}/dismiss`).catch(() => undefined);
  });
}

// Notices already shown in this session, so a gym change or a second event does not repeat them.
const announced = new Set<string>();

function announce(notices: EnrollmentNotice[]) {
  const fresh = notices.filter((notice) => !announced.has(notice.organization.id));
  if (fresh.length === 0) return;
  fresh.forEach((notice) => announced.add(notice.organization.id));
  const where = fresh.map((notice) => notice.gym.name || notice.organization.name).join(', ');
  Alert.alert(
    'Te registraron en un gimnasio',
    `Recepción de ${where} te dio de alta como cliente con este correo. Ya lo verás en tus gimnasios. `
      + 'Tu historial de otros gimnasios sigue siendo privado.',
    [{ text: 'Entendido', onPress: () => dismissNotices(fresh) }],
    { cancelable: false },
  );
}

// In-app notice (no push) when reception adds an existing account as a client: on opening the app and live.
export default function EnrollmentNotifier() {
  const { refreshSession } = useAuth();

  const check = useCallback(() => {
    fetchEnrollmentNotices().then(announce).catch(() => undefined);
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    const socket = connectSocket();
    // The new gym joins the switcher before the notice shows.
    const onEnrollment = () => {
      refreshSession().catch(() => undefined).finally(check);
    };
    socket.on('client-enrollment:created', onEnrollment);
    return () => { socket.off('client-enrollment:created', onEnrollment); };
  }, [check, refreshSession]);

  return null;
}
