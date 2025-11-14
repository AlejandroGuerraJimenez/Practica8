// Las importaciones se manejan en index.html con tags <script>, pero las re-declaramos para el entorno modular

import * as THREE from "three";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

let scene, renderer;
let camera;
let camcontrols;
let objetos = [];

// --- Variables para los datos de los CSV ---
let flotaData = {}; // Coordenadas de los puertos
let routesData = {}; // Mapeo Origen -> [Destinos]
let schedulesRawData = []; // Horarios crudos (de horario_flota (1).csv)
let flotaRoutesLookup = {}; // Mapeo (Origen, Destino) -> [idbase, ...]
let puertosMeshes = []; // Esferas de los puertos
let routeLines = []; // Líneas de ruta dibujadas

// --- Lógica de Interacción ---
let raycaster = new THREE.Raycaster(); // Para detectar clics en 3D
let mouse = new THREE.Vector2(); // Coordenadas del ratón
let selectedOriginPort = null; // Puerto clicado en el primer paso

// --- Latitud y longitud de los extremos del mapa (CORRECCIÓN DE ESCALADO) ---
let minlon = -18.455; // Oeste (Ajustado: menos rango geográfico)
let maxlon = -13.307; // Este (Ajustado: menos rango geográfico)
let minlat = 27.522; // Sur (Sin cambios)
let maxlat = 29.458; // Norte (Sin cambios)

let mapa,
  mapsx,
  mapsy,
  scale = 10; // Escala mantenida
let t0;
let txt_logo = new THREE.TextureLoader().load("src/Fred_olsen.png");

init();
animationLoop();

// -----------------------------------
// --- FUNCIÓN DE LIMPIEZA ROBUSTA ---
// -----------------------------------

// Función robusta para limpiar el nombre de un puerto de cualquier tipo de espacio
function cleanPortName(name) {
  if (!name) return ""; // Reemplaza cualquier carácter de espacio en blanco (\s+ incluye tabs, saltos de línea y no-breaking spaces) // por un único espacio, luego recorta los espacios en los extremos.
  return String(name).replace(/\s+/g, " ").trim();
}

// ---------------------------------------
// --- INICIALIZACIÓN Y CARGA DE DATOS ---
// ---------------------------------------

function init() {
  // Inicialización de la Escena, Cámara y Renderizador
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    20,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 70);

  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement); // Cargar datos y mapa

  cargarCSVs()
    .then(() => {
      // Cargar Textura (Mapa de las Islas Canarias)
      const tx1 = new THREE.TextureLoader().load(
        "src/islands_map.png",
        function (texture) {
          // Crea plano, ajustando su tamaño al de la textura
          const txaspectRatio = texture.image.width / texture.image.height;
          mapsy = scale;
          mapsx = mapsy * txaspectRatio;
          Plano(0, 0, 0, mapsx, mapsy);
          mapa.material.map = texture;
          mapa.material.needsUpdate = true; // Una vez cargado el mapa, colocar los puertos

          cargarPuertosEnMapa();
        }
      );
    })
    .catch((error) => console.error("Error al cargar los datos CSV:", error)); // TrackballControls

  camcontrols = new TrackballControls(camera, renderer.domElement);
  camcontrols.noRotate = true; // Desactivar la rotación del plano

  t0 = new Date(); // Añadir Event Listener para el clic

  window.addEventListener("mousedown", onMouseDown, false);
}

// Helper para parsear CSV simple con delimitador ";"
function parseCSV(text) {
  const lines = text.trim().split("\r\n");
  const headers = lines[0].split(";").map((h) => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    if (values.length === headers.length) {
      let item = {};
      for (let j = 0; j < headers.length; j++) {
        item[headers[j]] = values[j].trim();
      }
      data.push(item);
    }
  }
  return data;
}

