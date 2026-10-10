import { useState } from 'react';

import { AdminCategoryRail, AdminHub } from './admin-hub';
import { useAuth } from './auth-context';
import DirectoryScreen from './directory-screen';
import StaffScreen from './staff-screen';

type View = 'clients' | 'coaches' | 'new-client' | 'new-coach';

const categories = [
  { value: 'clients', label: 'Lista de Clientes', icon: 'groups' },
  { value: 'coaches', label: 'Lista de Coaches', icon: 'sports' },
  { value: 'new-client', label: 'Nuevo Cliente', icon: 'person-add' },
  { value: 'new-coach', label: 'Nuevo Coach', icon: 'person-add' },
] as const;

export default function AdminUsersHubScreen() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('clients');
  if (user?.role !== 'Admin') return <DirectoryScreen />;
  const content = {
    clients: <DirectoryScreen key="clients" initialSegment="Cliente" hideSegmentToggle />,
    coaches: <DirectoryScreen key="coaches" initialSegment="Coach" hideSegmentToggle />,
    'new-client': <StaffScreen key="new-client" initialRole="Cliente" hideRoleSelector />,
    'new-coach': <StaffScreen key="new-coach" initialRole="Coach" hideRoleSelector />,
  }[view];
  return (
    <AdminHub title="Usuarios" detail="Consulta listas y crea cuentas del gimnasio." toggle={<AdminCategoryRail value={view} onChange={setView} options={categories} />}>
      {content}
    </AdminHub>
  );
}
