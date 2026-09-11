import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  demarrerMusique, arreterMusique, setTensionMusique, basculerSon,
  setVitesseUfo, demarrerZap, arreterZap, setZapProgression, mugir, majTanksAudio,
  canon, explosion, jouerMariachi, reprendreMusique, taireDecor,
} from './audio.js';

// ---------------------------------------------------------------- constantes
const CELL         = 1.0;   // taille d'une facette -> densité lowpoly constante
const MARGE        = 6;     // débord du sol au-delà du cadre visible (fond perdu)
const HILL_HEIGHT  = 1.1;   // amplitude du relief
const FLY_HEIGHT   = 4.6;   // hauteur de vol au-dessus du sol
const LERP_FACTOR  = 0.045; // retard de suivi (plus petit = plus mou)
const FRUSTUM      = 18;    // "zoom" de la caméra orthographique

const COW_DENSITE  = 260;   // 1 vache par ~260 unités² de zone visible
const COW_MARGE_X  = 0.92;  // marge horizontale en coordonnées écran (-1..1)
const COW_MARGE_Y  = 0.84;  // marge verticale, plus stricte : une vache perchée
                            // sur une bosse remonte de quelques pixels à l'écran
const COW_TAILLE   = 1.8;   // longueur d'une vache (unités monde)

const ASPI_MIN     = 0.50;  // vitesse d'aspiration la plus lente (progression/s)
const ASPI_MAX     = 1.40;  // vitesse d'aspiration la plus rapide
const COW_SCL_MIN  = 0.70;  // petite vache : légère, vite enlevée
const COW_SCL_MAX  = 1.45;  // grosse vache : lourde, elle résiste
const RETOMBEE     = 0.9;   // vitesse de redescente quand le faisceau s'éteint
const VIT_RUPTURE  = 6.0;   // vitesse de l'OVNI (u/s) au-delà de laquelle l'aspiration cale
const FREIN_MIN    = 0.08;  // part d'aspiration conservée à pleine vitesse

const TANK_TAILLE  = 4.6;   // longueur d'un char (unités monde)
const TANK_DENSITE = 2600;  // 1 char par ~2600 unités² de plaine
const TANK_VIT     = 3.2;   // vitesse d'avance (unités/s)
const TANK_ROT     = 1.1;   // vitesse de virage du châssis (rad/s)
const TANK_LARG    = 1.2;   // demi-largeur d'encombrement du châssis
const TANK_DETECT  = 7.0;   // distance de détection des obstacles devant le char
const EVIT_FORCE   = 1.3;   // vigueur de la manoeuvre de contournement (rad)
const TANK_PORTEE  = 16.0;  // distance de tir visée : au-delà, il avance
const MISSILE_LONG = 1.0;   // longueur du missile (unités monde)
const MISSILE_VIT  = 7.0;   // vitesse de croisière (u/s) — sous celle de l'OVNI
const MISSILE_VIRE = 2.0;   // capacité de correction de trajectoire (rad/s)
const MISSILE_VIE  = 20.0;  // sécurité anti-fuite : durée de vie maximale (s)
const PERTE_ANGLE  = 0.8;   // au-delà de cet écart de cap, le missile décroche
const PERTE_DUREE  = 0.3;   // temps passé au-delà avant perte définitive (s)
const PERTE_SECHE  = 1.7;   // écart au-delà duquel le verrouillage saute net
const COLL_MISSILE = 0.5;   // rayon de collision entre deux missiles
const EXPL_DUREE   = 0.55;  // durée d'une explosion de missile (s)
const EXPL_TAILLE  = 3.0;   // envergure d'une explosion de missile
const EXPL_DUREE_G = 1.6;   // durée de l'explosion de la soucoupe
const EXPL_TAILLE_G = 14.0; // envergure de l'explosion de la soucoupe
const TIR_CADENCE  = 2.0;   // délai entre deux tirs d'un même char (s)
const TIR_ECART    = 0.35;  // écart de pointage toléré au moment du tir (rad)
const DEGAT_DUREE  = 1.4;   // durée d'encaissement / invulnérabilité (s)
const TEMPS_REF    = 120;   // au-delà, le bonus de rapidité est épuisé (s)
const MALUS_TOUCHE = 0.08;  // pénalité de multiplicateur par missile encaissé
const MALUS_MAX    = 0.6;   // pénalité cumulée maximale
const ETOILES_MAX  = 5;     // niveau de recherche maximal
const UFO_VIE_MAX  = 3;     // nombre de missiles encaissés avant destruction
const VICT_MANOEUVRE = 0.9;  // durée de la petite manoeuvre avant décollage (s)
const VICT_MONTEE    = 1.9;  // durée de la ruée vers la caméra (s)
const SECOUSSE_DUR = 0.9;   // durée de la secousse de caméra (s)
const SECOUSSE_AMP = 1.6;   // amplitude de la secousse (unités monde)

const TRACE_PAS    = 0.32;  // distance entre deux points de traînée
const TRACE_PTS    = 90;    // longueur max d'une traînée (points)
const TRACE_DUREE  = 7.0;   // durée d'effacement d'une trace (s)
const TRACE_LARG   = 0.34;  // largeur d'une chenille marquée au sol

const TOURELLE_VIT = 1.6;   // vitesse de rotation de la tourelle (rad/s)
const CANON_MIN    = -0.09; // dépression du canon (rad)
const CANON_MAX    = 0.95;  // élévation max du canon (rad)

const RAYON_CONE   = 1.5;   // rayon du halo au niveau du sol
const HALO_MIN     = 0.18;  // durée mini d'affichage sur un clic bref (s)

const SPIN_IDLE    = 0.8;   // rotation propre au repos (rad/s)
const SPIN_MAX     = 9.0;   // rotation max quand le curseur file (rad/s)
const SPIN_GAIN    = 0.008; // sensibilité à la vitesse du curseur (px/s -> rad/s)
const SPIN_DECAY   = 2.2;   // vitesse de retour au régime de repos

// ------------------------------------------------------------- écran de chargement
// Chaque poste s'annonce quand il est prêt ; la partie ne démarre qu'une fois
// tout chargé ET une première image rendue, pour éviter le à-coup de compilation
// des shaders au premier mouvement.
const POSTES = [
  ['polices', 'Polices de caractères'],
  ['lumieres', 'Lumières et ombres'],
  ['terrain', 'Génération de la plaine'],
  ['ufo', 'Modèle 3D — soucoupe'],
  ['vaches', 'Modèle 3D — troupeau'],
  ['chars', 'Modèle 3D — blindés'],
  ['missiles', 'Modèle 3D — missiles'],
  ['explosions', 'Effets — explosions'],
  ['rendu', 'Compilation du rendu'],
];
const postesFaits = new Set();
const elArc = document.getElementById('chargement-arc');
const elPourcent = document.getElementById('chargement-pourcent');
const elMessage = document.getElementById('chargement-message');
const PERIMETRE = 2 * Math.PI * 52;

let demarre = false;
let framesChauffe = 0;

function pret(cle) {
  if (postesFaits.has(cle)) return;
  postesFaits.add(cle);

  const part = postesFaits.size / POSTES.length;
  elArc.setAttribute('stroke-dashoffset', String(PERIMETRE * (1 - part)));
  elPourcent.textContent = `${Math.round(part * 100)}%`;

  const suivant = POSTES.find(([c]) => !postesFaits.has(c));
  elMessage.textContent = suivant ? suivant[1] : 'Prêt';
}

const assetsCharges = () => POSTES.every(([c]) => c === 'rendu' || postesFaits.has(c));

// Phase de chauffe : la boucle d'animation tourne déjà, mais elle se contente de
// rendre la scène. On ne passe en jeu qu'une fois les assets là ET deux images
// réellement produites — la compilation des shaders est donc derrière nous.
function chauffer() {
  if (framesChauffe === 0) renderer.compile(scene, camera);
  renderer.render(scene, camera);
  framesChauffe++;
  if (assetsCharges() && framesChauffe >= 2) afficherAccueil();
}

// Tout est prêt : on passe la main au joueur, la scène tourne déjà derrière.
let accueilAffiche = false;
function afficherAccueil() {
  if (accueilAffiche) return;
  accueilAffiche = true;
  pret('rendu');

  const ecran = document.getElementById('chargement');
  ecran.classList.add('fini');
  setTimeout(() => { ecran.hidden = true; }, 500);

  const accueil = document.getElementById('accueil');
  accueil.hidden = false;

  // Le banjo tourne déjà sous l'écran-titre, au tempo le plus lent : aucun char
  // n'est encore en vue. Il enchaînera sans coupure sur la partie.
  setTensionMusique(0);
  demarrerMusique();

  document.getElementById('demarrer').addEventListener('click', lancerPartie, { once: true });
}

function lancerPartie() {
  demarrerMusique();   // déjà lancé sous l'écran-titre ; cet appel ne fait que
                       // réveiller le contexte si le navigateur l'avait suspendu
  const accueil = document.getElementById('accueil');
  accueil.classList.add('parti');
  setTimeout(() => { accueil.hidden = true; }, 450);
  clock.start();        // chrono remis à zéro : ni chargement ni accueil comptés
  demarre = true;
}

document.fonts.ready.then(() => pret('polices'));

// Filet de sécurité : un asset qui ne répond pas ne doit pas bloquer la partie.
// Onglet en arrière-plan, les frames sont suspendues : ce n'est pas un incident,
// on repousse l'échéance plutôt que de crier au loup.
function surveillerChargement() {
  if (demarre) return;
  if (document.hidden || !assetsCharges()) {
    if (!document.hidden) {
      const manquants = POSTES.filter(([c]) => !postesFaits.has(c)).map(([c]) => c);
      console.warn('Chargement incomplet, démarrage forcé :', manquants.join(', '));
      for (const [c] of POSTES) pret(c);
      return;
    }
  }
  setTimeout(surveillerChargement, 4000);
}
setTimeout(surveillerChargement, 12000);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe8d8);

// --------------------------------------------------- caméra isométrique vraie
// Orthographique + angles isométriques (45° en azimut, ~35.264° en élévation).
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const ISO_DIR = new THREE.Vector3(1, Math.SQRT2, 1).normalize(); // atan(1/√2) ≈ 35.264°
camera.position.copy(ISO_DIR).multiplyScalar(120);
camera.lookAt(0, 0, 0);

// -------------------------------------------------------- lumière d'ambiance
// Dominante ambiante (hemisphere) + une directionnelle douce pour les ombres.
scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9c7a, 1.15));
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

