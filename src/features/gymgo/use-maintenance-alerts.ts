import { useEffect, useState } from 'react';

import { connectSocket } from '@/services/socket';

import { api } from './api';

export type MaintenanceAlert = {
  _id: string;
  status: 'pending' | 'in_progress' | 'resolved';
  equipment?: { _id: string; name: string; zone?: string };
};

// The gym's open maintenance reports (Admin and Coach), kept current as the dashboard updates them.
// Null until the first load; a failed load leaves it empty rather than blocking the screen.
export function useMaintenanceAlerts(enabled: boolean) {
  const [alerts, setAlerts] = useState<MaintenanceAlert[] | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let isCurrent = true;
    const load = () => {
      api.get<{ reports: MaintenanceAlert[] }>('/maintenance/reports')
        .then((response) => {
          if (isCurrent) setAlerts(response.data.reports.filter((report) => report.status !== 'resolved'));
        })
        .catch(() => {
          if (isCurrent) setAlerts([]);
        });
    };
    load();
    const socket = connectSocket();
    socket.on('maintenance-updated', load);
    return () => {
      isCurrent = false;
      socket.off('maintenance-updated', load);
    };
  }, [enabled]);

  return alerts;
}
