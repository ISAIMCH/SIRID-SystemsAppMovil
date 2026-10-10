import { useState } from 'react';

import AdminBillingScreen from './admin-billing-screen';
import { AdminHub, AdminPillToggle } from './admin-hub';
import AdminStoreScreen from './admin-store-screen';

type View = 'payments' | 'store';

export default function AdminCommerceHubScreen() {
  const [view, setView] = useState<View>('payments');
  return (
    <AdminHub title="Comercio" detail="Cobros, productos y promociones." toggle={<AdminPillToggle value={view} onChange={setView} options={[{ value: 'payments', label: 'Cobros' }, { value: 'store', label: 'Tienda' }]} />}>
      {view === 'payments' ? <AdminBillingScreen /> : <AdminStoreScreen />}
    </AdminHub>
  );
}