const sun = new THREE.DirectionalLight(0xffffff, 0.45);
sun.position.set(-12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0008;
scene.add(sun);
pret('lumieres');

// --------------------------------------------------------- relief de la plaine
function hauteur(x, z) {
  return (
    Math.sin(x * 0.25) * Math.cos(z * 0.22) * 0.6 +
    Math.sin(x * 0.11 + z * 0.17) * 0.4 +
    Math.cos(x * 0.43 + 1.7) * Math.sin(z * 0.39) * 0.18
  ) * HILL_HEIGHT;
}

// Étendue monde nécessaire pour que le sol déborde du viewport (fond perdu).
// Sur le plan Y=0, l'axe vertical de l'écran est étiré de 1/sin(35.264°) = √3.
function etendueVisible() {
  const a = innerWidth / innerHeight;
  return FRUSTUM * (a + Math.sqrt(3)) + MARGE;
}

// ------------------------------------------------------- sol lowpoly (rebuild)
const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const ground = new THREE.Mesh(new THREE.BufferGeometry(), groundMat);
ground.receiveShadow = true;
scene.add(ground);

const decorGroup = new THREE.Group();
scene.add(decorGroup);

const vachesGroup = new THREE.Group();
scene.add(vachesGroup);

// Empreintes au sol du décor (arbres / rochers), pour éviter les collisions.
const obstacles = [];        // { x, z, r } — décor fixe
const obstaclesTanks = [];   // emplacements initiaux des chars (placement des vaches)

function rand(seed) { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); }

let demiEtendue = 0;

function construireSol() {
  const half = etendueVisible();
  const size = half * 2;
  const seg = Math.max(8, Math.round(size / CELL));

  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2); // passe en XZ, Y = up

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hauteur(pos.getX(i), pos.getZ(i)));
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');

  // Géométrie non indexée => une normale par face => rendu facetté lowpoly.
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();

  // Teinte verte légèrement variée par triangle, pour casser l'aplat.
  const p = flat.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const base = new THREE.Color();
  for (let t = 0; t < p.count; t += 3) {
    const y = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    base.setHSL(
      0.30 - y * 0.012,
      0.34 + Math.abs(y) * 0.05,
      0.38 + y * 0.055 + (t % 9) * 0.004
    );
    for (let k = 0; k < 3; k++) base.toArray(colors, (t + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  ground.geometry.dispose();
  ground.geometry = flat;

  // Ombres portées recadrées sur la zone visible.
  const s = sun.shadow.camera;
  s.left = -half; s.right = half; s.top = half; s.bottom = -half;
  s.updateProjectionMatrix();

  // Décor redistribué sur toute l'étendue, densité constante.
  decorGroup.clear();
  obstacles.length = 0;
  const n = Math.round((size * size) / 60);
  for (let i = 0; i < n; i++) {
    const x = (rand(i + 1) - 0.5) * (size - 4);
    const z = (rand(i + 91) - 0.5) * (size - 4);
    const arbre = rand(i + 311) > 0.45;
    const scl = 0.5 + rand(i + 7) * 0.6;

    const mesh = arbre
      ? new THREE.Mesh(
          new THREE.ConeGeometry(0.8 * scl, 2.4 * scl, 5),
          new THREE.MeshLambertMaterial({ color: 0x2f7a4f, flatShading: true })
        )
      : new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.55 * scl, 0),
          new THREE.MeshLambertMaterial({ color: 0x8d9a8f, flatShading: true })
        );

    mesh.position.set(x, hauteur(x, z) + (arbre ? 1.2 * scl : 0.25 * scl), z);
    mesh.rotation.y = rand(i + 53) * Math.PI * 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    decorGroup.add(mesh);

    // Rayon d'encombrement au sol : base du cône / rayon du rocher.
    obstacles.push({ x, z, r: arbre ? 0.8 * scl : 0.6 * scl });
  }

  demiEtendue = half;
  placerTanks();   // avant les vaches : les chars s'ajoutent aux obstacles
  placerVaches();
}

// --------------------------------------------------------- compteur de points
const elScore = document.getElementById('score');
const elValeur = document.getElementById('score-valeur');
const elEtoiles = [...document.querySelectorAll('.recherche .etoile')];
let etoiles = 1;            // niveau de recherche, une étoile dès le départ

// Le niveau monte avec le troupeau enlevé : la dernière étoile tombe quand il ne
// reste presque plus rien à voler.
function majRecherche() {
  const niveau = vachesTotal
    ? THREE.MathUtils.clamp(1 + Math.floor((capturees / vachesTotal) * ETOILES_MAX), 1, ETOILES_MAX)
    : 1;
  if (niveau === etoiles) return;

  for (let i = etoiles; i < niveau; i++) {
    elEtoiles[i].classList.add('acquise', 'neuve');
    setTimeout(() => elEtoiles[i].classList.remove('neuve'), 6400);
  }
  etoiles = niveau;
}

// Multiplicateur de points : prime à la rapidité, pénalité pour chaque missile
// encaissé. Une vache enlevée tôt et sans dégât vaut le double de sa valeur.
function multiplicateur() {
  const rapidite = 1 + Math.max(0, 1 - clock.elapsedTime / TEMPS_REF);
  const degats = 1 - Math.min(MALUS_MAX, touches * MALUS_TOUCHE);
  return Math.max(0.1, rapidite * degats);
}

const elMulti = document.getElementById('score-multi');
let multiAffiche = '';

function majMulti() {
  const m = multiplicateur();
  const txt = `×${m.toFixed(1)}`;
  if (txt === multiAffiche) return;         // on n'écrit dans le DOM qu'au changement
  multiAffiche = txt;
  elMulti.textContent = txt;
  elMulti.classList.toggle('faible', m < 1);
}

const elCaptures = document.getElementById('score-captures');
const elGain = document.getElementById('score-gain');
const elTouches = document.getElementById('score-touches');
let capturees = 0;
let points = 0;
let touches = 0;
let vachesTotal = 0;      // effectif du troupeau, référence des vagues de chars

function majScore(pop, gain) {
  elValeur.textContent = points;
  elCaptures.textContent = capturees;
  elTouches.textContent = touches;
  if (!pop) return;
  elGain.textContent = `+${gain}`;
  elScore.classList.remove('pop');
  elGain.classList.remove('gain-anim');
  void elScore.offsetWidth;          // relance les animations CSS
  elScore.classList.add('pop');
  elGain.classList.add('gain-anim');
}

// ------------------------------------------------------------ petites vaches
// Le .obj est chargé une fois, sa géométrie est partagée par toutes les
// instances (recentrée en XZ, pattes posées sur Y=0, mise à l'échelle).
let vacheGeo = null;
const ROBES = [0xf2efe6, 0xd9d3c4, 0x8b5a3c, 0x6b4630, 0x2e2a28];
const vachesMats = ROBES.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));

// Jauge d'abduction : petit anneau face caméra qui se remplit radialement.
const jaugeGeo = new THREE.RingGeometry(0.30, 0.46, 56, 1);   // plus grande et plus épaisse

// Les jauges vivent hors des vaches : enfant d'une vache en pleine rotation,
// l'anneau tournoyait avec elle et le billboard ne pouvait pas le compenser.
const jaugesGroup = new THREE.Group();
scene.add(jaugesGroup);
const jaugeVert = /* glsl */`
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const jaugeFrag = /* glsl */`
  uniform float uProgres;
  uniform float uAlpha;
  uniform vec3 uDebut;   // rose
  uniform vec3 uFin;     // rouge sang
  varying vec2 vPos;
  void main() {
    // Angle mesuré depuis le haut, sens horaire, normalisé sur 0..1.
    float a = atan(vPos.x, vPos.y) / 6.2831853;
    if (a < 0.0) a += 1.0;
    float rempli = step(a, uProgres);

    // La teinte suit l'avancement : rose en début d'abduction, rouge sanguin
    // sur la fin. La courbe est accélérée pour que le virage se sente.
    vec3 col = mix(uDebut, uFin, pow(clamp(uProgres, 0.0, 1.0), 0.75));
    col *= 0.85 + 0.35 * uProgres;                   // et ça s'intensifie

    float alpha = uAlpha * mix(0.14, 1.0, rempli);   // piste sombre + part remplie
    gl_FragColor = vec4(col * mix(0.35, 1.0, rempli), alpha);
  }
