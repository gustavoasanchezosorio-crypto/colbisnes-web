# Campaña de reactivación — Colbisnes

*Escrito el 3 de septiembre de 2026, tres semanas después del lanzamiento (12 de agosto).*

Pediste tres cosas: validar si Colbisnes es rentable, una campaña de publicidad, y los ajustes
técnicos para poder medirla. Este documento contesta las tres, en ese orden, con números sacados
de producción hoy mismo — no supuestos.

Resumen de una línea: **la comisión está bien diseñada y no es el problema. El problema es que en
tres semanas no se ha cerrado ni una sola venta**, y salir a pagar publicidad ahora mismo repetiría
un error que tu propio documento de lanzamiento ya había anticipado y evitado una vez.

---

# 0. ¿Es rentable Colbisnes? Veredicto directo

## La comisión está bien construida

Revisé `lib/pricing.ts` línea por línea. El mecanismo:

- **10% en pagos online, 3% en contra-entrega**, y **siempre lo paga el comprador** — se le suma
  al precio, nunca se descuenta de lo que pidió el vendedor.
- El comprador también cubre, vía una fórmula de *gross-up* (líneas 87-116), el costo de Wompi
  (2.65% + $700 fijo + IVA) y el GMF de entrada (0.4%). Esto existe porque antes la comisión
  absorbía esos costos y **en ventas pequeñas Colbisnes perdía plata por el fijo de Wompi** — ya
  está corregido y el comentario en el código deja constancia de por qué.
- El vendedor recibe el 100% de lo que pidió (menos el 4x1000 de salida cuando Colbisnes le
  transfiere, que es un impuesto real e inevitable, no un cobro tuyo).

**Ejemplo concreto, con la fórmula real:** un producto de $100.000 COP pagado online —

| | Monto |
|---|---|
| Paga el comprador | $114.898 |
| Recibe el vendedor (neto, tras 4x1000) | $99.600 |
| Le queda a Colbisnes (tras cubrir Wompi + GMF) | **≈ $9.982** |

Casi el 10% completo llega limpio. La fórmula escala igual de bien en productos caros: el Honda
Accord que está publicado ahora mismo en $46.000.000 dejaría **$4.600.000 COP de comisión en una
sola venta** si se cierra. No hace falta volumen masivo — hace falta que se cierre *algo*.

## El veredicto real

No es "poco rentable". Es que **todavía no hay nada que evaluar**: cero ventas completadas, cero
ingresos reales desde el 12 de agosto. La pregunta "¿es rentable Colbisnes?" no tiene respuesta
todavía porque el numerador (ingresos) es $0. No es un problema de margen — el margen ya está
protegido y verificado en código. Es un problema de **liquidez de transacciones: cero**.

## Costos fijos — lo que sé y lo que falta

De la auditoría de facturación del 3 de septiembre ([[project-colbisnes-billing-audit]]):
- **Veriff y ePayco**: código muerto, cero referencias, siguen con llaves en `.env`. Candidatos a
  cancelar la cuenta si te siguen cobrando — pendiente que revises el dashboard de cada uno.
- **Wompi, Resend, Neon, Cloudflare**: sanos, sin gasto desperdiciado detectado.

Lo que **no puedo confirmar sin acceso a dashboards** (no hay llave ni MCP para esto): el costo
mensual de Railway (hosting de la app), Twilio (WhatsApp transaccional), y renovación de dominio.
Si quieres el número completo de "cuánto cuesta operar Colbisnes al mes", dime y estos tres son
los que faltan — todo lo demás ya está verificado.

---

# 1. El embudo completo, hoy

Esto es lo que hay en producción ahora mismo, no una estimación:

| Etapa | Número | Nota |
|---|---|---|
| Lista de espera (pre-lanzamiento) | 22 | Congelada — la puerta de `/coming-soon` la usó **1 persona** en las tres semanas desde que abriste. Ya no es el embudo real. |
| Usuarios registrados | 18 | Este es el embudo real hoy: entra por registro normal. |
| Verificados (KYC aprobado) | 10 de 18 | |
| Publicaron al menos un producto | **7 de 18** | La métrica que tu propio documento de lanzamiento marcó como "la que de verdad se te va a escapar". |
| Productos publicados | 10 | Meta que tú mismo fijaste antes de abrir: **25**. Hoy vas al 40%. |
| Cupos de destacado gratis usados | **0 de 30** | Nadie los ha pedido. Sigue completo. |
| Mensajes enviados | 54 | Ver más abajo — no son 54 compradores distintos, ni siquiera varios. |
| Ofertas hechas | 2 | Ambas las hizo tu propia cuenta. Ver más abajo. |
| Órdenes creadas | 1 | `PENDIENTE`, nunca pagada. La creó tu propia cuenta el día del lanzamiento — no un cliente externo. Ver más abajo. (El webhook de Wompi en `app/api/webhooks/wompi/route.ts` sigue bien asegurado — firma SHA-256, verificación de monto, idempotencia — pero eso no es lo relevante en este caso). |
| Ventas completadas | **0** | |

