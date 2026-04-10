import { prisma } from "@/lib/prisma";
import Chat from "@/components/Chat";
import { notFound } from "next/navigation";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { seller: true },
  });

  if (!product) return notFound();

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>{product.title}</h1>
      <p>{product.description}</p>
      <p>Precio: ${product.priceCOP.toLocaleString('es-CO')}</p>
      <p>Vendedor: {product.seller.name || 'Anónimo'}</p>
      <Chat productId={product.id} sellerId={product.sellerId} />
    </div>
  );
}