`;
function nouvelleJauge(debut = 0xff7bb0, fin = 0xc00018) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uProgres: { value: 0 },
      uAlpha: { value: 0 },
      uDebut: { value: new THREE.Color(debut) },
      uFin: { value: new THREE.Color(fin) },
    },
    vertexShader: jaugeVert,
    fragmentShader: jaugeFrag,
  });
  const m = new THREE.Mesh(jaugeGeo, mat);
  m.renderOrder = 5;
  m.visible = false;
  return m;
}

new OBJLoader().load('./assets/cow.obj', (obj) => {
  let geo = null;
  obj.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
  if (!geo) return console.error('cow.obj : aucune géométrie trouvée');

  geo = geo.toNonIndexed();           // facettes franches, cohérent avec le reste
  geo.deleteAttribute('uv');
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const taille = new THREE.Vector3().subVectors(bb.max, bb.min);
  const k = COW_TAILLE / Math.max(taille.x, taille.z);

  // Recentre en XZ, pose les pattes sur le sol, puis met à l'échelle.
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(k, k, k);
  geo.computeVertexNormals();

  vacheGeo = geo;
  placerVaches();
  pret('vaches');
}, undefined, (err) => console.error('Chargement cow.obj échoué :', err));

// Point du sol correspondant à une position écran (-1..1 en X et Y), par
// lancer de rayon sur le plan horizontal — exactement comme pour le curseur.
// Outils propres à ce calcul : ceux du curseur sont déclarés plus bas dans le
// fichier et ne sont pas encore initialisés au premier appel de resize().
const pointEcran = new THREE.Vector3();
const ndcEcran = new THREE.Vector2();
const rayonEcran = new THREE.Raycaster();
const planSol = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function solDepuisEcran(sx, sy) {
  camera.updateMatrixWorld();
  rayonEcran.setFromCamera(ndcEcran.set(sx, sy), camera);
  return rayonEcran.ray.intersectPlane(planSol, pointEcran) ? pointEcran : null;
}

function placerVaches() {
  vachesGroup.clear();
  jaugesGroup.clear();
  if (!vacheGeo) return;

  // Le troupeau est tiré en coordonnées écran : toutes les vaches sont donc
  // dans le cadre, condition sine qua non pour que la victoire soit atteignable.
  // La zone visible au sol est un parallélogramme dont on déduit l'effectif.
  const coins = [
    solDepuisEcran(-COW_MARGE_X, -COW_MARGE_Y)?.clone(),
    solDepuisEcran(COW_MARGE_X, -COW_MARGE_Y)?.clone(),
    solDepuisEcran(-COW_MARGE_X, COW_MARGE_Y)?.clone(),
  ];
  if (coins.some((c) => !c)) return;
  const aire = coins[0].distanceTo(coins[1]) * coins[0].distanceTo(coins[2]);
  const n = Math.max(3, Math.round(aire / COW_DENSITE));
  const posees = []; // { x, z, r } des vaches déjà placées

  // Une vache est acceptée si son empreinte ne recoupe ni un arbre/rocher,
  // ni une vache déjà posée : tirage avec rejet, jusqu'à ESSAIS tentatives.
  const ESSAIS = 30;
  function libre(x, z, r) {
    for (const o of obstaclesTanks) {
      const d = r + o.r;
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < d * d) return false;
    }
    for (const o of obstacles) {
      const d = r + o.r;
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < d * d) return false;
    }
    for (const o of posees) {
      const d = r + o.r;
      if ((x - o.x) ** 2 + (z - o.z) ** 2 < d * d) return false;
    }
    return true;
  }

  for (let i = 0; i < n; i++) {
    // Un seul tirage pilote à la fois le gabarit et la résistance : la taille
    // de la vache est l'indice visuel de sa difficulté d'enlèvement.
    const resistance = rand(i + 437);
    const scl = THREE.MathUtils.lerp(COW_SCL_MIN, COW_SCL_MAX, resistance);
    const r = (COW_TAILLE * scl) / 2 + 0.1; // demi-longueur + petite marge

    let x = 0, z = 0, ok = false;
    for (let a = 0; a < ESSAIS && !ok; a++) {
      // Seeds distincts par tentative : le tirage reste déterministe.
      const sx = (rand(i * 37 + a * 911 + 1201) * 2 - 1) * COW_MARGE_X;
      const sy = (rand(i * 53 + a * 577 + 2803) * 2 - 1) * COW_MARGE_Y;
      const p = solDepuisEcran(sx, sy);
      if (!p) continue;
      x = p.x; z = p.z;
      ok = libre(x, z, r);
    }
    if (!ok) continue; // zone saturée : on renonce plutôt que de superposer

    const vache = new THREE.Mesh(vacheGeo, vachesMats[Math.floor(rand(i + 661) * vachesMats.length)]);
    vache.scale.setScalar(scl);
    vache.position.set(x, hauteur(x, z), z);
    vache.rotation.y = rand(i + 97) * Math.PI * 2;   // orientation aléatoire
    vache.castShadow = true;
    vache.receiveShadow = true;
    vache.userData.phase = rand(i + 1777) * Math.PI * 2;
    vache.userData.y0 = vache.position.y;
    vache.userData.yaw0 = vache.rotation.y;
    // Plus elle est grosse, plus elle est lente à monter (ASPI_MAX -> ASPI_MIN).
    vache.userData.aspiration = THREE.MathUtils.lerp(ASPI_MAX, ASPI_MIN, resistance);
    // Une grosse vache est plus dure à enlever : elle vaut davantage (1 à 5).
    vache.userData.points = 1 + Math.round(resistance * 4);
    vache.userData.gabarit = resistance;      // 0 = petite et aiguë, 1 = grosse et grave
    vache.userData.prochainMeuh = 0;
    vache.userData.progres = 0;
    vache.userData.abduite = false;

    const jauge = nouvelleJauge();
    jauge.userData.hauteur = COW_TAILLE * scl * 0.95;   // au-dessus du garrot
    jaugesGroup.add(jauge);
    vache.userData.jauge = jauge;

    vachesGroup.add(vache);
    posees.push({ x, z, r });
  }

  vachesTotal = vachesGroup.children.length;
  majScore(false);
  elEtoiles[0].classList.add('acquise');   // une étoile d'entrée de jeu
  majRecherche();
}

// ------------------------------------------------------------------- chars
// Le .obj d'origine embarque un sol et un panneau de fond : on ne garde que
// le véhicule, et on sépare châssis / tourelle / canon pour pouvoir viser.
const PIECES_INUTILES = new Set([
  'Plane',                  // sol du décor d'origine (quad 60x60 plat)
  'Plane.002_Plane.001',    // panneau de fond ("ciel"), flottant à y ≈ 26
]);
const COQUE_CAISSE = 'Plane.001_Plane.000';
const COQUE_TOURELLE = 'Plane.000_Plane.002';
const PIECES_TOURELLE = new Set([
  COQUE_TOURELLE,           // caisson de tourelle
  'Cube.002',               // mitrailleuse de toit
  'Cube.001',               // masque de canon
  'Cube',                   // coffre arrière de tourelle
]);
const PIECE_CANON = 'Cylinder';

const tanksGroup = new THREE.Group();
scene.add(tanksGroup);

// Jauges de rechargement : hors de la hiérarchie des chars, pour que le
// billboard ne subisse ni le cap du châssis ni son assiette.
const jaugesTanksGroup = new THREE.Group();
scene.add(jaugesTanksGroup);

// DoubleSide : les coques du modèle sont des surfaces ouvertes, sans épaisseur.
const tankMats = {
  caisse: new THREE.MeshLambertMaterial({ color: 0x5a6647, flatShading: true, side: THREE.DoubleSide }),
  tourelle: new THREE.MeshLambertMaterial({ color: 0x646f4f, flatShading: true, side: THREE.DoubleSide }),
  canon: new THREE.MeshLambertMaterial({ color: 0x4a5340, flatShading: true, side: THREE.DoubleSide }),
};

let tankGeos = null;   // { caisse, tourelle, canon, pivotTourelle, pivotCanon }
const tanks = [];      // { racine, tourelle, canon }

// Le .obj contient quelques arêtes isolées ("l a b") laissées par l'export
// Blender. OBJLoader bascule alors l'objet entier en LineSegments : la coque
// de tourelle et son coffre arrière disparaissaient. On purge ces lignes.
fetch('./assets/m1.obj')
  .then((r) => r.text())
  .then((txt) => {
    const obj = new OBJLoader().parse(txt.replace(/^l .*$/gm, ''));
    obj.updateMatrixWorld(true);
    const garde = [];
    obj.traverse((o) => {
    if (!o.isMesh) return;
    if (PIECES_INUTILES.has(o.name)) return;   // sol + ciel écartés
    const g = o.geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(o.matrixWorld);             // fige l'éventuelle transfo du .obj
    garde.push({ nom: o.name, geo: g });
    });
    if (!garde.length) return console.error('m1.obj : aucune pièce exploitable');

    // La caisse et la tourelle sont des coques ouvertes : vues de dessus on
    // voyait à travers (trou noir autour de l'anneau de tourelle). On glisse
    // un bloc plein légèrement rentré dans chacune pour boucher le volume.
    function remplissage(nomCoque, nomBloc, rx, ry, rz) {
      const coque = garde.find((e) => e.nom === nomCoque);
      if (!coque) return;
      coque.geo.computeBoundingBox();
      const b = coque.geo.boundingBox;
      const d = new THREE.Vector3().subVectors(b.max, b.min);
      const c = new THREE.Vector3().addVectors(b.min, b.max).multiplyScalar(0.5);
      // Retraits plus francs en X/Z : les coques s'affinent vers le glacis et
      // la poupe, un bloc trop large ressortirait à travers les pentes.
      const brut = new THREE.BoxGeometry(d.x * (1 - rx), d.y * (1 - ry), d.z * (1 - rz));
      // Aligné sur les géométries du .obj : non indexée et sans uv, sinon la
      // fusion échoue (mergeGeometries exige des attributs identiques).
      const bloc = brut.toNonIndexed();
      brut.dispose();
      bloc.deleteAttribute('uv');
      bloc.translate(c.x, c.y, c.z);
      garde.push({ nom: nomBloc, geo: bloc });
    }
    // Seule la caisse est remplie : la coque de tourelle est bombée et son
    // bloc ressortait au-dessus du toit sous la forme d'un pavé. En DoubleSide
    // elle se suffit à elle-même.
    remplissage(COQUE_CAISSE, 'RemplissageCaisse', 0.14, 0.06, 0.22);

    // Boîte globale des pièces conservées -> mise à l'échelle + pose au sol.
    const bb = new THREE.Box3();
    for (const { geo } of garde) { geo.computeBoundingBox(); bb.union(geo.boundingBox); }
    const dim = new THREE.Vector3().subVectors(bb.max, bb.min);
    const k = TANK_TAILLE / Math.max(dim.x, dim.z);
    for (const { geo } of garde) {
    geo.translate(0, -bb.min.y, 0);
    geo.scale(k, k, k);
    }

    const parts = (pred) => garde.filter(pred).map((e) => e.geo);
    const caisse = parts((e) => !PIECES_TOURELLE.has(e.nom) && e.nom !== PIECE_CANON);
    const tourelle = parts((e) => PIECES_TOURELLE.has(e.nom));
    const canon = parts((e) => e.nom === PIECE_CANON);

    // Pivot de tourelle : centre XZ du caisson. Pivot de canon : culasse (arrière
    // du tube), pour que l'élévation se fasse autour du masque et non du néant.
    tourelle.forEach((g) => g.computeBoundingBox());
    canon.forEach((g) => g.computeBoundingBox());
    const boxT = new THREE.Box3(); tourelle.forEach((g) => boxT.union(g.boundingBox));
    const boxC = new THREE.Box3(); canon.forEach((g) => boxC.union(g.boundingBox));

    const pivotTourelle = new THREE.Vector3((boxT.min.x + boxT.max.x) / 2, 0, (boxT.min.z + boxT.max.z) / 2);
    const pivotCanon = new THREE.Vector3(
    (boxC.min.x + boxC.max.x) / 2,
    (boxC.min.y + boxC.max.y) / 2,
    boxC.min.z,                                 // culasse : le tube pointe vers +Z
    );

    const fusion = (arr, decalage) => {
    const m = mergeGeometries(arr.map((g) => g.clone()), false);
    if (decalage) m.translate(-decalage.x, -decalage.y, -decalage.z);
    m.computeVertexNormals();
    return m;
    };

    tankGeos = {
      caisse: fusion(caisse, null),
      tourelle: fusion(tourelle, pivotTourelle),
      canon: fusion(canon, pivotCanon),
      pivotTourelle,
      pivotCanon: pivotCanon.clone().sub(pivotTourelle),
      // Longueur du tube : position de la bouche, d'où partent les missiles.
      longueurCanon: boxC.max.z - boxC.min.z,
    };

    placerTanks();
    pret('chars');
  })
  .catch((err) => console.error('Chargement m1.obj échoué :', err));

// ----------------------------------------------------- traînées de chenilles
// Un ruban par chenille : file de points déposés tous les TRACE_PAS, replaqués
// sur le relief, dont l'opacité décroît avec l'âge jusqu'à disparaître.
const tracesGroup = new THREE.Group();
scene.add(tracesGroup);

const traceMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
  uniforms: { uCouleur: { value: new THREE.Color(0x5c4028) } },   // terre remuée
  vertexShader: /* glsl */`
    attribute float aAlpha;
    varying float vAlpha;
    void main() {
      vAlpha = aAlpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uCouleur;
    varying float vAlpha;
    void main() {
      if (vAlpha <= 0.001) discard;
      gl_FragColor = vec4(uCouleur, vAlpha * 0.85);
    }
  `,
});

function nouvelleTrace() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRACE_PTS * 2 * 3), 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(TRACE_PTS * 2), 1));

  // Bande de quads : (2i, 2i+1, 2i+3) + (2i, 2i+3, 2i+2).
  const idx = [];
  for (let i = 0; i < TRACE_PTS - 1; i++) {
    idx.push(2 * i, 2 * i + 1, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 2);
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);

  const mesh = new THREE.Mesh(geo, traceMat);
  mesh.frustumCulled = false;      // les sommets bougent sans bbox à jour
  mesh.renderOrder = -1;           // sous les vaches et le halo
  tracesGroup.add(mesh);
  return { mesh, pts: [] };        // pts : { x, z, t }
}

function majTrace(trace, x, z, nx, nz, t) {
  const pts = trace.pts;
  const dernier = pts[pts.length - 1];
  if (!dernier || (x - dernier.x) ** 2 + (z - dernier.z) ** 2 > TRACE_PAS * TRACE_PAS) {
    pts.push({ x, z, t, nx, nz });
    if (pts.length > TRACE_PTS) pts.shift();
  }
  if (pts.length < 2) return;

  const pos = trace.mesh.geometry.attributes.position;
  const alp = trace.mesh.geometry.attributes.aAlpha;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const w = TRACE_LARG / 2;
    // Normale latérale mémorisée au dépôt : le ruban garde sa largeur même
    // quand le char tourne ou repart en sens inverse.
    for (let c = 0; c < 2; c++) {
      const sgn = c === 0 ? -1 : 1;
      const px = p.x + p.nx * w * sgn;
      const pz = p.z + p.nz * w * sgn;
      pos.setXYZ(i * 2 + c, px, hauteur(px, pz) + 0.035, pz);
    }
    // Effacement progressif, avec une pointe atténuée en queue de ruban.
    const a = Math.max(0, 1 - (t - p.t) / TRACE_DUREE);
    const bout = Math.min(1, i / 2);
    alp.setX(i * 2, a * bout);
    alp.setX(i * 2 + 1, a * bout);
  }
  pos.needsUpdate = true;
  alp.needsUpdate = true;
  trace.mesh.geometry.setDrawRange(0, (pts.length - 1) * 6);
}

function nouveauTank() {
  const racine = new THREE.Group();

  const caisse = new THREE.Mesh(tankGeos.caisse, tankMats.caisse);
  caisse.castShadow = caisse.receiveShadow = true;
  racine.add(caisse);

  const tourelle = new THREE.Group();
  tourelle.position.copy(tankGeos.pivotTourelle);
  const mTourelle = new THREE.Mesh(tankGeos.tourelle, tankMats.tourelle);
  mTourelle.castShadow = mTourelle.receiveShadow = true;
  tourelle.add(mTourelle);
  racine.add(tourelle);

  const canon = new THREE.Group();
  canon.position.copy(tankGeos.pivotCanon);
  const mCanon = new THREE.Mesh(tankGeos.canon, tankMats.canon);
  mCanon.castShadow = true;
  canon.add(mCanon);
  tourelle.add(canon);

  // Repère de bouche, au bout du tube : origine des missiles.
  const bouche = new THREE.Object3D();
  bouche.position.z = tankGeos.longueurCanon;
  canon.add(bouche);

  racine.rotation.order = 'YXZ';   // cap d'abord, puis assiette du terrain

  // Jauge de rechargement, jaune, même facture que celle d'abduction.
  const jauge = nouvelleJauge(0xffe066, 0xffa000);
  jaugesTanksGroup.add(jauge);
  const attente = Math.random() * TIR_CADENCE;

  return {
    racine, tourelle, canon, bouche,
    actif: true,        // en action, ou en attente de renfort hors champ
    ordreAttente: 0,
    prochainTir: attente,
    rechargeDebut: 0,
    rechargeDuree: attente,
    jauge,
    evite: false,     // contournement en cours
    cote: 1,          // côté d'esquive retenu, pour ne pas hésiter
    cap: 0,                                       // cap du châssis (rad)
    traces: [nouvelleTrace(), nouvelleTrace()],   // chenille gauche / droite
  };
}

// Un char posé hors du cadre n'entre en action qu'une fois un certain nombre de
// vaches enlevées : les renforts arrivent au rythme de la progression du joueur.
const pointTank = new THREE.Vector3();

// Position à l'écran en coordonnées normalisées (-1..1), centre du cadre = 0.
function versEcran(v) {
  camera.updateMatrixWorld();
  return pointTank.copy(v).project(camera);
}

function dansEcran(v, marge = 1) {
  const e = versEcran(v);
  return Math.abs(e.x) <= marge && Math.abs(e.y) <= marge;
}

let tanksEnAttente = 0;

// Seuil de déclenchement : les chars en attente se répartissent uniformément sur
// la progression du troupeau (avec T chars en attente et N vaches, le k-ième
// entre en lice à k × N / (T + 1) captures).
function seuilTank(tk) {
  return Math.ceil(((tk.ordreAttente + 1) / (tanksEnAttente + 1)) * vachesTotal);
}

function placerTanks() {
  for (const t of tanks) tanksGroup.remove(t.racine);
  tracesGroup.clear();
  jaugesTanksGroup.clear();
  tanks.length = 0;
  tanksEnAttente = 0;
  obstaclesTanks.length = 0;
  if (!tankGeos) return;

  const size = demiEtendue * 2;
  const n = Math.max(2, Math.round((size * size) / TANK_DENSITE));
  const r = TANK_TAILLE * 0.55;

  for (let i = 0; i < n; i++) {
    let x = 0, z = 0, ok = false;
    for (let a = 0; a < 30 && !ok; a++) {
      x = (rand(i * 71 + a * 331 + 5101) - 0.5) * (size - 8);
      z = (rand(i * 89 + a * 197 + 6203) - 0.5) * (size - 8);
      ok = !obstacles.some((o) => (x - o.x) ** 2 + (z - o.z) ** 2 < (r + o.r) ** 2);
    }
    if (!ok) continue;

    const t = nouveauTank();
    t.racine.position.set(x, hauteur(x, z), z);
    t.cap = rand(i + 733) * Math.PI * 2;                 // orientation du châssis
    t.racine.rotation.y = t.cap;

    // Ceux déjà dans le cadre engagent tout de suite, les autres attendent.
    t.actif = dansEcran(t.racine.position);
    if (!t.actif) t.ordreAttente = tanksEnAttente++;
    tanksGroup.add(t.racine);
    tanks.push(t);

    // Le char devient un obstacle de placement : aucune vache ne naît dessous.
    // Liste distincte du décor, sinon les chars contourneraient leur propre
    // emplacement de départ une fois qu'ils l'ont quitté.
    obstaclesTanks.push({ x, z, r });
  }
}

// Contournement : les obstacles situés devant le char, dans le couloir qu'il
// s'apprête à emprunter, produisent un biais de cap du côté opposé. Ceux qu'il
// touche déjà le repoussent franchement.
const versObstacle = new THREE.Vector2();

function eviterObstacles(tk, p) {
  const avant = new THREE.Vector2(Math.sin(tk.cap), Math.cos(tk.cap));
  const droite = new THREE.Vector2(avant.y, -avant.x);
  let urgence = 0;
  let lateral = 0;

  const examiner = (ox, oz, r) => {
    versObstacle.set(ox - p.x, oz - p.z);
    const d = versObstacle.length();
    if (d > TANK_DETECT + r) return;

    const av = versObstacle.dot(avant);        // distance devant le char
    const lat = versObstacle.dot(droite);      // écart latéral, positif à droite
    const marge = r + TANK_LARG;

    // Déjà au contact : on écarte physiquement le char de l'obstacle.
    if (d < marge && d > 1e-3) {
      p.x -= (versObstacle.x / d) * (marge - d);
      p.z -= (versObstacle.y / d) * (marge - d);
    }

    if (av <= 0 || Math.abs(lat) > marge) return;   // derrière, ou hors couloir

    // On ne retient que l'obstacle le plus pressant : additionner les biais de
    // plusieurs obstacles les fait s'annuler et le char fonce droit entre eux.
    const u = (1 - av / TANK_DETECT) * (1 - Math.abs(lat) / marge);
    if (u > urgence) { urgence = u; lateral = lat; }
  };

  for (const o of obstacles) examiner(o.x, o.z, o.r);
  for (const v of vachesGroup.children) {
    if (v.userData.abduite || v.userData.progres > 0.15) continue;   // en vol
    examiner(v.position.x, v.position.z, (COW_TAILLE * v.scale.x) / 2);
  }

  tk.evite = urgence > 0;
  if (!tk.evite) return 0;

  // Obstacle pile dans l'axe : on garde le côté choisi au coup précédent,
  // sinon le char hésite de gauche à droite et n'avance plus.
  if (Math.abs(lateral) < 0.05) lateral = tk.cote;
  tk.cote = lateral >= 0 ? 1 : -1;

  return THREE.MathUtils.clamp(-tk.cote * urgence * EVIT_FORCE, -1.4, 1.4);
}


// ---------------------------------------------------------------- explosions
// La planche fournie est sur fond noir : on la détoure au chargement (remplissage
// par diffusion depuis les bords) pour garder les cernes noirs du dessin, puis on
// détecte automatiquement la position de chaque vignette.
const explosionsGroup = new THREE.Group();
scene.add(explosionsGroup);

let explTexture = null;
let explFrames = null;          // [{ ox, oy, rx, ry, hauteurRelative }] en UV
const explosions = [];          // { sprite, age, duree, taille }

function detourerFondNoir(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const vu = new Uint8Array(w * h);
  const pile = [];
  const noir = (i) => d[i] < 42 && d[i + 1] < 42 && d[i + 2] < 42;

  for (let x = 0; x < w; x++) { pile.push(x, x + (h - 1) * w); }
  for (let y = 0; y < h; y++) { pile.push(y * w, w - 1 + y * w); }

  while (pile.length) {
    const p = pile.pop();
    if (vu[p]) continue;
    const i = p * 4;
    if (!noir(i)) continue;      // on s'arrête au dessin : les cernes sont gardés
    vu[p] = 1;
    d[i + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) pile.push(p - 1);
    if (x < w - 1) pile.push(p + 1);
    if (y > 0) pile.push(p - w);
    if (y < h - 1) pile.push(p + w);
  }
  ctx.putImageData(img, 0, 0);
  return img;
}

// Découpe automatique : bandes horizontales occupées, puis colonnes dans chaque
// bande. Les petits blocs (les numéros sous les vignettes) sont écartés.
function decouperPlanche(img, w, h) {
  const opaque = (x, y) => img.data[(y * w + x) * 4 + 3] > 12;
  const bandes = (taille, autre, test) => {
    const plein = [];
    for (let a = 0; a < taille; a++) {
      let occupe = false;
      for (let b = 0; b < autre && !occupe; b++) occupe = test(a, b);
      plein.push(occupe);
    }
    const res = [];
    let debut = -1;
    for (let a = 0; a <= taille; a++) {
      if (a < taille && plein[a]) { if (debut < 0) debut = a; }
      else if (debut >= 0) { res.push([debut, a - 1]); debut = -1; }
    }
    return res;
  };

  const lignes = bandes(h, w, (y, x) => opaque(x, y));
  const hauteurMax = Math.max(...lignes.map((l) => l[1] - l[0]));
  const lignesArt = lignes.filter((l) => l[1] - l[0] > hauteurMax * 0.35);

  const frames = [];
  for (const [y0, y1] of lignesArt) {
    const cols = bandes(w, y1 - y0 + 1, (x, dy) => opaque(x, y0 + dy));
    // Seuil calé sur la hauteur de la bande : garde la petite étincelle de la
    // première vignette (~40 px) mais écarte les éclats isolés (< 20 px).
    const mini = (y1 - y0 + 1) * 0.08;
    for (const [x0, x1] of cols) {
      if (x1 - x0 + 1 < mini) continue;
      frames.push({ x0, y0, x1, y1 });
    }
  }

  const hMax = Math.max(...frames.map((f) => f.y1 - f.y0 + 1));
  return frames.map((f) => ({
    ox: f.x0 / w,
    oy: 1 - (f.y1 + 1) / h,
    rx: (f.x1 - f.x0 + 1) / w,
    ry: (f.y1 - f.y0 + 1) / h,
    ratio: (f.x1 - f.x0 + 1) / (f.y1 - f.y0 + 1),
    echelle: (f.y1 - f.y0 + 1) / hMax,     // la vignette enfle au fil de l'animation
  }));
}

const imageExpl = new Image();
imageExpl.onload = () => {
  const w = imageExpl.width, h = imageExpl.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageExpl, 0, 0);

  const img = detourerFondNoir(ctx, w, h);
  explFrames = decouperPlanche(img, w, h);

  explTexture = new THREE.CanvasTexture(cv);
  explTexture.colorSpace = THREE.SRGBColorSpace;
  explTexture.minFilter = THREE.LinearFilter;
  explTexture.generateMipmaps = false;
  pret('explosions');
};
imageExpl.onerror = () => console.error('Chargement explosion.png échoué');
imageExpl.src = './assets/explosion.png';

function exploser(position, taille = EXPL_TAILLE, duree = EXPL_DUREE) {
  // Le son part même si la planche d'images n'est pas prête : la détonation est
  // dosée sur l'envergure, et placée dans le stéréo comme le reste.
  const e = versEcran(position);
  explosion(e.x, e.y, THREE.MathUtils.clamp(taille / EXPL_TAILLE_G, 0.25, 1));

  if (!explTexture || !explFrames || !explFrames.length) return;
  const map = explTexture.clone();
  map.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthWrite: false,
    rotation: Math.random() * Math.PI * 2,   // chaque explosion est orientée au hasard
  }));
  sprite.position.copy(position);
  explosionsGroup.add(sprite);
  explosions.push({ sprite, age: 0, duree, taille });
}

function majExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.age += dt;
    const p = e.age / e.duree;
    if (p >= 1) {
      e.sprite.material.map.dispose();
      e.sprite.material.dispose();
      explosionsGroup.remove(e.sprite);
      explosions.splice(i, 1);
      continue;
    }

    const f = explFrames[Math.min(explFrames.length - 1, Math.floor(p * explFrames.length))];
    const map = e.sprite.material.map;
    map.offset.set(f.ox, f.oy);
    map.repeat.set(f.rx, f.ry);

    const t = e.taille * f.echelle;
    e.sprite.scale.set(t * f.ratio, t, 1);
  }
}

// ------------------------------------------------------------------ missiles
const depart = new THREE.Vector3();
const axeTir = new THREE.Vector3();
const missilesGroup = new THREE.Group();
scene.add(missilesGroup);
const missiles = [];   // { mesh, dir, vie }

const missileMat = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  emissive: 0x8899aa,
  emissiveIntensity: 0.35,
  flatShading: true,
});
let missileGeo = null;

fetch('./assets/missile.obj')
  .then((r) => r.text())
  .then((txt) => {
    const obj = new OBJLoader().parse(txt.replace(/^l .*$/gm, ''));
    obj.updateMatrixWorld(true);

    const parts = [];
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.deleteAttribute('uv');
      g.applyMatrix4(o.matrixWorld);
      parts.push(g);
    });
    if (!parts.length) return console.error('missile.obj : aucune géométrie');

    const geo = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const d = new THREE.Vector3().subVectors(b.max, b.min);
    const c = new THREE.Vector3().addVectors(b.min, b.max).multiplyScalar(0.5);

    // Le fuselage est aligné sur +Z : on recentre en X/Y, on met l'origine au
    // culot, et on met à l'échelle sur la longueur voulue.
    geo.translate(-c.x, -c.y, -b.min.z);
    geo.scale(MISSILE_LONG / d.z, MISSILE_LONG / d.z, MISSILE_LONG / d.z);
    geo.computeVertexNormals();
    missileGeo = geo;
    pret('missiles');
  })
  .catch((err) => console.error('Chargement missile.obj échoué :', err));

function tirer(origine, direction) {
  if (!missileGeo) return;
  if (!Number.isFinite(origine.x) || !Number.isFinite(direction.x)) {
    return console.error('tir ignoré : origine ou direction invalide', origine, direction);
  }
  const mesh = new THREE.Mesh(missileGeo, missileMat);
  mesh.castShadow = true;
  mesh.position.copy(origine);
  missilesGroup.add(mesh);
  missiles.push({
    mesh,
    dir: direction.clone().normalize(),
    vie: MISSILE_VIE,
    guide: true,     // verrouillé sur l'OVNI tant que la poursuite reste tenable
    stress: 0,       // temps passé en dehors du domaine de virage
  });
}

function majMissiles(dt) {
  const axeZ = new THREE.Vector3(0, 0, 1);
  const vers = new THREE.Vector3();
  const perdus = new Set();

  // Collisions missile contre missile : les deux sont détruits.
  for (let i = 0; i < missiles.length; i++) {
    for (let j = i + 1; j < missiles.length; j++) {
      if (missiles[i].mesh.position.distanceToSquared(missiles[j].mesh.position) < COLL_MISSILE * COLL_MISSILE) {
        perdus.add(i);
        perdus.add(j);
      }
    }
  }

  const limite = demiEtendue + 12;

  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.vie -= dt;

    const pos = m.mesh.position;
    vers.copy(ufoPivot.position).sub(pos);
    const portee = vers.length();
    vers.normalize();
    const ecart = m.dir.angleTo(vers);

    if (m.guide) {
      // Une manoeuvre trop serrée pour l'autodirecteur finit par le décrocher :
      // au-delà de PERTE_ANGLE il accumule du retard, et il perd le verrou s'il
      // n'arrive pas à se recaler. Un écart extrême le fait décrocher net.
      if (ecart > PERTE_SECHE) {
        m.guide = false;
      } else if (ecart > PERTE_ANGLE) {
        m.stress += dt;
        if (m.stress > PERTE_DUREE) m.guide = false;
      } else {
        m.stress = Math.max(0, m.stress - dt * 0.5);
      }
    }

    // Guidage à capacité de virage limitée. Décroché, le missile file tout droit.
    if (m.guide && ecart > 1e-4) {
      m.dir.lerp(vers, Math.min(1, (MISSILE_VIRE * dt) / ecart)).normalize();
    }

    pos.addScaledVector(m.dir, MISSILE_VIT * dt);
    m.mesh.quaternion.setFromUnitVectors(axeZ, m.dir);

    const touche = portee < 1.5;
    if (touche) encaisser();

    // Fin de course : impact, sol, sortie de champ, collision, ou sécurité.
    const dehors = Math.abs(pos.x) > limite || Math.abs(pos.z) > limite || pos.y > 80;
    const sol = pos.y < hauteur(pos.x, pos.z);
    if (touche || dehors || perdus.has(i) || m.vie <= 0 || sol) {
      // Tout ce qui percute explose ; ce qui quitte le champ ou tombe en panne
      // de carburant s'efface discrètement.
      if (touche || sol || perdus.has(i)) exploser(pos);
      missilesGroup.remove(m.mesh);
      missiles.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------------ victoire
// Troupeau au complet : la soucoupe fait un dernier tour sur elle-même puis
// fonce vers la caméra jusqu'à occulter l'écran.
let zapEnCours = false;
let victoire = -1;                 // instant de déclenchement, -1 si la partie court
let victoirePos = null;            // position au moment du déclenchement
const elFin = () => document.getElementById('fin');

function declencherVictoire(t) {
  if (victoire >= 0 || ufoDetruit) return;
  victoire = t;
  setTensionMusique(1);      // tour d'honneur : le banjo file à pleine vitesse
  taireDecor(1.6);           // et la plaine se tait : bourdon, moteurs, faisceau
  victoirePos = ufoPivot.position.clone();
  haloActif = false;
  ombre.visible = false;
  halo.visible = false;
  tache.visible = false;
  haloLight.intensity = 0;
  document.querySelector('.hint').hidden = true;
}

function majVictoire(t, dt) {
  const age = t - victoire;

  if (age < VICT_MANOEUVRE) {
    // Manoeuvre : elle plonge légèrement, s'incline et prend son élan.
    const p = age / VICT_MANOEUVRE;
    ufoPivot.position.set(
      victoirePos.x,
      victoirePos.y - Math.sin(Math.PI * p) * 0.9,
      victoirePos.z,
    );
    ufoTilt.rotation.z = Math.sin(p * Math.PI * 2) * 0.4;
    ufoTilt.rotation.x = -Math.sin(Math.PI * p) * 0.25;
    ufo.rotation.y += dt * (SPIN_IDLE + p * 14);
    return;
  }

  // Ruée vers la caméra : le long de l'axe de vue, en accélérant. En projection
  // orthographique, l'approche ne grossit pas l'objet : c'est l'échelle qui fait
  // le travail d'occultation.
  const u = Math.min(1, (age - VICT_MANOEUVRE) / VICT_MONTEE);
  const e = Math.pow(u, 2.4);
  ufoPivot.position.copy(victoirePos).addScaledVector(ISO_DIR, e * 70);
  ufoPivot.scale.setScalar(1 + Math.pow(u, 3) * 75);
  ufoTilt.rotation.z = THREE.MathUtils.lerp(ufoTilt.rotation.z, 0, 0.1);
  ufoTilt.rotation.x = THREE.MathUtils.lerp(ufoTilt.rotation.x, 0, 0.1);
  ufo.rotation.y += dt * (14 + u * 26);

  // L'écran s'obscurcit à mesure que la coque envahit le cadre.
  const noir = THREE.MathUtils.clamp((u - 0.55) / 0.35, 0, 1);
  const fin = elFin();
  fin.style.setProperty('--noir', noir);
  if (noir > 0 && fin.hidden) fin.hidden = false;
  if (u >= 1 && !fin.classList.contains('affiche')) afficherRecap();
}

function afficherRecap() {
  const fin = elFin();
  const duree = Math.round(clock.elapsedTime);
  const rempl = {
    'fin-points': points,
    'fin-captures': capturees,
    'fin-touches': touches,
    'fin-duree': `${Math.floor(duree / 60)} min ${String(duree % 60).padStart(2, '0')} s`,
    'fin-multi': `×${multiplicateur().toFixed(1)}`,
  };
  for (const [id, val] of Object.entries(rempl)) document.getElementById(id).textContent = val;
  fin.classList.add('affiche');
}

// ------------------------------------------------------------ secousse caméra
const cameraBase = camera.position.clone();
let secousse = 0;

function majSecousse(dt) {
  if (secousse <= 0) return;
  secousse = Math.max(0, secousse - dt);
  if (secousse === 0) { camera.position.copy(cameraBase); return; }

  // Décroissance quadratique : coup sec au départ, extinction douce.
  const f = (secousse / SECOUSSE_DUR) ** 2;
  const a = SECOUSSE_AMP * f;
  camera.position.set(
    cameraBase.x + (Math.random() * 2 - 1) * a,
    cameraBase.y + (Math.random() * 2 - 1) * a * 0.6,
    cameraBase.z + (Math.random() * 2 - 1) * a,
  );
}

function resize() {
  const a = innerWidth / innerHeight;
  camera.left = -FRUSTUM * a; camera.right = FRUSTUM * a;
  camera.top = FRUSTUM;       camera.bottom = -FRUSTUM;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  construireSol();
}
resize();
pret('terrain');
addEventListener('resize', resize);

// ------------------------------------------------------------- suivi curseur
// Le curseur est projeté sur un plan horizontal : le déplacement obtenu est
// donc naturellement isométrique (il suit les axes de la grille vue à l'écran).
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(0, 0);
const planHorizontal = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cible = new THREE.Vector3(0, 0, 0);      // position visée (curseur)
const hit = new THREE.Vector3();

// Vitesse du curseur en pixels/s, lissée : pilote l'accélération de la rotation.
let vitesseCurseur = 0;
let dernierX = null, dernierY = null, dernierT = 0;

function majCible(ev) {
  pointerNDC.x = (ev.clientX / innerWidth) * 2 - 1;
  pointerNDC.y = -(ev.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  if (raycaster.ray.intersectPlane(planHorizontal, hit)) {
    const lim = demiEtendue - MARGE;
    cible.set(
      THREE.MathUtils.clamp(hit.x, -lim, lim),
      0,
      THREE.MathUtils.clamp(hit.z, -lim, lim)
    );
  }

  const t = performance.now();
  if (dernierX !== null) {
    const dt = Math.max((t - dernierT) / 1000, 1 / 240);
    const d = Math.hypot(ev.clientX - dernierX, ev.clientY - dernierY);
    vitesseCurseur = Math.max(vitesseCurseur, d / dt); // pic conservé, décru dans la boucle
  }
  dernierX = ev.clientX; dernierY = ev.clientY; dernierT = t;
}
addEventListener('pointermove', majCible);
addEventListener('touchmove', (e) => e.touches[0] && majCible(e.touches[0]), { passive: true });

const clock = new THREE.Clock();

// ------------------------------------------------------------------- l'OVNI
const ufoPivot = new THREE.Group();              // position lerpée
const ufoTilt  = new THREE.Group();              // inclinaison selon la vitesse
const ufo      = new THREE.Group();              // flottement + rotation propre
ufoPivot.add(ufoTilt);
ufoTilt.add(ufo);
scene.add(ufoPivot);

// Ombre portée "fake" au sol. Un disque plat s'enfonce dans le relief et
// n'apparaît qu'à moitié : la géométrie est donc un disque subdivisé dont
// chaque sommet est replaqué sur la hauteur du terrain à chaque frame.
const OMBRE_RAYON = 1.2;
const ombreGeo = new THREE.RingGeometry(0, OMBRE_RAYON, 36, 5);
ombreGeo.rotateX(-Math.PI / 2); // passe en XZ comme le sol
const OMBRE_BASE = ombreGeo.attributes.position.array.slice(); // x/z de référence

const ombre = new THREE.Mesh(
  ombreGeo,
  new THREE.MeshBasicMaterial({
    color: 0x1d3b2a,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,        // évite le z-fighting avec le sol
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
);
ombre.renderOrder = 1;
scene.add(ombre);

// -------------------------------------------------- halo bleu électrique (clic)
// Cône creux en rendu additif, de la soucoupe jusqu'au sol : dégradé vertical,
// liseré lumineux sur les bords (fresnel) et stries qui descendent.
const haloGeo = new THREE.ConeGeometry(1, 1, 48, 1, true); // ouvert, sans capuchon
haloGeo.translate(0, -0.5, 0);                             // pointe en y=0, base en y=-1

const haloMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: {
    uTemps: { value: 0 },
    uIntensite: { value: 0 },
    uCouleur: { value: new THREE.Color(0x2ea8ff) },   // bleu électrique
    uCouleurBord: { value: new THREE.Color(0x9be8ff) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vNormalVue;
    varying vec3 vPosVue;
    void main() {
      vUv = uv;
      vec4 pv = modelViewMatrix * vec4(position, 1.0);
      vPosVue = pv.xyz;
      vNormalVue = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * pv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uTemps;
    uniform float uIntensite;
    uniform vec3 uCouleur;
    uniform vec3 uCouleurBord;
    varying vec2 vUv;
    varying vec3 vNormalVue;
    varying vec3 vPosVue;
    void main() {
      // vUv.y : 0 au sol, 1 sous la soucoupe.
      float vertical = mix(0.15, 1.0, pow(vUv.y, 1.6));     // plus dense en haut
      float pied = smoothstep(0.0, 0.25, vUv.y);            // fondu au contact du sol

      // Bords du cône plus lumineux : silhouette nette vue de profil.
      float fres = 1.0 - abs(dot(normalize(vNormalVue), normalize(-vPosVue)));
      fres = pow(clamp(fres, 0.0, 1.0), 1.5);

      // Stries qui descendent le long du faisceau.
      float stries = 0.5 + 0.5 * sin(vUv.y * 26.0 - uTemps * 5.0 + vUv.x * 6.2831);

      vec3 col = mix(uCouleur, uCouleurBord, fres * 0.85);
      float alpha = uIntensite * pied * vertical * (0.18 + 0.42 * fres + 0.14 * stries);
      gl_FragColor = vec4(col * (0.7 + 0.6 * fres), alpha);
    }
  `,
});

