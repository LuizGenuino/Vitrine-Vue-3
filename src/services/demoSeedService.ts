import type { Product } from '@/types';
import { categoryService } from '@/services/categoryService';
import { productService } from '@/services/productService';
import { slugify } from '@/utils/format';

const demoCatalog = {
  categories: [
    {
      name: 'Moda',
      subcategories: ['Camisetas', 'Moletons'],
    },
    {
      name: 'Acessórios',
      subcategories: ['Bonés', 'Bolsas'],
    },
  ],
  products: [
    {
      name: 'Camiseta Essential',
      price: 89.9,
      quantity: 18,
      description: 'Modelagem minimalista com toque premium para uso diário.',
      characteristics: ['Algodão penteado', 'Caimento reto', 'Unissex'],
      category: 'Moda',
      subcategory: 'Camisetas',
      imageUrls: ['https://placehold.co/1000x1000/F1F5F9/0F172A?text=Camiseta+Essential'],
    },
    {
      name: 'Moletom Studio',
      price: 219.9,
      quantity: 7,
      description: 'Peça com acabamento encorpado para coleções autorais e lifestyle.',
      characteristics: ['Interior felpado', 'Punho reforçado', 'Modelagem premium'],
      category: 'Moda',
      subcategory: 'Moletons',
      imageUrls: ['https://placehold.co/1000x1000/E2E8F0/0F172A?text=Moletom+Studio'],
    },
    {
      name: 'Boné Signature',
      price: 69.9,
      quantity: 22,
      description: 'Acessório de entrada perfeito para ampliar ticket médio da loja.',
      characteristics: ['Aba curva', 'Regulagem traseira', 'Bordado frontal'],
      category: 'Acessórios',
      subcategory: 'Bonés',
      imageUrls: ['https://placehold.co/1000x1000/DBEAFE/0F172A?text=Bone+Signature'],
    },
  ],
};

export const demoSeedService = {
  async seed(ownerId: string) {
    const categoryMap = new Map<string, string>();
    const subcategoryMap = new Map<string, string>();

    for (const [index, category] of demoCatalog.categories.entries()) {
      const categoryId = await categoryService.saveCategory({
        ownerId,
        name: category.name,
        slug: slugify(category.name),
        order: index + 1,
      });
      categoryMap.set(category.name, categoryId);

      for (const [subIndex, subcategory] of category.subcategories.entries()) {
        const subcategoryId = await categoryService.saveSubcategory({
          ownerId,
          categoryId,
          name: subcategory,
          slug: slugify(subcategory),
          order: subIndex + 1,
        });
        subcategoryMap.set(`${category.name}:${subcategory}`, subcategoryId);
      }
    }

    for (const item of demoCatalog.products) {
      const categoryId = categoryMap.get(item.category) || '';
      const subcategoryId = subcategoryMap.get(`${item.category}:${item.subcategory}`) || '';

      const payload: Product = {
        ownerId,
        slug: slugify(item.name),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        description: item.description,
        characteristics: item.characteristics,
        categoryId,
        subcategoryId,
        imageUrls: item.imageUrls,
        status: 'active',
      };

      await productService.save(payload);
    }
  },
};
