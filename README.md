# Ocho Pistas

Secuenciador musical de 8 pistas que funciona en el navegador, sin instalar nada.

**▶ Pruébalo:** https://malbot042.github.io/ocho-pistas/

## Qué hace

- **Secuenciador de 8 pistas** de inicio: 4 de batería (bombo, caja, charles, palmas) y 4 melódicas (bajo, piano, melodía, pad). Puedes **duplicar pistas** (hasta 16) para doblar una voz en otra octava y **transponer** cada pista por octavas.
- **Patrones A–P** (empiezas con 4; crea, duplica o elimina) y una **cadena de canción** para ordenarlos; modo *Patrón* o *Canción*.
- **Compás por patrón**: 2/4, 3/4, 4/4, 6/4 u 8/4 (4 pasos de semicorchea por negra: 8, 12, 16, 24 o 32 pasos).
- **Editor de notas por pasos** (sin pentagrama): rejilla de notas con teclado vertical, duración por nota y fuerza.
- **Mezclador**: volumen, panorama, reverb, silencio (M), solo (S), vúmetros y máster con limitador.
- **Modo claro y oscuro** (respeta la preferencia del sistema y recuerda tu elección).
- Sonidos sintetizados con Web Audio API: no descarga muestras.

## Guardar y compartir

- La canción se **guarda sola en tu navegador** (localStorage) cada vez que cambias algo.
- **Archivo → Descargar canción (.json)** genera un archivo que puedes enviar a quien quieras.
- **Archivo → Abrir canción (.json)…** la carga de nuevo. También puedes **arrastrar el .json** sobre la página.

El archivo JSON tiene este formato (versión 1):

```json
{
  "format": "ocho-pistas",
  "version": 1,
  "name": "Mi canción",
  "bpm": 120,
  "swing": 10,
  "masterVol": 85,
  "tracks": [{ "name": "Bombo", "voice": "kick", "color": "#fb923c", "vol": 80, "pan": 0, "rev": 5, "oct": 3, "trans": 0, "mute": false, "solo": false }],
  "patterns": { "A": { "beats": 4, "lanes": [{ "hits": [100, 0, 0, 0] }, { "notes": [{ "m": 36, "s": 0, "l": 2, "v": 110 }] }] } },
  "song": ["A", "A", "B"]
}
```

- `tracks`: de 1 a 16 pistas. `trans` es la transposición en octavas (−3 a 3) que se aplica al sonar; `oct` sólo indica qué octava se ve en el editor de notas.
- `patterns`: claves de `A` a `P` (al menos una). `beats` es el número de negras del compás: 2, 3, 4, 6 u 8 (por defecto 4). Cada patrón tiene un carril (`lanes`) por pista.
- `hits`: un valor por paso (`beats` × 4 pasos), intensidad 0–127 (0 = sin golpe) para pistas de batería.
- `notes`: `m` nota MIDI escrita (sin transponer), `s` paso inicial, `l` duración en pasos, `v` intensidad 1–127.

## Atajos

| Tecla | Acción |
| --- | --- |
| Espacio | Reproducir / parar |
| Mayús + clic en un golpe | Alternar golpe suave / fuerte |

## Desarrollo

Es HTML, CSS y JavaScript sin dependencias ni paso de compilación. Para probarlo en local:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Estructura:

```
index.html      interfaz y cabecera
styles.css      estilos y temas claro/oscuro
js/store.js     modelo de canción, guardado e importar/exportar JSON
js/audio.js     instrumentos y programador de Web Audio
js/main.js      vistas, eventos y transporte
```

## Licencia

MIT