const halo = new THREE.Mesh(haloGeo, haloMat);
halo.renderOrder = 2;
halo.visible = false;
scene.add(halo);

// Tache lumineuse au sol, replaquée sur le relief comme l'ombre.
const tacheGeo = new THREE.RingGeometry(0, 1, 40, 4);
tacheGeo.rotateX(-Math.PI / 2);
const TACHE_BASE = tacheGeo.attributes.position.array.slice();
// Atténuation radiale : vif au centre, éteint au bord (pas de disque plat).
{
  const bp = tacheGeo.attributes.position;
  const aR = new Float32Array(bp.count);
  for (let i = 0; i < bp.count; i++) aR[i] = Math.hypot(bp.getX(i), bp.getZ(i)); // rayon 0..1
  tacheGeo.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
}

const tacheMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uIntensite: { value: 0 },
    uCouleur: { value: new THREE.Color(0x6fd0ff) },
  },
  vertexShader: /* glsl */`
    attribute float aR;
    varying float vR;
    void main() {
      vR = aR;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uIntensite;
    uniform vec3 uCouleur;
    varying float vR;
    void main() {
      float f = pow(1.0 - clamp(vR, 0.0, 1.0), 2.2);   // dégradé centre -> bord
      gl_FragColor = vec4(uCouleur, uIntensite * f);
    }
  `,
});

