import { useState } from 'react';

import { AdminPillToggle } from './admin-hub';
import OrderDesk from './order-desk';
import PaymentDesk from './payment-desk';
import { AppHeader, Page } from './ui';

type Desk = 'payments' | 'orders';

// The front desk's register (Admin and Recepcion): membership payments and store pickups, both by PIN.
export default function CashierScreen() {
  const [desk, setDesk] = useState<Desk>('payments');
  return (
    <Page admin>
      <AppHeader title="Caja" detail="Cobra membresías y entrega pedidos con el PIN del cliente." />
      <AdminPillToggle value={desk} onChange={setDesk} options={[{ value: 'payments', label: 'Membresías' }, { value: 'orders', label: 'Pedidos' }]} />
      {desk === 'payments' ? <PaymentDesk /> : <OrderDesk />}
    </Page>
  );
}
