import ProductPageClient from "./ProductPageClient";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductPageClient productId={id} />;
}
