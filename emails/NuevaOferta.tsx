import { Html, Head, Preview, Body, Container, Text } from '@react-email/components';

interface NuevaOfertaProps {
  nombreVendedor: string;
  nombreComprador: string;
  tituloProducto: string;
  montoOferta: number;
  urlOferta: string;
}

export default function NuevaOferta({
  nombreVendedor,
  nombreComprador,
  tituloProducto,
  montoOferta,
}: NuevaOfertaProps) {
  return (
    <Html>
      <Head />
      <Preview>Nueva oferta en Colbisnes</Preview>
      <Body>
        <Container>
          <Text>Hola {nombreVendedor},</Text>
          <Text>{nombreComprador} te ha ofertado por {tituloProducto}: ${montoOferta}</Text>
        </Container>
      </Body>
    </Html>
  );
}
