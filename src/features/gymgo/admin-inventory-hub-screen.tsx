import { useState } from 'react';

import AdminBillingScreen from './admin-billing-screen';
import { AdminCategoryRail, AdminHub } from './admin-hub';
import AdminStoreScreen from './admin-store-screen';
import InventoryScreen from './inventory-screen';
import MaintenanceScreen from './maintenance-screen';

type View = 'equipment' | 'maintenance' | 'payments' | 'products' | 'promotions';

const categories = [
  { value: 'equipment', label: 'Equipos', icon: 'fitness-center' },
  { value: 'maintenance', label: 'Mantenimiento', icon: 'build' },
  { value: 'payments', label: 'Cobros', icon: 'credit-card' },
  { value: 'products', label: 'Productos', icon: 'inventory-2' },
  { value: 'promotions', label: 'Promociones', icon: 'campaign' },
] as const;

export default function AdminInventoryHubScreen() {
  const [view, setView] = useState<View>('equipment');
  const content = {
    equipment: <InventoryScreen />,
    maintenance: <MaintenanceScreen />,
    payments: <AdminBillingScreen />,
    products: <AdminStoreScreen key="products" initialTab="products" hideTabs />,
    promotions: <AdminStoreScreen key="promotions" initialTab="promotions" hideTabs />,
  }[view];
  return <AdminHub title="Inventario" detail="Gestiona equipos, operación y comercio." toggle={<AdminCategoryRail value={view} onChange={setView} options={categories} />}>{content}</AdminHub>;
}