const tache = new THREE.Mesh(tacheGeo, tacheMat);
tache.renderOrder = 2;
tache.visible = false;
scene.add(tache);

// Lueur portée sur le décor sous le faisceau.
const haloLight = new THREE.PointLight(0x3fb0ff, 0, 9, 2);
scene.add(haloLight);

// Maintien du clic = faisceau allumé, avec une durée mini pour un clic bref.
let haloActif = false;
let haloIntensite = 0;
let haloFin = 0; // timestamp (s) avant lequel on reste allumé malgré le relâché
addEventListener('pointerdown', (ev) => {
  if (ev.button !== undefined && ev.button !== 0) return;
  haloActif = true;
  haloFin = clock.elapsedTime + HALO_MIN;
});
addEventListener('pointerup', () => { haloActif = false; });
addEventListener('pointercancel', () => { haloActif = false; });
addEventListener('blur', () => { haloActif = false; });

new GLTFLoader().load('./assets/UFO.gltf', (gltf) => {
  const model = gltf.scene;

  // Recentre le modèle et le normalise à ~3 unités de large.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.scale.setScalar(3 / Math.max(size.x, size.z));

  // Matières mates : on remplace le PBR d'origine par du Lambert facetté,
  // en conservant la couleur de base et l'émission (hublots / faisceau).
  model.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = new THREE.MeshLambertMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xbfc6cc),
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity: src.emissiveIntensity ?? 1,
      flatShading: true,
      side: THREE.FrontSide,
      transparent: src.transparent,
      opacity: src.opacity,
    });
    o.castShadow = true;
  });

  // Mémorise les teintes d'origine : le clignotement de dégâts les remplace
  // temporairement puis les restitue.
  model.traverse((o) => {
    if (o.isMesh) ufoMats.push({ mat: o.material, base: o.material.color.clone() });
  });

  ufo.add(model);
  pret('ufo');
}, undefined, (err) => console.error('Chargement UFO.gltf échoué :', err));