async function cargarCSVs() {
  // Helper para cargar y parsear CSV
  const loadCSV = (url) => {
    return new Promise((resolve, reject) => {
      new THREE.FileLoader().load(
        url,
        (data) => {
          resolve(parseCSV(data));
        },
        undefined,
        reject
      );
    });
  }; // Carga de flota (puertos con coordenadas y rutas)

  const flotaRaw = await loadCSV("src/flota_fred_olsen.csv"); // Cargar la lista de barcos que forman parte de la flota de Fred Olsen
  const horariosRaw = await loadCSV("src/horario_flota.csv"); // Cargar horarios de la flota de Fred Olsen

  flotaData = procesarFlota(flotaRaw);
  schedulesRawData = horariosRaw;
}

// Agrupa los datos de flota y crea la tabla de mapeo Origen-Destino -> [idbase]
function procesarFlota(flota) {
  const puertos = {};
  routesData = {}; // Asegurar que esté vacío
  flotaRoutesLookup = {}; // Asegurar que esté vacío

  flota.forEach((item) => {
    // APLICAMOS CLEANPORTNAME PARA ALMACENAR UNA CLAVE PERFECTA
    const nombre = cleanPortName(item.nombre_puerto_origen);
    const destino = cleanPortName(item.nombre_puertodestino); // Aseguramos que id sea tratado como string para la clave
    const id = String(item.idbase); // 1. Guardar coordenadas para puertos únicos (Usando el nombre)

    if (!puertos[nombre]) {
      puertos[nombre] = {
        latitud: parseFloat(item.latitud),
        longitud: parseFloat(item.longitud),
      };
    } // 2. Guardar rutas únicas (Origen -> Destino)
    if (!routesData[nombre]) {
      routesData[nombre] = new Set();
    }
    routesData[nombre].add(destino); // 3. Guardar mapeo (Origen, Destino) -> [idbase, ...] para horarios

    const key = `${nombre}_${destino}`;
    if (!flotaRoutesLookup[key]) {
      flotaRoutesLookup[key] = new Set();
    }
    flotaRoutesLookup[key].add(id);
  }); // Convertir Sets a Arrays para fácil acceso
  for (const origen in routesData) {
    routesData[origen] = Array.from(routesData[origen]);
  }
  for (const key in flotaRoutesLookup) {
    flotaRoutesLookup[key] = Array.from(flotaRoutesLookup[key]);
  } // OPCIONAL: Depuración - Muestra las claves almacenadas para verificar

  console.log("CLAVES DE RUTA ALMACENADAS:", Object.keys(flotaRoutesLookup));

  return puertos;
}

// -----------------------------------
// --- MUESTREO DEL MAPA Y PUERTOS ---
// -----------------------------------

function cargarPuertosEnMapa() {
  // Limpiar puertos antiguos si los hubiera
  puertosMeshes.forEach((mesh) => scene.remove(mesh));
  puertosMeshes = []; // Iterar sobre los puertos únicos

  for (const nombrePuerto in flotaData) {
    const data = flotaData[nombrePuerto]; // Mapeo Longitud (X)

    let mlon = Map2RangeDirecto(
      data.longitud,
      minlon,
      maxlon,
      -mapsx / 2,
      mapsx / 2
    ); // Mapeo Latitud (Y)

    let mlat = Map2Range(data.latitud, minlat, maxlat, -mapsy / 2, mapsy / 2); // Crear objeto 3D para el puerto

    let mesh = Esfera(mlon, mlat, 0.075, 0.2, 32, 32, nombrePuerto, txt_logo); //  Esfera(px, py, pz, radio, nx, ny, col, name, texture)

    puertosMeshes.push(mesh);
  }
}

// -----------------------------
// --- LÓGICA DE INTERACCIÓN ---
// -----------------------------

