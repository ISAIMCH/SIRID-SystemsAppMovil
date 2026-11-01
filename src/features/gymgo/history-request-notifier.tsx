import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api } from './api';

type ShareUpdate = { id: string; status: string };

// Requests already announced in this session, so a gym change (which remounts the tabs) does not repeat them.
const announced = new Set<string>();

function announce(ids: string[]) {
  const fresh = ids.filter((id) => !announced.has(id));
  if (fresh.length === 0) return;
  fresh.forEach((id) => announced.add(id));
  Alert.alert(
    'Solicitud de historial',
    fresh.length === 1
      ? 'Un gimnasio quiere ver tu historial de entrenamiento. Tú decides si lo compartes.'
      : `${fresh.length} gimnasios quieren ver tu historial de entrenamiento. Tú decides si lo compartes.`,
    [
      { text: 'Después', style: 'cancel' },
      { text: 'Revisar', onPress: () => router.push('/(main)/privacy' as Href) },
    ],
  );
}

// In-app notice (no push) when a gym asks for the client's history: on opening the app and as it arrives.
export default function HistoryRequestNotifier() {
  useEffect(() => {
    let isCurrent = true;
    api.get<{ shares: ShareUpdate[] }>('/history-shares/me')
      .then((response) => {
        if (isCurrent) announce(response.data.shares.filter((share) => share.status === 'pending').map((share) => share.id));
      })
      .catch(() => undefined);

    const socket = connectSocket();
    const handleUpdate = (update: ShareUpdate) => {
      if (update.status === 'pending') announce([update.id]);
    };
    socket.on('history-share:updated', handleUpdate);
    return () => {
      isCurrent = false;
      socket.off('history-share:updated', handleUpdate);
    };
  }, []);

  return null;
}
