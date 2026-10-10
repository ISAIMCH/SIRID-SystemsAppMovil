import { useState } from 'react';

import { AdminHub, AdminPillToggle } from './admin-hub';
import { useAuth } from './auth-context';
import DirectoryScreen from './directory-screen';
import StaffScreen from './staff-screen';

type View = 'directory' | 'create';

export default function AdminUsersHubScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('directory');
  if (user?.role !== 'Admin') return <DirectoryScreen />;
  return (
    <AdminHub title="Usuarios" detail="Directorio y nuevas cuentas del gimnasio." toggle={<AdminPillToggle value={view} onChange={setView} options={[{ value: 'directory', label: 'Directorio' }, { value: 'create', label: 'Nuevo registro' }]} />}>
      {view === 'directory' ? <DirectoryScreen /> : <StaffScreen />}
    </AdminHub>
  );
}
