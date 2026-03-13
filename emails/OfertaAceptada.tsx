import { Html, Head, Preview, Body, Container, Text } from '@react-email/components';

interface OfertaAceptadaProps {
  nombreComprador: string;
  tituloProducto: string;
  montoOferta: number;
  urlPago: string;
}

export default function OfertaAceptada({
  nombreComprador,
  tituloProducto,
  montoOferta,
}: OfertaAceptadaProps) {
  return (
    <Html>
      <Head />
      <Preview>Oferta aceptada</Preview>
      <Body>
        <Container>
          <Text>Hola {nombreComprador},</Text>
          <Text>Tu oferta por {tituloProducto} (${montoOferta}) fue aceptada.</Text>
        </Container>
      </Body>
    </Html>
  );
}