// Encaissement des dégâts : rouge/rose clignotant, et immunité le temps que
// la soucoupe absorbe le coup (les missiles suivants ne comptent pas).
const ufoMats = [];
let ufoVie = UFO_VIE_MAX;
let ufoDetruit = false;

// Boucliers, en haut à gauche : un par vie restante. Celui qui saute s'efface.
const elVie = document.getElementById('vie');
const elBoucliers = [...document.querySelectorAll('.vie .bouclier')];

function majBarreVie() {
  const reste = Math.max(0, ufoVie);
  elBoucliers.forEach((b, i) => b.classList.toggle('perdu', i >= reste));
  elVie.classList.toggle('critique', reste === 1);
}
majBarreVie();

const ROUGE = new THREE.Color(0xff1f3d);
const ROSE = new THREE.Color(0xff8fb4);
const teinte = new THREE.Color();
let degatsJusqua = -1;

function encaisser() {
  if (ufoDetruit || victoire >= 0) return;
  if (clock.elapsedTime < degatsJusqua) return;   // déjà en train d'absorber
  degatsJusqua = clock.elapsedTime + DEGAT_DUREE;
  touches++;
  ufoVie--;
  majScore(false);
  majBarreVie();
  if (ufoVie <= 0) detruireUfo();
}

function detruireUfo() {
  arreterMusique(1.2);
  // Le lamento entre quand le banjo a fini de s'éteindre.
  setTimeout(jouerMariachi, 1400);
  exploser(ufoPivot.position, EXPL_TAILLE_G, EXPL_DUREE_G);
  secousse = SECOUSSE_DUR;
  ufoDetruit = true;
  ufoVie = 0;
  ufoPivot.visible = false;
  ombre.visible = false;
  halo.visible = false;
  tache.visible = false;
  haloLight.intensity = 0;
  majBarreVie();
  elVie.classList.remove('critique');
  document.querySelector('.hint').hidden = true;
  // L'écran de fin arrive une fois la boule de feu bien installée.
  setTimeout(() => { document.getElementById('gameover').hidden = false; }, 700);
}


