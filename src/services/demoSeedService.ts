import type { Product } from '@/types';
import { categoryService } from '@/services/categoryService';
import { productService } from '@/services/productService';
import { slugify } from '@/utils/format';
import { gerarCodigo } from '@/utils/generate';

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
            details: 'A Camiseta Essential é a peça-chave para quem busca conforto e estilo em um só item. Confeccionada com algodão penteado de alta qualidade, oferece um toque suave e durabilidade excepcional. Seu caimento reto proporciona um visual moderno e versátil, perfeito para compor looks casuais ou mais elaborados. Com design unissex, é a escolha ideal para quem valoriza praticidade sem abrir mão do estilo.',
            category: 'Moda',
            subcategory: 'Camisetas',
            imageUrls: ['https://placehold.co/1000x1000/F1F5F9/0F172A?text=Camiseta+Essential'],
            code: "fgbrfgdeve"
        },
        {
            name: 'Moletom Studio',
            price: 219.9,
            quantity: 7,
            description: 'Peça com acabamento encorpado para coleções autorais e lifestyle.',
            characteristics: ['Interior felpado', 'Punho reforçado', 'Modelagem premium'],
            details: 'O Moletom Studio combina conforto e estilo em uma peça versátil para qualquer momento do dia. Confeccionado com material de alta qualidade, oferece um toque macio e durável. Seu design premium e acabamento encorpado tornam-no a escolha perfeita para quem busca conforto sem abrir mão do estilo.',
            category: 'Moda',
            subcategory: 'Moletons',
            imageUrls: ['https://placehold.co/1000x1000/E2E8F0/0F172A?text=Moletom+Studio'],
            code: "asdas1323"
        },
        {
            name: 'Boné Signature',
            price: 69.9,
            quantity: 22,
            description: 'Acessório de entrada perfeito para ampliar ticket médio da loja.',
            characteristics: ['Aba curva', 'Regulagem traseira', 'Bordado frontal'],
            details: 'O Boné Signature é o acessório perfeito para complementar seu estilo com um toque de autenticidade. Com aba curva e regulagem traseira, oferece conforto e ajuste personalizado para todos os tamanhos. Seu design moderno, realçado por um bordado frontal exclusivo, torna-o a escolha ideal para quem busca praticidade sem abrir mão do estilo.',
            category: 'Acessórios',
            subcategory: 'Bonés',
            imageUrls: ['https://placehold.co/1000x1000/DBEAFE/0F172A?text=Bone+Signature'],
            code: "213123sad",
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
                details: item.details,
                categoryId,
                subcategoryId,
                imageUrls: item.imageUrls,
                status: 'active',
                code: item.code,
            };

            await productService.save(payload);
        }
    },
};