## Lo que esto dice (corregido el 3 de septiembre, más tarde el mismo día)

La primera versión de este documento decía "el cuello de botella es oferta, no demanda" basándose
en el conteo de 54 mensajes y 2 ofertas. Al revisar quién mandó cada mensaje — no solo cuántos
hubo — esa lectura no se sostiene, y toca corregirla en vez de dejarla:

- **47 de los 54 mensajes (87%)** son un solo hilo entre tu cuenta
  (`gustavoa.sanchezosorio@gmail.com`) y una cuenta (`dayanygaitan`) que se registró **6 minutos
  antes** del primer mensaje, sobre el iPhone 12 Pro Max — ping-pong cada 20-90 segundos durante
  dos días. Es el patrón de alguien probando el chat, no una negociación real.
- Los otros 7 mensajes se reparten en tres hilos más, y **en los cuatro hilos, sin excepción, tu
  cuenta aparece como emisor o receptor.** Uno es con `vladicamargoq`, que se registró 27 minutos
  antes de escribir (hoy, la 1 a.m.).
- **Las 2 ofertas también son tuyas** — mismo comprador (tú), mismo producto ("HERMOSAS VIRGENES
  PERSONALIZADAS"), ambas rechazadas.
- **La única orden también la creaste tú**, el día del lanzamiento.

Dicho directo: no encontré, en mensajes ni en ofertas, un solo caso de un comprador externo
escribiéndole a un vendedor sin que tu cuenta estuviera de por medio. No puedo descartar del todo
que `dayanygaitan` o `vladicamargoq` sean conocidos reales ayudándote a probar de buena fe — pero
el patrón (cuenta con minutos de vida, conversación intensa contigo) pesa más hacia "cuenta de
prueba" que hacia "cliente orgánico". La frase "54 mensajes = interés real" de la primera versión
se retracta.

**Esto cambia el diagnóstico, no la urgencia.** No es que sobre demanda y falte oferta — es que
**las dos cosas siguen sin probarse.** Eso hace la recomendación de la siguiente sección más
fuerte, no más débil: si ni el tráfico que ya conoces (tú mismo, gente cercana) generó un solo
mensaje comprador→vendedor documentado, pagarle a Google o Meta por desconocidos es todavía más
prematuro de lo que ya parecía.

Tu propio documento de lanzamiento (`docs/campana-lanzamiento.md`, escrito antes del 12 de agosto)
ya lo predijo con una precisión incómoda:

> Si el 12 de agosto llegan 200 personas y encuentran una vitrina vacía, se van y no vuelven. […]
> **Meta mínima para el 12: 25 productos publicados.** Con menos de eso, mi consejo honesto es que
> retrases el empuje fuerte de compradores.

Tres semanas después ese umbral sigue sin cumplirse, y ahora tampoco hay confirmación de que haya
alguien del otro lado listo para comprar en cuanto se cumpla. Las dos cosas se resuelven con lo
mismo: gente real usando la app — vendedores publicando, compradores orgánicos llegando por canales
que no controlas tú directamente — no con tráfico pagado hacia un catálogo de 10 productos sin
ventas de referencia.

## Por eso: no voy a proponer prender medios pagados todavía

Pagarle a Google o Meta por tráfico frío hacia un catálogo de 10 productos es literalmente el
mismo error que evitaste antes de abrir, solo que aplazado tres semanas. Cada clic pagado que
aterriza en una vitrina que se siente vacía enseña "esta app no tiene nada" — y en un marketplace,
según tu propio diagnóstico, esa primera impresión no da segunda oportunidad.

La secuencia que sigue (fases 0, 1 y 2) es exactamente para no cometer ese error: primero
inventario, después tráfico orgánico, y solo cuando el catálogo aguante la mirada, tráfico pagado.

---

# 2. Público objetivo y mensaje (ya validado, se reutiliza igual)

## Público objetivo, en una frase

> Colombianos de 20 a 40 años, de ciudad, que ya compran y venden de segunda mano por Facebook
> Marketplace o WhatsApp, y que han dejado de cerrar tratos por miedo a que los tumben.

## Mensaje central

> **Compra y vende de segunda mano sin miedo: tu plata queda en custodia.**

## Tres variaciones (misma prueba de antes, sigue vigente)

| # | Mensaje | Qué prueba |
|---|---|---|
| A | Compra y vende de segunda mano sin miedo: tu plata queda en custodia. | El miedo como entrada |
| B | El vendedor no despacha hasta que el pago está asegurado. Y tú no pagas hasta que recibes. | El mecanismo, sin emoción |
| C | Si algo sale mal, el dinero nunca se movió. | La garantía, en seco |

No hay datos nuevos de cuál funciona mejor (nunca se llegó a medir con tráfico real). Sigue en pie
la apuesta original: **C para redes, B para WhatsApp**.

---

# 3. Fase 0 — AHORA, sin gastar un peso: reactivar oferta

Esta es la fase urgente. Meta: volver a 25 productos, con algo de variedad de ciudad además de
Bogotá (recuerda que el commit reciente habilitó 113 ciudades — hoy 8 de los 10 productos son de
Bogotá, así que vale la pena empujar directamente a alguien de Medellín, Cali o Barranquilla si
tienes ese contacto).

## Dos incentivos reales, y ambos siguen sin usarse

**1. Destacado gratis — 30 cupos, cero usados.** La oferta de tu documento original nunca se
gastó:

> Los primeros 30 vendedores que publiquen salen en portada gratis durante 7 días. Valor real:
> $8.000 por publicación.

Sigue exactamente igual de disponible que el primer día. No hace falta inventar nada nuevo, solo
volver a comunicarlo — y recordar que la concesión es manual desde el panel de administración
(no está automatizado, tal como se dejó anotado la vez pasada).

**2. Nuevo — comisión más baja después de tu primera venta.** Esto se corrigió ayer (commit
`c6a96b1`, 2026-09-02): antes 16 de 17 usuarios tenían descuento de comisión solo por verificar su
identidad, sin haber vendido nada — ya no. Ahora el descuento (hasta -30% sobre la comisión que
paga *tu comprador*, según tu nivel de confianza) se activa solo al cerrar tu primer negocio. Es un
gancho honesto y nuevo que no existía cuando se escribió la campaña original: **vende una vez aquí
y tu próxima venta sale más barata para quien te compre.**

## Copy — WhatsApp, uno a uno (a los 11 que se registraron y nunca publicaron)

> Parce, viste que Colbisnes ya está abierta — ¿alcanzaste a publicar algo?
>
> Si tienes algo guardado (ropa, un celular viejo, lo que sea), publicarlo no te cuesta nada y
> recibes completo lo que pides. Ahorita mismo siguen abiertos los 30 cupos de portada gratis por
> una semana, y ya nadie los ha pedido.
>
> ¿Te ayudo a subir el primero?

## Copy — correo de reactivación (a los 18 usuarios registrados)

> **Asunto: Tu catálogo en Colbisnes sigue esperando tu primer producto**
>
> Colbisnes ya está abierta. Publicar no cuesta nada — la comisión la paga quien te compra, tú
> recibes el 100% de lo que pediste.
>
> Ahora mismo tienes dos razones más para publicar hoy:
> - **Portada gratis 7 días** en tus primeras publicaciones (quedan 30 cupos, ninguno usado
>   todavía).
> - **Comisión más baja en tu próxima venta**, apenas cierres la primera.
>
> [Publicar algo →]

## Copy — Reel corto (15 s), "publica algo hoy"

| Tiempo | Imagen | Texto en pantalla |
|---|---|---|
| 0-3 s | Clóset o cajón con cosas guardadas | ¿Cuánto de esto no has vuelto a usar? |
| 3-8 s | Pantalla de Colbisnes, botón "Publicar" | Publicarlo no cuesta nada |
| 8-12 s | Pantalla mostrando "portada gratis 7 días" | Los primeros en publicar salen en portada gratis |
| 12-15 s | Logo | colbisnes.com |

---

# 4. Fase 1 — En paralelo, orgánico, sin gastar: despertar demanda

Corre al mismo tiempo que la Fase 0, no después. Reutiliza el contenido ya escrito y validado en
`docs/campana-lanzamiento.md` (guiones de Reel, hilos de X, publicaciones de LinkedIn, mensajes de
WhatsApp, lista de comunidades de Reddit/Facebook) — sigue siendo válido casi todo tal cual, con un
solo cambio de fondo: ya no es "esto abre pronto", es "esto ya está abierto". Los guiones que
hablaban de fecha de apertura o del acceso anticipado (Guion 2 y los tuits de cuenta regresiva) ya
no aplican; el resto sí.

Prioridad de canal, sin cambios respecto al plan original: **WhatsApp e Instagram concentran el
80% del esfuerzo**, porque son los que no dependen de que un algoritmo decida mostrarte.

## Sobre "todos los medios de comunicación"

Pediste arrancar publicidad por todos los medios. Siendo honesto sobre lo que puedo ejecutar o
ayudarte a activar sin agencia ni presupuesto de pauta: WhatsApp, Instagram, TikTok, X, LinkedIn,
comunidades de Reddit/Facebook y correo son terreno donde puedo darte contenido listo para publicar
hoy mismo. Televisión, radio o vallas están fuera de lo que esto puede ejecutar — necesitan
presupuesto y una agencia, y con catálogo de 10 productos tampoco sería buen momento para ese
gasto. Lo que sí cubre el objetivo de "todos los medios" que puedes accionar tú mismo, sin gastar,
está completo en la Fase 1 y en el documento original.

---

# 5. Fase 2 — Cuando el catálogo aguante la mirada: medios pagados

## Checklist para activar pauta paga (Google/Meta)

No lo actives hasta que se cumplan al menos estos tres:

- [ ] 25+ productos publicados (tu propio umbral, todavía no cumplido)
- [ ] Al menos 3 ciudades distintas representadas (hoy: 2)
- [ ] Al menos una venta completada de punta a punta (hoy: 0) — es la prueba de que el
      checkout convierte de verdad, no solo en teoría

Cuando los tres estén en verde, avísame y prendemos esta fase con presupuesto real.

## Copy ya listo para ese momento (Meta/Google Ads)

**Meta Ads (Instagram/Facebook feed):**

> Título: Vende sin miedo a que no te paguen
> Texto: En Colbisnes tu plata queda en custodia hasta que el comprador confirma que recibió. Si
> algo sale mal, el dinero nunca se movió. Publicar es gratis y recibes el 100% de lo que pides.
> CTA: Publicar ahora

**Google Ads (búsqueda, para keywords tipo "vender [producto] usado bogotá"):**

> Título 1: Vende de segunda mano sin miedo
> Título 2: Tu plata en custodia hasta la entrega
> Descripción: El comprador paga la comisión, no tú. Publica gratis y recibe el 100%.

Quedan guardados aquí, listos para usarse en cuanto la checklist esté completa — no hace falta
volver a pedírmelos.

---

# 6. Ajustes técnicos de tracking — propuesta, nada aplicado todavía

Esto es lo que pediste como "ajustes de publicidad" en la parte técnica. **No toqué código**;
esto es una propuesta para que la confirmes antes de que haga cualquier cambio.

## 1. Un enlace distinto por canal — sin código

`colbisnes.com/?d=ig` · `/?d=wa` · `/?d=rd` · `/?d=li` · `/?d=email`

Verifiqué `middleware.ts`: lo único que lee de la URL es el parámetro `acceso`; cualquier otro
parámetro (`d`, o el que sea) pasa sin tocarse y sin romper nada. Es seguro repartir estos enlaces
ya mismo, hoy, sin ningún cambio de código.

## 2. Cloudflare Web Analytics — sigue sin implementarse

Confirmé (otra vez, con `grep` sobre todo el repo) que no existe ningún código de analytics
todavía — sigue pendiente desde que se anotó en la campaña original. Es la opción correcta para tu
caso: gratis, sin cookies, sin banner de consentimiento, y ya usas Cloudflare para DNS. Activarlo
requiere:

- Prender la opción desde el panel de Cloudflare (sin código), **o**
- Agregar una etiqueta de script en el layout de la app (cambio de código pequeño, una línea)

**¿Quieres que la agregue ahora?** Es un cambio mínimo y reversible, pero toca código de producción
y prefiero tu confirmación explícita antes de tocarlo, como con cualquier cambio a lo que ya está
en vivo.

---

# 7. Métricas a seguir

Mismo marco que ya habías definido, con los números de hoy como línea base:

1. **Productos publicados** — hoy 10, meta 25. La que más importa: decide si hay algo que mirar.
2. **De los registrados, cuántos publican algo** — hoy 7 de 18 (39%). Si con la reactivación de la
   Fase 0 este número no sube, el problema no es que no sepan de la campaña — es que el flujo de
   publicar tiene fricción que hay que revisar (ese es el trabajo en paralelo que mencionaste,
   fuera del alcance de este documento).
3. **Primera venta completa de punta a punta** — hoy 0. Es la que de verdad prueba que todo el
   mecanismo (pago, envío, confirmación, liberación) funciona con dos desconocidos reales.

Ignora "me gusta" y vistas de Reels como siempre — mide contra estas tres, no contra el aplauso.