function majDegats(t) {
  const reste = degatsJusqua - t;
  if (reste <= 0) {
    if (degatsJusqua !== -1) {                     // restitution des teintes
      for (const { mat, base } of ufoMats) mat.color.copy(base);
      degatsJusqua = -1;
    }
    return;
  }
  // Clignotement rapide entre rouge et rose, qui s'apaise en fin d'effet.
  const clign = 0.5 + 0.5 * Math.sin(t * 34);
  const force = Math.min(1, reste / DEGAT_DUREE * 1.4);
  teinte.copy(ROUGE).lerp(ROSE, clign);
  for (const { mat, base } of ufoMats) mat.color.copy(base).lerp(teinte, force);
}

// ----------------------------------------------------------------- animation
const precedente = new THREE.Vector3();
let spin = SPIN_IDLE;

function animate() {
  if (!demarre) { chauffer(); return; }   // rien n'est piloté avant le top départ

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (ufoDetruit) {                 // plus rien à piloter : la scène continue
    for (const tk of tanks) tk.jauge.visible = false;
    majSecousse(dt);
    majMissiles(dt);
    majExplosions(dt);
    renderer.render(scene, camera);
    return;
  }

  if (victoire >= 0) {              // la partie est gagnée : la soucoupe s'en va
    majVictoire(t, dt);
    majSecousse(dt);
    majMissiles(dt);
    majExplosions(dt);
    for (const tk of tanks) tk.jauge.visible = false;
    renderer.render(scene, camera);
    return;
  }

  // LERP indépendant du framerate vers la cible.
  precedente.copy(ufoPivot.position);
  const k = 1 - Math.pow(1 - LERP_FACTOR, dt * 60);
  ufoPivot.position.lerp(cible, k);

  // Altitude : hauteur de vol au-dessus du relief + flottement sinusoïdal.
  const sol = hauteur(ufoPivot.position.x, ufoPivot.position.z);
  ufoPivot.position.y = sol + FLY_HEIGHT + Math.sin(t * 1.6) * 0.18;

  // Inclinaison dans le sens du déplacement (effet "banking").
  const v = precedente.sub(ufoPivot.position).multiplyScalar(-1 / Math.max(dt, 1e-4));
  const vitesseUFO = Math.hypot(v.x, v.z);   // vitesse horizontale, en unités/s
  setVitesseUfo(vitesseUFO);                 // le bourdon s'ouvre avec la vitesse
  ufoTilt.rotation.z = THREE.MathUtils.lerp(ufoTilt.rotation.z, THREE.MathUtils.clamp(-v.x * 0.035, -0.35, 0.35), 0.08);
  ufoTilt.rotation.x = THREE.MathUtils.lerp(ufoTilt.rotation.x, THREE.MathUtils.clamp(v.z * 0.035, -0.35, 0.35), 0.08);

  // La soucoupe accélère avec la vitesse du curseur, puis retombe au repos.
  vitesseCurseur = Math.max(0, vitesseCurseur - vitesseCurseur * SPIN_DECAY * dt);
  const spinVoulu = Math.min(SPIN_IDLE + vitesseCurseur * SPIN_GAIN, SPIN_MAX);
  spin += (spinVoulu - spin) * (1 - Math.exp(-6 * dt));
  ufo.rotation.y += dt * spin;

  // --- halo bleu : intensité lissée, cône étiré de la soucoupe jusqu'au sol
  const haloVoulu = (haloActif || t < haloFin) ? 1 : 0;
  haloIntensite += (haloVoulu - haloIntensite) * (1 - Math.exp(-(haloVoulu ? 14 : 7) * dt));
  const haloOn = haloIntensite > 0.002;
  halo.visible = tache.visible = haloOn;

  if (haloOn !== zapEnCours) {
    zapEnCours = haloOn;
    if (haloOn) demarrerZap(); else arreterZap();
  }

  if (haloOn) {
    const hSol = hauteur(ufoPivot.position.x, ufoPivot.position.z);
    const hauteurCone = Math.max(ufoPivot.position.y - hSol - 0.25, 0.1);

    halo.position.set(ufoPivot.position.x, ufoPivot.position.y - 0.25, ufoPivot.position.z);
    halo.scale.set(RAYON_CONE * (0.55 + 0.45 * haloIntensite), hauteurCone, RAYON_CONE * (0.55 + 0.45 * haloIntensite));
    haloMat.uniforms.uTemps.value = t;
    haloMat.uniforms.uIntensite.value = haloIntensite;

    // Tache au sol : même rayon que la base du cône, plaquée sur le relief.
    const rT = RAYON_CONE * (0.55 + 0.45 * haloIntensite) * (1 + 0.06 * Math.sin(t * 9));
    // Les sommets sont calculés en décalage local : le mesh doit être placé
    // sous l'OVNI, sinon la tache reste plantée au centre de la map.
    tache.position.set(ufoPivot.position.x, 0, ufoPivot.position.z);
    const tp = tache.geometry.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const vx = TACHE_BASE[i * 3] * rT;
      const vz = TACHE_BASE[i * 3 + 2] * rT;
      tp.setX(i, vx); tp.setZ(i, vz);
      tp.setY(i, hauteur(ufoPivot.position.x + vx, ufoPivot.position.z + vz) + 0.06);
    }
    tp.needsUpdate = true;
    tache.geometry.computeBoundingSphere();
    tacheMat.uniforms.uIntensite.value = 0.75 * haloIntensite;

    haloLight.position.set(ufoPivot.position.x, hSol + 1.2, ufoPivot.position.z);
    haloLight.intensity = 14 * haloIntensite;
  } else {
    haloLight.intensity = 0;
  }

  // --- chars : ils manoeuvrent pour se mettre à portée, tourelle sur l'OVNI
  const limiteTank = demiEtendue - 4;
  let tanksVisibles = 0;
  const voixTanks = [];   // une entrée par blindé audible, pour le mixage
  for (const tk of tanks) {
    if (!tk.actif) {
      if (capturees >= seuilTank(tk)) tk.actif = true;   // son tour est venu
      else { tk.jauge.visible = false; continue; }
    }
    const ecran = versEcran(tk.racine.position);
    const auCadre = Math.abs(ecran.x) <= 1 && Math.abs(ecran.y) <= 1;
    if (auCadre) tanksVisibles++;
    // Même hors cadre, un blindé proche du bord s'entend : c'est le poids
    // calculé dans le module audio qui décide, pas une coupure franche.
    tk.ecranX = ecran.x;
    tk.ecranY = ecran.y;

    const p = tk.racine.position;
    let dx = ufoPivot.position.x - p.x;
    let dz = ufoPivot.position.z - p.z;
    let dist = Math.hypot(dx, dz);

    // Cap visé, corrigé pour contourner arbres, rochers et vaches.
    const capVise = Math.atan2(dx, dz) + eviterObstacles(tk, p);
    let dCap = capVise - tk.cap;
    dCap = Math.atan2(Math.sin(dCap), Math.cos(dCap));
    tk.cap += THREE.MathUtils.clamp(dCap, -TANK_ROT * dt, TANK_ROT * dt);

    const avant = new THREE.Vector2(Math.sin(tk.cap), Math.cos(tk.cap));

    // Hors de portée : il avance. Trop près : il recule. Le blindé ne se
    // déplace vraiment que s'il est à peu près face à sa cible.
    let marche = 0;
    if (dist > TANK_PORTEE) marche = 1;
    else if (dist < TANK_PORTEE * 0.6) marche = -0.6;
    // En contournement il conserve de l'élan : sinon il s'arrête net, de biais
    // face à l'arbre, et reste planté là.
    marche *= THREE.MathUtils.clamp(Math.cos(dCap), tk.evite ? 0.45 : 0, 1);

    // Séparation : deux chars ne se marchent pas dessus.
    let sx = 0, sz = 0;
    for (const autre of tanks) {
      if (autre === tk) continue;
      const ax = p.x - autre.racine.position.x;
      const az = p.z - autre.racine.position.z;
      const d2 = ax * ax + az * az;
      if (d2 > 0.01 && d2 < 25) { const d = Math.sqrt(d2); sx += ax / d; sz += az / d; }
    }

    voixTanks.push({ x: tk.ecranX, y: tk.ecranY, marche: Math.abs(marche) });

    if (marche !== 0 || sx || sz) {
      p.x = THREE.MathUtils.clamp(p.x + (avant.x * marche + sx * 0.6) * TANK_VIT * dt, -limiteTank, limiteTank);
      p.z = THREE.MathUtils.clamp(p.z + (avant.y * marche + sz * 0.6) * TANK_VIT * dt, -limiteTank, limiteTank);
    }
    p.y = hauteur(p.x, p.z);

    // Assiette : tangage et roulis lus sur la pente sous les chenilles.
    const e = 1.1;
    const hAv = hauteur(p.x + avant.x * e, p.z + avant.y * e);
    const hAr = hauteur(p.x - avant.x * e, p.z - avant.y * e);
    const droite = new THREE.Vector2(avant.y, -avant.x);
    const hD = hauteur(p.x + droite.x * e, p.z + droite.y * e);
    const hG = hauteur(p.x - droite.x * e, p.z - droite.y * e);
    tk.racine.rotation.y = tk.cap;
    tk.racine.rotation.x = -Math.atan2(hAv - hAr, 2 * e);
    tk.racine.rotation.z = Math.atan2(hD - hG, 2 * e);

    // Traînée : une par chenille, déposée de part et d'autre du châssis.
    for (let c = 0; c < 2; c++) {
      const sgn = c === 0 ? -1 : 1;
      majTrace(
        tk.traces[c],
        p.x + droite.x * 0.72 * sgn, p.z + droite.y * 0.72 * sgn,
        droite.x, droite.y, t,
      );
    }

    dx = ufoPivot.position.x - p.x;
    dz = ufoPivot.position.z - p.z;
    dist = Math.hypot(dx, dz);

    // Gisement dans le repère local du châssis (le tube pointe vers +Z).
    const visee = Math.atan2(dx, dz) - tk.cap;
    let delta = visee - tk.tourelle.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));   // chemin le plus court
    tk.tourelle.rotation.y += THREE.MathUtils.clamp(delta, -TOURELLE_VIT * dt, TOURELLE_VIT * dt);

    // Élévation : angle vers l'OVNI, borné, et lissé.
    const dy = ufoPivot.position.y - (p.y + tk.tourelle.position.y + tk.canon.position.y);
    const elev = THREE.MathUtils.clamp(Math.atan2(dy, dist), CANON_MIN, CANON_MAX);
    tk.canon.rotation.x = THREE.MathUtils.lerp(tk.canon.rotation.x, -elev, 1 - Math.exp(-5 * dt));

    // Jauge de rechargement : elle se remplit, puis s'efface une fois le coup
    // prêt à partir.
    const recharge = THREE.MathUtils.clamp((t - tk.rechargeDebut) / tk.rechargeDuree, 0, 1);
    tk.jauge.visible = recharge < 1;
    if (tk.jauge.visible) {
      tk.jauge.material.uniforms.uProgres.value = recharge;
      tk.jauge.material.uniforms.uAlpha.value = 0.9;
      tk.jauge.position.set(p.x, p.y + 2.4, p.z);
      tk.jauge.quaternion.copy(camera.quaternion);
    }

    // Tir : à portée, tourelle alignée, canon rechargé.
    if (dist <= TANK_PORTEE * 1.1 && Math.abs(delta) < TIR_ECART && t > tk.prochainTir) {
      tk.rechargeDuree = TIR_CADENCE * (0.75 + Math.random() * 0.5);
      tk.rechargeDebut = t;
      tk.prochainTir = t + tk.rechargeDuree;
      tk.bouche.getWorldPosition(depart);
      tk.bouche.getWorldDirection(axeTir);          // renvoie le +Z monde, soit l'axe du tube
      tirer(depart, axeTir);
      canon(tk.ecranX, tk.ecranY);
    }
  }
  // Le banjo s'emballe à mesure que les blindés entrent dans le cadre.
  setTensionMusique(tanks.length ? tanksVisibles / tanks.length : 0);
  // Moteurs et chenilles : une voix par blindé, la plus proche du centre du
  // cadre l'emporte. Les plus bruyants d'abord, les voix étant en nombre limité.
  voixTanks.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  majTanksAudio(voixTanks);

  majMissiles(dt);
  majExplosions(dt);
  majSecousse(dt);
  majDegats(t);
  majMulti();

  // --- vaches : broutage, ou abduction quand elles sont dans le faisceau
  const rFaisceau = haloOn ? RAYON_CONE * (0.55 + 0.45 * haloIntensite) : 0;
  let abductionEnCours = 0;
  for (const v of vachesGroup.children) {
    const d = v.userData;
    if (d.abduite) continue;

    const dans = haloOn &&
      (v.position.x - ufoPivot.position.x) ** 2 + (v.position.z - ufoPivot.position.z) ** 2 < rFaisceau * rFaisceau;

    if (dans) {
      // Le faisceau gagne du terrain par à-coups : la vache résiste, cède,
      // résiste à nouveau. L'amplitude dépend de la résistance de la bête.
      const lutte = 0.55 + 0.45 * Math.sin(t * 2.6 + d.phase);
      // Elle proteste, et recommence tant qu'elle monte.
      if (t > d.prochainMeuh && d.progres > 0.05) {
        mugir(d.gabarit, 0.9 + d.gabarit * 0.5);
        d.prochainMeuh = t + 1.5 + Math.random() * 0.6;
      }

      // Déplacer l'OVNI déstabilise la prise : il faut le tenir immobile.
      const frein = THREE.MathUtils.clamp(1 - vitesseUFO / VIT_RUPTURE, FREIN_MIN, 1);
      d.progres = Math.min(1, d.progres + d.aspiration * lutte * frein * dt);
    } else if (d.progres > 0) {
      d.progres = Math.max(0, d.progres - RETOMBEE * dt);   // elle retombe
    }

    const p = d.progres;
    if (p > abductionEnCours) abductionEnCours = p;
    if (p <= 0) {
      // Au repos : léger balancement de broutage, déphasé pour chaque vache.
      // La hauteur du sol est réévaluée : une vache retombée après une
      // abduction avortée a pu dériver vers l'axe du faisceau.
      d.y0 = hauteur(v.position.x, v.position.z);
      v.position.y = d.y0 + Math.sin(t * 1.1 + d.phase) * 0.02;
      v.rotation.set(Math.sin(t * 0.9 + d.phase) * 0.02, d.yaw0, 0);
      if (d.jauge.visible) { d.jauge.visible = false; }
      continue;
    }

    // Montée en entonnoir : elle glisse vers l'axe du cône en s'élevant.
    const cible = ufoPivot.position.y - 0.6;
    const k2 = Math.pow(p, 1.5);
    v.position.y = d.y0 + (cible - d.y0) * k2;
    v.position.x += (ufoPivot.position.x - v.position.x) * Math.min(1, p * 1.6 * dt * 6);
    v.position.z += (ufoPivot.position.z - v.position.z) * Math.min(1, p * 1.6 * dt * 6);

    // Elle tournoie et se met à l'horizontale, de plus en plus vite.
    v.rotation.y = d.yaw0 + p * p * 26;
    v.rotation.z = Math.sin(t * 5 + d.phase) * 0.5 * p;
    v.rotation.x = Math.sin(t * 4.2 + d.phase) * 0.35 * p - p * 0.4;

    // Jauge d'abduction : posée dans la scène, donc insensible au tournoiement
    // de la vache, et toujours de face (billboard sur la caméra).
    const j = d.jauge;
    j.visible = true;
    j.material.uniforms.uProgres.value = p;
    j.material.uniforms.uAlpha.value = Math.min(1, p * 6);
    j.position.set(v.position.x, v.position.y + j.userData.hauteur, v.position.z);
    j.quaternion.copy(camera.quaternion);

    if (p >= 1) {                              // aspirée : elle disparaît
      d.abduite = true;
      v.visible = false;
      j.visible = false;
      capturees++;
      // Valeur de la bête, pondérée par la rapidité et les dégâts encaissés.
      const gagne = Math.max(1, Math.round(d.points * multiplicateur()));
      points += gagne;
      majScore(true, gagne);
      majRecherche();
      if (!vachesGroup.children.some((c) => !c.userData.abduite)) declencherVictoire(t);
    }
  }

  // Le zap monte dans les aigus à mesure que la bête décolle.
  if (zapEnCours) setZapProgression(abductionEnCours);

  // Ombre au sol : le disque est replaqué sur le relief, sommet par sommet,
  // pour rester entièrement visible même sur une bosse ou une pente.
  const alt = ufoPivot.position.y - sol;
  const ech = THREE.MathUtils.clamp(5.2 / alt, 0.6, 1.6);
  ombre.position.set(ufoPivot.position.x, 0, ufoPivot.position.z);

  const op = ombre.geometry.attributes.position;
  for (let i = 0; i < op.count; i++) {
    const vx = OMBRE_BASE[i * 3] * ech;
    const vz = OMBRE_BASE[i * 3 + 2] * ech;
    op.setX(i, vx);
    op.setZ(i, vz);
    op.setY(i, hauteur(ufoPivot.position.x + vx, ufoPivot.position.z + vz) + 0.05);
  }
  op.needsUpdate = true;
  ombre.geometry.computeBoundingSphere();

  ombre.material.opacity = THREE.MathUtils.clamp(0.28 * (4.6 / alt), 0.08, 0.3);

  renderer.render(scene, camera);
}
const elSon = document.getElementById('son');

