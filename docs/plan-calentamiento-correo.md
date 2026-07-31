# Plan de calentamiento y envío del correo de lanzamiento

Cómo mandar el aviso de apertura a la lista de espera sin que el dominio acabe
marcado como spam. Fecha objetivo: **miércoles 12 de agosto de 2026, 10:20 a.m.
(hora de Colombia)**.

Todo lo de aquí se ejecuta a mano desde la terminal, en tu máquina, desde la raíz
del proyecto:

```
cd ~/Desktop/colbisnes/colbisnes-web
```

> **Aviso que conviene leer una vez.** El `.env` de este repo apunta a la base de
> datos de **producción**. El script lee direcciones reales y manda correo real.
> Un correo enviado no se puede cancelar, ni retirar, ni corregir después.

---

## 0. El DNS — ya está arreglado (30 de julio)

**Hecho. Esto ya no bloquea nada.** Se deja documentado porque conviene saber
cómo quedó y cómo comprobarlo si algún día algo huele raro.

El dominio tenía la autenticación a medias: DKIM funcionaba (por eso los correos
sueltos llegaban bien), pero el SPF estaba mal puesto — los valores que dio
Resend se habían cruzado. Mandar 200 correos de golpe desde un dominio con SPF
roto es la forma más rápida de que Gmail clasifique el dominio entero como spam,
y esa reputación luego cuesta semanas de recuperar.

Cómo quedó, ya verificado contra el servidor autoritativo y contra Google DNS:

