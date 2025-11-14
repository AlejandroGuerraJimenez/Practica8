# Visualizador 3D de Rutas Marítimas -- Fred Olsen Express

Este proyecto es una aplicación interactiva realizada en **JavaScript**
usando **Three.js** para visualizar las rutas marítimas de la flota de
**Fred Olsen Express** sobre un mapa 2D de las Islas Canarias.

Permite:

-   Mostrar los puertos en el mapa.
-   Seleccionar un puerto de origen haciendo clic.
-   Visualizar automáticamente las rutas disponibles desde ese puerto.
-   Seleccionar un puerto destino con un segundo clic.
-   Mostrar los **horarios reales** de los barcos que operan esa ruta.
-   Visualizar la información en una **ventana GUI dinámica** dentro de
    la interfaz.

------------------------------------------------------------------------

## Tecnologías utilizadas

-   **Three.js** (renderizado 3D y control de cámara)
-   **TrackballControls** (interacción del usuario)
-   **JavaScript (ES Modules)**
-   **CSV como fuente de datos**
-   **HTML + CSS para la GUI**

------------------------------------------------------------------------

## Estructura general del proyecto
```
    ├── index.html
    ├── index.js
    └── src/
         ├── flota_fred_olsen.csv
         ├── horario_flota.csv
         └── islands_map.png
``` 
------------------------------------------------------------------------

## Funcionamiento general

### 1. **Carga del mapa**

Se carga una imagen (`islands_map.png`) en un plano de Three.js ajustado
a las proporciones reales.

### 2. **Carga y procesamiento de datos CSV**

La aplicación lee:

-   `flota_fred_olsen.csv`: contiene coordenadas y rutas entre puertos.
-   `horario_flota.csv`: contiene horarios de barcos (día, hora salida,
    llegada, idbase...).

Los datos se limpian y agrupan para detectar:

-   Puertos únicos
-   Rutas válidas desde cada puerto
-   Identificadores de barco (`idbase`) para cada ruta

### 3. **Dibujado de puertos**

Cada puerto se representa como una **esfera azul** colocada según sus
coordenadas mapeadas al espacio 3D del plano.

### 4. **Interacción por clics**

El usuario realiza clics sobre los puertos:

#### Primer clic → Selección del puerto de **origen**

-   Se dibujan líneas rojas hacia todos los destinos posibles.
-   Los destinos válidos quedan visualmente marcados.

#### Segundo clic → Selección del **destino**

-   Se comprueba si la ruta existe.
-   Se buscan los `idbase` asociados a esa ruta.
-   Se filtran los horarios en `horario_flota.csv`.

### 5. **Visualización de horarios**

Los horarios aparecen en una **ventana lateral (GUI)**:

-   Ruta seleccionada
-   Barcos disponibles
-   Día y hora de salida
-   Hora estimada de llegada

La ventana: - No interfiere con el canvas 3D - Es desplazable - Se
adapta al tamaño de la pantalla (responsive) - Es cerrable por el
usuario

------------------------------------------------------------------------

## GUI integrada

Se añadió un panel fijo en la esquina superior derecha:

``` html
<div id="infoPanel">...</div>
```

Este panel se actualiza dinámicamente mediante la función:

``` js
showSchedules(origin, destination, idbases)
```

------------------------------------------------------------------------

## Controles

### Cámara

-   **Ratón arrastrar (click derecho):** Mover la cámara sobre el
    mapa\
-   **Rueda del ratón:** Zoom\
-   **Click izquierdo sobre puerto:** Selección

### Rutas

-   Se dibujan como líneas rojas
-   Se eliminan al seleccionar nueva ruta o al hacer clic fuera del mapa

------------------------------------------------------------------------

## Notas importantes

-   Los espacios en blanco en los CSV se limpian automáticamente
    mediante `cleanPortName()` para asegurar coincidencias válidas.
-   Three.js requiere ejecutar desde un servidor debido a políticas
    CORS.
-   La GUI se ha adaptado para evitar que se desborde en pantallas
    pequeñas.

------------------------------------------------------------------------

## Autor

Proyecto desarrollado como práctica de interfaces gráficas 3D utilizando
Three.js y datos reales de rutas marítimas.
