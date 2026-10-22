# Icecast

[Icecast](https://icecast.org) es el servidor de difusión libre detrás de
muchas radios web: unas fuentes (un codificador, BUTT, Mixxx, Liquidsoap,
ffmpeg…) envían el audio a sus puntos de montaje, y los oyentes los escuchan.
Esta integración lleva sus puntos de montaje a Gladys: si un flujo está en
antena, el número de oyentes, la canción actual, la tasa de bits, y escenas
que reaccionan a un flujo que empieza o se detiene, a una nueva canción o a un
umbral de audiencia.

Icecast puede funcionar en su casa o en un servidor alquilado: la integración
funciona con ambos (la insignia del dispositivo indica «local» o «nube» según
la dirección). ¿Usa AzuraCast? Tiene
[su propia integración](https://github.com/guim31/gladys-azuracast), que conoce
sus emisoras, sus directos y su AutoDJ.

Probada con un Icecast 2.4.4 real en Docker, con dos fuentes enviadas por
ffmpeg (MP3 y Ogg Vorbis), títulos cambiados desde la administración, oyentes
simulados con curl, y fuentes detenidas y vueltas a lanzar. Sus comentarios
son bienvenidos en [las issues](https://github.com/guim31/gladys-icecast/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor Icecast 2.4 o posterior accesible desde Gladys (puerto 8000 por
  defecto).
- Su página de estado abierta (`/status-json.xsl`, pública por defecto). No se
  necesita ninguna contraseña.

## Primeros pasos

### 1. Encontrar la dirección de Icecast

Es la dirección de su página web, con el puerto, por ejemplo
`http://192.168.1.2:8000` o `https://radio.example.org`. También sirve una URL
copiada del navegador (la página de estado `…/status.xsl`, un flujo
`…/radio.mp3`): la integración conserva su comienzo.

### 2. Configurar la integración

En Gladys, abra la integración y rellene:

- **Dirección de Icecast**.
- **Intervalo de actualización**: 15 segundos por defecto. Una petición ligera
  para todos los puntos de montaje cada vez.
- **Idioma de los nombres**: el idioma de los nombres de las funciones y de los
  resultados de escena.

Después use **Probar la conexión**: lee Icecast y enumera lo que reproduce cada
punto de montaje en antena.

### 3. Añadir los dispositivos

Abra la pestaña **Descubrir**: cada punto de montaje en antena es un
dispositivo, con el nombre del flujo y de su punto de montaje
(`Mi Radio (/radio.mp3)`). Añada los que desee. Icecast solo lista un punto de
montaje mientras una fuente emite en él: lance primero su flujo. La integración
lo recuerda después, así que un flujo detenido sigue siendo un dispositivo,
fuera de antena.

## Los dispositivos

| Función                | Lo que indica                                                  |
| ---------------------- | -------------------------------------------------------------- |
| En antena              | Sí mientras una fuente emite en el punto de montaje            |
| Oyentes                | Personas escuchando ahora                                      |
| Pico de oyentes de hoy | El máximo de oyentes desde medianoche                          |
| Canción actual         | «Artista – Título» enviado por la fuente («—» fuera de antena) |
| Tasa de bits           | En kb/s, cuando la fuente la indica (flujos Ogg y Opus)        |
| En antena desde hace   | Minutos desde el inicio del flujo                              |

Un flujo se detiene tras un minuto sin su punto de montaje (o sin respuesta de
Icecast): un corte breve de la fuente no cambia nada. Las fuentes MP3 envían un
solo texto «Artista - Título»: la integración lo divide en el primer « - ».

## Panel

El widget **Flujos Icecast** muestra, sin ajuste, todos los puntos de montaje:
el total de oyentes, cuántos flujos están en antena, una fila por punto de
montaje con sus oyentes, y el título del primer flujo que tenga uno. Elija un
punto de montaje en los ajustes del widget para verlo en detalle: su título y
su artista, sus oyentes y el pico del día, su tasa de bits y cuánto tiempo
lleva en antena. El botón **Escuchar** abre el flujo cuando la dirección de
Icecast es https://.

## Escenas

### Disparadores

Cada disparador puede limitarse a un punto de montaje (vacío: cualquiera), y da
el nombre del flujo.

- **Empieza un flujo**: una fuente se conecta y sale en antena, con la canción
  actual. También se dispara para un nuevo punto de montaje en un servidor ya
  vigilado.
- **Se detiene un flujo**: el punto de montaje lleva un minuto sin emitir (o
  Icecast no responde), con la duración del flujo en minutos.
- **Suena una nueva canción**: la fuente envía otro título, con la canción, el
  artista y el título.
- **Los oyentes alcanzan un umbral**: elija 1, 5, 10, 25, 50, 100, 250, 500 o
  1000; se dispara una vez al día cuando los oyentes del punto de montaje lo
  alcanzan. 1 significa «alguien está escuchando».

La integración guarda lo que ha visto: un reinicio de Gladys no anuncia dos
veces un flujo o un umbral, y una canción empezada mientras tanto se anuncia
una vez.

### Acciones

- **Canción actual**: lee un punto de montaje para las siguientes acciones: en
  antena o no, canción, artista, título, oyentes, pico del día, tasa de bits,
  minutos en antena, y una frase lista («Mi Radio (/radio.mp3): En antena,
  Artista – Título, 12 oyente(s)»).

### Ideas de escenas

- **Luz «On air»**: «Empieza un flujo» en el punto de montaje `/live` pone en
  rojo la lámpara del estudio; «Se detiene un flujo» la apaga y le envía la
  duración.
- **La canción en la tele**: «Suena una nueva canción» muestra la canción en la
  pantalla del salón, o la anuncia por el altavoz.
- **Audiencia**: «Los oyentes alcanzan un umbral» (10) le envía una
  notificación; una escena matinal dice la frase de «Canción actual».

## Solución de problemas

- **Icecast no responde**: compruebe la dirección y el puerto desde la máquina
  de Gladys.
- **No hay ningún estado de Icecast 2.4 en esta dirección**: la dirección lleva
  a otro servicio, o a un Icecast anterior a 2.4 (sin `/status-json.xsl`).
- **La página de estado pide una contraseña**: un proxy inverso la protege;
  abra `/status-json.xsl` a la red de Gladys.
- **La dirección redirige**: introduzca la dirección https://.
- **Ningún dispositivo en Descubrir**: ninguna fuente emite ahora; lance una y
  pulse de nuevo **Buscar**.

## Límites

- Un servidor Icecast por integración; los puntos de montaje ocultos
  (`<hidden>1</hidden>`) no aparecen en la página de estado pública.
- Icecast se lee al intervalo elegido (15 segundos por defecto), no en tiempo
  real: una canción más corta que el intervalo puede pasar desapercibida.
- El título es el que envía la fuente: algunos codificadores no envían ninguno,
  o un nombre de archivo.
- El pico del día lo mide la integración en cada lectura.
- Solo lectura: la integración no lanza, detiene ni mueve ninguna fuente.
- Sin relación con el proyecto Icecast ni con la fundación Xiph.Org.
