import { Html, Head, Preview, Body, Container, Text } from '@react-email/components';

interface PagoRecibidoProps {
  nombreVendedor: string;
  tituloProducto: string;
  monto: number;
  urlEntrega: string;
}

export default function PagoRecibido({
  nombreVendedor,
  tituloProducto,
  monto,
}: PagoRecibidoProps) {
  return (
    <Html>
      <Head />
      <Preview>Pago recibido</Preview>
      <Body>
        <Container>
          <Text>Hola {nombreVendedor},</Text>
          <Text>El comprador pagó por {tituloProducto} (${monto}).</Text>
        </Container>
      </Body>
    </Html>
  );
}