function onMouseDown(event) {
  // Calcular la posición del ratón en coordenadas normalizadas (-1 a +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; // Actualizar el Raycaster

  raycaster.setFromCamera(mouse, camera); // Calcular objetos que intersectan con el rayo (solo esferas de puertos)

  const intersects = raycaster.intersectObjects(puertosMeshes);

  if (intersects.length > 0) {
    // Si se intersecta un puerto
    const clickedPortName = intersects[0].object.name; // --- Lógica de Doble Clic (Destino) ---

    if (selectedOriginPort && selectedOriginPort !== clickedPortName) {
      // Comprobar si el puerto clicado es un destino válido del origen actual
      const destinations = routesData[selectedOriginPort];
      if (destinations && destinations.includes(clickedPortName)) {
        // ¡Segundo clic en un puerto destino válido!
        // APLICAMOS CLEANPORTNAME PARA BUSCAR UNA CLAVE PERFECTA
        const cleanedOrigin = cleanPortName(selectedOriginPort);
        const cleanedDestination = cleanPortName(clickedPortName);
        const routeKey = `${cleanedOrigin}_${cleanedDestination}`; // DEPURA ESTO:
        console.log("CLAVE GENERADA:", selectedOriginPort, clickedPortName);
        console.log("CLAVE BUSCADA (LIMPIA):", routeKey);

        const idbases = flotaRoutesLookup[routeKey]; // Obtener los idbases

        if (idbases) {
          showSchedules(selectedOriginPort, clickedPortName, idbases);
        } else {
          console.error("Error: No se encontró idbase para la ruta:", routeKey);
          alert(
            "Error: No se encontró la ruta en la tabla de mapeo de barcos. Revisa la consola (F12) para ver la clave de búsqueda."
          );
        } // Limpiar selección y rutas para volver al estado inicial
        clearRouteLines();
        selectedOriginPort = null;
        return;
      }
    } // --- Fin Lógica de Doble Clic --- // Si no fue un clic en un destino válido, se trata como un nuevo Origen
    handlePortClick(clickedPortName);
  } else {
    // Si se hace clic en el mapa o el fondo, borrar las rutas y la selección
    clearRouteLines();
    selectedOriginPort = null;
  }
}

// Maneja el primer clic en un puerto (Origen)
function handlePortClick(originPortName) {
  // 1. Limpiar líneas antiguas
  clearRouteLines(); // 2. Establecer el puerto seleccionado

  selectedOriginPort = originPortName;

  console.log("Puerto de Origen seleccionado:", originPortName);
  console.log("Ahora, haz clic en uno de los destinos marcados en verde."); // 3. Obtener los destinos para el puerto clicado

  const destinations = routesData[originPortName];

  if (destinations && destinations.length > 0) {
    const originCoords = getPortMappedCoords(originPortName); // 4. Dibujar una línea a cada destino

    destinations.forEach((destinationName) => {
      DrawRouteLine(originPortName, destinationName, originCoords);
    });
  } else {
    console.log("No hay rutas salientes definidas desde:", originPortName);
  }
}

// Muestra los horarios en la consola
function showSchedules(originPort, destinationPort, idbases) {
  // Filtrar horarios por los idbase encontrados
  const filteredSchedules = schedulesRawData.filter((schedule) =>
    idbases.includes(String(schedule.idbase))
  );

  const panel = document.getElementById("infoPanel");
  const content = document.getElementById("infoContent");

  if (filteredSchedules.length === 0) {
    content.innerHTML = `
          <b>Ruta:</b> ${originPort} → ${destinationPort}<br><br>
          <span style="color:red;">No se encontraron horarios para esta ruta.</span>
      `;
    panel.style.display = "block";
    return;
  }

  // Crear HTML para la ventana
  let html = `<b>Ruta:</b> ${originPort} → ${destinationPort}<br><br>`;
  html += `<b>Barcos disponibles:</b> ${idbases.join(", ")}<br><br>`;
  html += `<b>Horarios:</b><br><br>`;

  filteredSchedules.forEach((item) => {
    html += `
          <div style="margin-bottom:10px; padding:5px; border-bottom:1px solid #ddd;">
              <b>Barco:</b> ${item.nombre_barco}<br>
              <b>Día:</b> ${item.Dia}<br>
              <b>Salida:</b> ${item.hora_salida}<br>
              <b>Llegada:</b> ${item.hora_llegada}<br>
          </div>
      `;
  });

  // Mostrar GUI
  content.innerHTML = html;
  panel.style.display = "block";
}

// Limpia todas las líneas de ruta de la escena
function clearRouteLines() {
  routeLines.forEach((line) => scene.remove(line));
  routeLines = [];
}

