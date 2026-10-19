import { create } from 'zustand';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export type CartProduct = Omit<CartItem, 'quantity'>;

interface CartStore {
  items: CartItem[];
  promotionId: string | null;
  addItem: (product: CartProduct) => void;
  setPromotionId: (promotionId: string | null) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  promotionId: null,

  addItem: (product) => set((state) => {
    const existingItem = state.items.find((item) => item.id === product.id);

    if (existingItem) {
      return {
        items: state.items.map((item) => (
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )),
      };
    }

    return { items: [...state.items, { ...product, quantity: 1 }] };
  }),

  setPromotionId: (promotionId) => set({ promotionId }),

  removeItem: (productId) => set((state) => {
    const existingItem = state.items.find((item) => item.id === productId);
    if (!existingItem) return state;

    return {
      items: existingItem.quantity > 1
        ? state.items.map((item) => (
          item.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        ))
        : state.items.filter((item) => item.id !== productId),
    };
  }),

  clearCart: () => set({ items: [], promotionId: null }),

  getTotalPrice: () => get().items.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  ),

  getTotalItems: () => get().items.reduce(
    (total, item) => total + item.quantity,
    0,
  ),
}));
