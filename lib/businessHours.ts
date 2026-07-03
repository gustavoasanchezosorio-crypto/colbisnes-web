// Calcula fechas límite contando solo "horas hábiles" dentro de la franja 8:00am - 8:00pm
// (hora de Colombia, America/Bogota, UTC-5 fijo todo el año, sin horario de verano).
// Se usa para el plazo de despacho de 24 horas hábiles en ventas contra entrega.

const BOGOTA_OFFSET_HOURS = -5; // Colombia no tiene horario de verano
const HORA_INICIO = 8;  // 8:00 am
const HORA_FIN = 20;    // 8:00 pm

function aHoraBogota(date: Date): Date {
  // date.getTime() ya son milisegundos UTC reales, sin importar la zona horaria
  // configurada en el proceso (servidor). Restamos 5 horas para obtener un objeto Date
  // cuyos getters "UTC" (getUTCHours, setUTCHours, etc.) reflejen directamente la hora
  // de reloj de Bogotá. Esto es intencionalmente independiente del TZ del servidor.
  return new Date(date.getTime() + BOGOTA_OFFSET_HOURS * 3600000);
}

function deHoraBogotaAUtc(bogota: Date): Date {
  return new Date(bogota.getTime() - BOGOTA_OFFSET_HOURS * 3600000);
}

// Suma `horasHabiles` horas contadas solo dentro de la franja 8am-8pm (hora Bogotá),
// saltando el tiempo fuera de esa franja (noches). No excluye fines de semana ni festivos,
// solo el horario nocturno, ya que las transportadoras despachan también sábados/domingos.
export function sumarHorasHabiles(desde: Date, horasHabiles: number): Date {
  let restante = horasHabiles * 60; // en minutos
  let cursor = aHoraBogota(desde);

  // Si el punto de partida está fuera de la franja horaria, lo adelantamos al inicio de la próxima franja
  if (cursor.getUTCHours() >= HORA_FIN || cursor.getUTCHours() < HORA_INICIO) {
    if (cursor.getUTCHours() >= HORA_FIN) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    cursor.setUTCHours(HORA_INICIO, 0, 0, 0);
  }

  while (restante > 0) {
    const finDeHoy = new Date(cursor);
    finDeHoy.setUTCHours(HORA_FIN, 0, 0, 0);

    const minutosDisponiblesHoy = (finDeHoy.getTime() - cursor.getTime()) / 60000;

    if (restante <= minutosDisponiblesHoy) {
      cursor = new Date(cursor.getTime() + restante * 60000);
      restante = 0;
    } else {
      restante -= minutosDisponiblesHoy;
      cursor = new Date(finDeHoy);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(HORA_INICIO, 0, 0, 0);
    }
  }

  return deHoraBogotaAUtc(cursor);
}

// Calcula el deadline de despacho: 24 horas hábiles (8am-8pm) desde la creación de la orden.
export function calcularFechaLimiteEnvio(desde: Date = new Date()): Date {
  return sumarHorasHabiles(desde, 24);
}