| Host | Tipo | Valor |
|---|---|---|
| `send` | TXT | `v=spf1 include:amazonses.com ~all` |
| `send` | MX | `1 feedback-smtp.sa-east-1.amazonses.com` (intacto) |
| `resend._domainkey` | TXT | solo el `p=MIGf...` — un único registro |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:hola@colbisnes.com` |

Se corrigió el TXT de `send`, se borró un `v=spf1` de más que colgaba del
selector DKIM (dos TXT en un mismo selector dan resultados ambiguos en los
verificadores), y se le añadió el `rua=` al DMARC para recibir los informes.

Si quieres comprobarlo por tu cuenta en cualquier momento:

```
dig +short TXT send.colbisnes.com
dig +short TXT _dmarc.colbisnes.com
dig +short TXT resend._domainkey.colbisnes.com | wc -l   # debe dar 1
```

Queda una cosa por mirar, y es en el panel, no en la terminal: que
**resend.com/domains → colbisnes.com → Records** muestre el dominio en verde.
Suele tardar entre 5 minutos y 1 hora desde el cambio.

> Nota para quien edite estos registros en el futuro: **esta versión del panel de
> Cloudflare guarda los valores TXT con las comillas dobles incluidas**. Al
> escribir un TXT nuevo hay que teclearlo *con* comillas. Es lo contrario de lo
> que hace Cloudflare históricamente, así que conviene verificar con `dig`
> después de guardar.

---

## 1. Cómo funciona el script (lo justo para no equivocarse)

```
node scripts/send-launch-emails.ts [--solo=correo] [--limite=N] [--confirmar]
```

| Bandera | Qué hace |
|---|---|
| *(ninguna)* | **Ensayo en seco.** Lista a quién le llegaría y no manda nada. Es el modo por defecto a propósito. |
| `--confirmar` | Manda de verdad. Sin esta bandera no sale un solo correo. |
| `--limite=N` | Procesa solo los primeros N **pendientes**. Es lo que permite soltar la lista por tandas. |
| `--solo=correo` | Ignora la lista entera y manda únicamente a esa dirección. Para probar cómo se ve. |

Tres cosas que hacen que esto sea seguro de repetir:

- **Cada envío exitoso queda anotado** en `scripts/.launch-emails-sent.log`. Si
  vuelves a correr el script, esas direcciones se saltan solas. Puedes
  ejecutarlo diez veces: nadie recibe el correo dos veces.
- **`--limite` se aplica sobre los pendientes, no sobre la lista completa.** Si
  el día 10 mandas 50 y el día 11 corres `--limite=100`, el día 11 salen los
  100 *siguientes*, no los 100 primeros otra vez.
- **Si un envío falla, el script no se detiene.** Sigue con el resto y al final
  te da el resumen. Los fallidos no quedan en el log, así que basta con volver
  a correrlo para reintentar solo con ellos.

Dos detalles menores pero que sorprenden si no los sabes:

- El orden de la lista es **alfabético por correo**, no por orden de
  inscripción. La "primera tanda de 50" no son los 50 primeros que se apuntaron.
  Para calentar el dominio da igual, pero que no te extrañe.
- `--solo=` **sí anota** la dirección en el log. Si pruebas con un correo que
  también está en la lista de espera, después se lo saltará. Usa una dirección
  tuya que no esté apuntada, o asume que ya lo recibió.

---

## 2. Ensayo en seco (hazlo hoy mismo, no cuesta nada)

```
node scripts/send-launch-emails.ts
```

No manda nada. Te dice cuánta gente hay en la lista y te imprime las
direcciones. Sirve para dos cosas: confirmar que el script conecta con la base
de datos, y saber **cuántos** son — que es lo que decide si el calendario de
abajo tiene sentido o no.

Verás un aviso de Node parecido a `[MODULE_TYPELESS_PACKAGE_JSON]`. Es
cosmético, ignóralo. **No añadas `"type": "module"` al `package.json`**: eso
rompería `server.js`, que es el servidor de producción.

---

## 3. Prueba a tu propio correo (día 9 o 10, antes de la primera tanda)

```
node scripts/send-launch-emails.ts --solo=tu-correo-personal@gmail.com --confirmar
```

Manda **un** correo, a ti. Cuando llegue, revisa:

- [ ] Llegó a **bandeja de entrada**, no a spam ni a "Promociones".
- [ ] En Gmail: abre el correo → menú de los tres puntos → **Mostrar original**.
      Deben aparecer `SPF: PASS`, `DKIM: PASS` y `DMARC: PASS`. Si el SPF sale
      en `FAIL` o `NEUTRAL`, vuelve al paso 0: el DNS todavía no está bien.
- [ ] El remitente se ve como *Colbisnes*, no como una dirección cruda.
- [ ] La fecha del cuerpo dice **miércoles 12 de agosto, 10:20 a.m.**
- [ ] Los enlaces a `colbisnes.com` funcionan.
- [ ] Se ve decente en el móvil.

Repite la prueba con un Outlook o un Hotmail si tienes uno a mano. Microsoft es
bastante más quisquilloso que Gmail con los dominios nuevos.

---

## 4. Calendario de envío

La idea del calentamiento: un dominio que nunca ha mandado volumen y de repente
suelta 200 correos en tres minutos parece un dominio comprometido. Subiendo el
volumen por escalones, los filtros ven un patrón normal.

> **Si en la lista hay menos de 50 personas, sáltate el escalonado.** Con ese
> volumen no hay nada que calentar: manda todo de una en el paso del día 12 y ya.
> El escalonado empieza a tener sentido a partir de unos 80–100 apuntados.

### Lunes 10 de agosto · 10:00 a.m. — primera tanda (50)

```
node scripts/send-launch-emails.ts --limite=50 --confirmar
```

Lunes por la mañana es buena hora de apertura y te deja dos días de margen para
reaccionar si algo sale mal.

Después de correrlo, **espera unas horas y comprueba en
resend.com → Emails** que las 50 aparecen como *Delivered* y no como *Bounced*.
Si ves más de 2 o 3 rebotes, párate aquí y revisa antes de seguir.

### Martes 11 de agosto · 10:00 a.m. — segunda tanda (100)

```
node scripts/send-launch-emails.ts --limite=100 --confirmar
```

Salen los 100 siguientes. Los 50 del lunes se saltan solos.

### Miércoles 12 de agosto · 10:20 a.m. — el resto

Este es el envío que coincide con la apertura. Primero comprueba que la web ya
está abierta:

```
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://colbisnes.com
```

Debe responder `200` sin redirigir a `/coming-soon`. Si aún redirige, para y
revisa antes de mandar nada — no tiene ningún sentido invitar a 200 personas a
una puerta cerrada.

Con la web abierta, ensayo en seco primero para ver a cuántos les toca:

```
node scripts/send-launch-emails.ts
```

Y si el número cuadra:

```
node scripts/send-launch-emails.ts --confirmar
```

Sin `--limite`: van todos los que queden pendientes.

---

## 5. Sobre `COMING_SOON`: no hay que quitar nada

Esto corrige lo que habíamos asumido. **La web se abre sola el 12 de agosto a
las 10:20 a.m. No tienes que tocar ninguna variable de entorno.**

En `lib/launch.ts`, la función que decide si se muestra el candado tiene una
regla que manda sobre casi todo lo demás: pasada la hora de lanzamiento, no
bloquea. Da igual lo que diga la variable `COMING_SOON`.

El único caso en el que la variable importa es el contrario: si quieres **abrir
antes** de la fecha (por ejemplo para una prueba), pones `COMING_SOON=off`.

Aun así, el día 12 a las 10:20 comprueba con el `curl` del paso anterior que la
web responde `200`. Confiar en que el código hace lo que dice está bien;
verificarlo cuesta cinco segundos.

---

## 6. Si algo sale mal

**Todos los envíos fallan con `API key is invalid`.** Es el `.env` local, no
Resend. Pasó de verdad el 30 de julio: el `.env` seguía con la clave que se rotó
el 6 de julio tras la fuga, y encima duplicada en dos líneas. Ya está corregido
—ahora tiene la misma clave que Railway, en una sola línea— pero si vuelve a
salir, compara las dos sin llegar a imprimirlas:

```
# huella de la clave local
node -e "require('dotenv').config();console.log(require('crypto').createHash('sha256').update(process.env.RESEND_API_KEY||'').digest('hex').slice(0,10))"

