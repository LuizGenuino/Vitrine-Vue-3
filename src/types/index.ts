export type ThemeMode = 'light' | 'dark';

export interface StoreSettings {
  id?: string;
  ownerId: string;
  slug: string;
  storeName: string;
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  bannerUrl?: string;
  whatsappNumber: string;
  activePlanId?: string;
  customDomain?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id?: string;
  ownerId: string;
  name: string;
  slug: string;
  order: number;
}

export interface Subcategory {
  id?: string;
  ownerId: string;
  categoryId: string;
  name: string;
  slug: string;
  order: number;
}

export interface Product {
  id?: string;
  ownerId: string;
  slug: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
  description: string;
  characteristics: string[];
  categoryId?: string;
  subcategoryId?: string;
  imageUrls: string[];
  status: 'active' | 'draft';
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductFilters {
  search: string;
  categoryId: string | null;
  subcategoryId: string | null;
  sort: 'featured' | 'price-asc' | 'price-desc' | 'name-asc';
}

export interface CartItem {
  productId: string;
  storeSlug: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export interface AuthForm {
  name?: string;
  email: string;
  password: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceLabel: string;
  productLimit: number;
  tagline: string;
  description: string;
  features: string[];
  recommended?: boolean;
  availableForCheckout?: boolean;
}

export interface OrderIntent {
  id?: string;
  storeOwnerId: string;
  storeSlug: string;
  customerChannel: 'whatsapp';
  source: 'product' | 'cart';
  productNames: string[];
  itemCount: number;
  totalValue: number;
  messagePreview: string;
  pageUrl?: string;
  createdAt: string;
}