// Dibuja una línea entre dos puertos
function DrawRouteLine(originName, destinationName, originMappedCoords) {
  const destCoords = getPortMappedCoords(destinationName);

  if (!destCoords) {
    console.error("Coordenadas de destino no encontradas:", destinationName);
    return;
  } // 1. Crear geometría de la línea

  const points = [];
  points.push(
    new THREE.Vector3(
      originMappedCoords.mlon,
      originMappedCoords.mlat,
      originMappedCoords.mz + 0.01 // Z ligeramente por encima para visibilidad
    )
  );
  points.push(
    new THREE.Vector3(destCoords.mlon, destCoords.mlat, destCoords.mz + 0.01)
  );

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xff0000, // Color verde para las rutas
    linewidth: 2,
  }); // 2. Crear y añadir la línea a la escena

  const line = new THREE.Line(geometry, material);
  line.name = `Route_${originName}_${destinationName}`;
  scene.add(line);
  routeLines.push(line);

  console.log(`Ruta dibujada: ${originName} -> ${destinationName}`);
}

// Convierte el nombre del puerto a coordenadas 3D de Three.js
function getPortMappedCoords(portName) {
  const data = flotaData[portName];
  if (!data) return null; // Mapeo Longitud (X)

  let mlon = Map2RangeDirecto(
    data.longitud,
    minlon,
    maxlon,
    -mapsx / 2,
    mapsx / 2
  ); // Mapeo Latitud (Y)

  let mlat = Map2Range(data.latitud, minlat, maxlat, -mapsy / 2, mapsy / 2);
  let mz = 0.005; // La posición Z del plano

  return { mlon, mlat, mz };
}

// ----------------------------------------
// --- FUNCIONES AUXILIARES DE THREE.JS ---
// ----------------------------------------

// Mapeo INVERSO: Para Latitud (Y). Mapea el valor más alto (Norte) a la parte superior (Y más alto).
function Map2Range(val, vmin, vmax, dmin, dmax) {
  // Normaliza valor en el rango de partida, t=0 en vmin, t=1 en vmax
  let t = 1 - (vmax - val) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

// Mapeo DIRECTO: CLAVE para Longitud (X). Mapea el valor más alto (Este/menos negativo) a la derecha (X más alto).
function Map2RangeDirecto(val, vmin, vmax, dmin, dmax) {
  // Normaliza valor en el rango de partida, t=0 en vmin, t=1 en vmax
  let t = (val - vmin) / (vmax - vmin);
  return dmin + t * (dmax - dmin);
}

function Esfera(px, py, pz, radio, nx, ny, name, texture) {
  // 1. Crear la esfera (solo para el cuerpo del puerto)
  let geometry = new THREE.SphereGeometry(radio, nx, ny);
  let material = new THREE.MeshBasicMaterial({ color: 0xffffff }); // Puerto blanco
  let mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  mesh.name = name;
  scene.add(mesh);

  // 2. Crear el Sprite para el Logo (si se proporciona la textura)
  if (texture && texture.isTexture) {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    // Ajustar el tamaño del sprite para que sea visible (ej. 1x1)
    sprite.scale.set(1, 1, 1);
    // Posicionarlo ligeramente por encima de la esfera/mapa (Z + 0.5)
    sprite.position.set(px, py, pz + 0.5);
    sprite.name = `${name}_Logo`;
    scene.add(sprite);

    // Opcional: Si quieres que el Raycaster solo detecte el sprite:
    // return sprite;
  }

  puertosMeshes.push(mesh);
  return mesh;
}

function Plano(px, py, pz, sx, sy) {
  let geometry = new THREE.PlaneGeometry(sx, sy);
  let material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  let mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  scene.add(mesh);
  mapa = mesh;
}

// Bucle de animación
function animationLoop() {
  requestAnimationFrame(animationLoop); // TrackballControls

  let t1 = new Date();
  let secs = (t1 - t0) / 1000;
  camcontrols.update(1 * secs);

  renderer.render(scene, camera);
}