# huella de la de Railway (deben coincidir)
railway variables --service colbisnes-web --environment production --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(require('crypto').createHash('sha256').update(JSON.parse(s).RESEND_API_KEY||'').digest('hex').slice(0,10)))"
```

Si no coinciden, copia la de Railway al `.env`. **Nunca pegues la clave en un
chat ni en un commit.** Y ojo: `GET /domains` devuelve 401 incluso con la clave
buena, porque es una clave de *solo envío* — ese 401 no significa que esté rota.

**Muchos rebotes (*bounced*) en el panel de Resend.** Direcciones falsas o mal
escritas de la lista. No es grave con pocas, pero una tasa alta de rebotes sí
daña la reputación del dominio. Si supera el 5%, para el escalonado y revisa la
lista a mano antes de seguir.

**Los correos caen en spam.** Casi siempre es el SPF. Revisa "Mostrar original"
en Gmail y vuelve al paso 0.

**El script se corta a mitad** (se cierra la terminal, se cae internet). No pasa
nada: lo que ya salió está anotado en el log. Vuelve a correr el mismo comando y
sigue donde se quedó.

**El script dice `La tabla "Waitlist" no existe todavía`.** No debería pasar —
la tabla se creó el 30 de julio en producción. Si sale, es que el `.env` está
apuntando a otra base de datos.

**Quieres saber cuántos han recibido ya el correo.**

```
wc -l < scripts/.launch-emails-sent.log
```

**Necesitas empezar de cero y remandar a todo el mundo.** Borrar el log es lo
que hace que el script vuelva a mandar a todos, incluidos los que ya recibieron
el correo. Piénsatelo dos veces:

```
mv scripts/.launch-emails-sent.log scripts/.launch-emails-sent.log.viejo
```

(mover, no borrar — si te arrepientes, lo devuelves a su sitio).

---

## 7. Resumen para copiar y pegar

```
# DNS: ya arreglado. Solo falta ver el verde en resend.com/domains

# Cuando quieras — ensayo, no manda nada
node scripts/send-launch-emails.ts

# Día 9 o 10 — prueba a ti mismo
node scripts/send-launch-emails.ts --solo=tu-correo@gmail.com --confirmar

# Lunes 10, 10:00 a.m.
node scripts/send-launch-emails.ts --limite=50 --confirmar

# Martes 11, 10:00 a.m.
node scripts/send-launch-emails.ts --limite=100 --confirmar

# Miércoles 12, 10:20 a.m. — comprobar que la web abrió, y mandar el resto
curl -s -o /dev/null -w "%{http_code}\n" https://colbisnes.com
node scripts/send-launch-emails.ts --confirmar
```

---

## Nota sobre los límites de Resend

Con el plan **Pro ($20/mes)** hay 50.000 correos al mes y **sin tope diario**.
El tope de 100 al día del plan gratuito ya no aplica, así que el escalonado de
este documento es solo por reputación del dominio, no por cuota.

Dicho eso, recuerda que los correos de verificación de registro salen de la
misma cuenta. El día del lanzamiento van a coincidir el envío masivo y la gente
registrándose: con 50.000 al mes hay margen de sobra, pero conviene tenerlo
presente si algún día se vuelve al plan gratuito.