function majBoutonSon(actif) {
  elSon.textContent = actif ? '🔊' : '🔇';
  elSon.title = actif ? 'Couper le son' : 'Rétablir le son';
  elSon.setAttribute('aria-pressed', String(!actif));
}

elSon.addEventListener('click', () => {
  majBoutonSon(basculerSon());
  elSon.blur();      // sinon la barre d'espace rejouerait le clic
});

// Raccourci clavier M, comme dans la plupart des jeux.
addEventListener('keydown', (ev) => {
  if (ev.key === 'm' || ev.key === 'M') majBoutonSon(basculerSon());
});

// Rejouer sans recharger la page : le monde est reconstruit et les compteurs
// remis à zéro. On repart directement en jeu, sans repasser par l'écran-titre.
function nouvellePartie() {
  // --- écrans de fin
  document.getElementById('gameover').hidden = true;
  const fin = document.getElementById('fin');
  fin.hidden = true;
  fin.classList.remove('affiche');
  fin.style.setProperty('--noir', 0);
  document.querySelector('.hint').hidden = false;

  // --- compteurs
  points = 0;
  capturees = 0;
  touches = 0;
  etoiles = 1;
  elEtoiles.forEach((e, i) => {
    e.classList.remove('neuve');
    e.classList.toggle('acquise', i === 0);
  });

  // --- soucoupe
  ufoVie = UFO_VIE_MAX;
  ufoDetruit = false;
  degatsJusqua = -1;
  for (const { mat, base } of ufoMats) mat.color.copy(base);
  ufoPivot.visible = true;
  ufoPivot.scale.setScalar(1);
  ufoPivot.position.set(0, 0, 0);
  ufoTilt.rotation.set(0, 0, 0);
  cible.set(0, 0, 0);
  ombre.visible = true;
  elVie.classList.remove('critique');

  // --- faisceau
  haloActif = false;
  haloIntensite = 0;
  haloFin = 0;
  halo.visible = false;
  tache.visible = false;
  haloLight.intensity = 0;
  if (zapEnCours) { arreterZap(); zapEnCours = false; }

  // --- projectiles et effets en vol
  for (const m of missiles) missilesGroup.remove(m.mesh);
  missiles.length = 0;
  for (const e of explosions) {
    e.sprite.material.map.dispose();
    e.sprite.material.dispose();
    explosionsGroup.remove(e.sprite);
  }
  explosions.length = 0;

  // --- état de fin de partie
  victoire = -1;
  victoirePos = null;
  secousse = 0;
  camera.position.copy(cameraBase);

  // --- le monde : nouveau troupeau, nouveaux blindés, même relief
  construireSol();

  majScore(false);
  majBarreVie();
  majMulti();

  clock.start();          // chrono et multiplicateur repartent de zéro
  reprendreMusique();
  setTensionMusique(0);
  demarre = true;
}

for (const b of document.querySelectorAll('.rejouer')) {
  b.addEventListener('click', nouvellePartie);
}

renderer.setAnimationLoop(animate);
