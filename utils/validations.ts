import { z } from 'zod';
import { CITIES } from '@/lib/theme';

export const productSchema = z.object({
  title: z.string().min(3, "Mínimo 3 caracteres").max(100),
  priceCOP: z.number().min(1000, "Precio mínimo $1,000"),
  city: z.enum(CITIES),
  description: z.string().min(10, "Mínimo 10 caracteres").max(500),
});

export type ProductFormData = z.infer<typeof productSchema>;
