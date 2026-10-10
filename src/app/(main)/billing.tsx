import { useAuth } from '@/features/gymgo/auth-context';
import BillingScreen from '@/features/gymgo/billing-screen';
import ClientProfileHub from '@/features/gymgo/client-profile-hub';

export default function BillingRoute() {
	const { user } = useAuth();
	return user?.role === 'Cliente' ? <ClientProfileHub /> : <BillingScreen />;
}