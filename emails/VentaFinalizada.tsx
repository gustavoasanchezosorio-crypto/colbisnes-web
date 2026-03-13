import { Html, Head, Preview, Body, Container, Text } from '@react-email/components';

interface VentaFinalizadaProps {
  nombreComprador: string;
  tituloProducto: string;
  monto: number;
  urlCalificar: string;
}

export default function VentaFinalizada({
  nombreComprador,
  tituloProducto,
  monto,
}: VentaFinalizadaProps) {
  return (
    <Html>
      <Head />
      <Preview>Compra completada</Preview>
      <Body>
        <Container>
          <Text>Hola {nombreComprador},</Text>
          <Text>Recibiste {tituloProducto} (${monto}). ¡Califica al vendedor!</Text>
        </Container>
      </Body>
    </Html>
  );
}
