import { useState } from 'react';

import { AdminHub, AdminPillToggle } from './admin-hub';
import InventoryScreen from './inventory-screen';
import MaintenanceScreen from './maintenance-screen';

type View = 'equipment' | 'maintenance';

export default function AdminInventoryHubScreen() {
  const [view, setView] = useState<View>('equipment');
  return (
    <AdminHub title="Inventario" detail="Equipos y mantenimiento del gimnasio." toggle={<AdminPillToggle value={view} onChange={setView} options={[{ value: 'equipment', label: 'Equipos' }, { value: 'maintenance', label: 'Mantenimiento' }]} />}>
      {view === 'equipment' ? <InventoryScreen /> : <MaintenanceScreen />}
    </AdminHub>
  );
}
