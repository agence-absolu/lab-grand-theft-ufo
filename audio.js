// Bande-son complète, synthétisée en direct — aucun fichier audio.
//
//   1. le banjo bluegrass, qui s'emballe avec l'arrivée des blindés ;
//   2. un bourdon soucoupe à trémolo, qui s'intensifie quand l'OVNI file ;
//   3. le zap du faisceau, dont la hauteur monte avec l'avancement de l'abduction.
//
// Le banjo est obtenu par Karplus-Strong : une salve de bruit circule dans une
// ligne à retard de la longueur d'une période, filtrée à chaque tour. C'est le
// modèle physique d'une corde pincée, et il tient en une vingtaine de lignes.
// Chaque hauteur est calculée une fois puis réutilisée.

const BPM_LENT = 92;      // aucun blindé en vue : roulement tranquille
const BPM_VIF = 210;      // toute la cavalerie à l'écran : ça déboule
const LISSAGE = 0.035;    // douceur de la montée en régime, par tick d'horloge
const VOLUME = 0.22;

// Accords en fréquences (Hz). Voicings aigus, comme un banjo capodastré.
const SOL = [196.00, 246.94, 293.66, 392.00, 493.88];
const DO = [261.63, 329.63, 392.00, 523.25, 659.25];
const RE = [293.66, 369.99, 440.00, 587.33, 739.99];

const GRILLE = [
  { accord: SOL, basse: 98.00 },
  { accord: SOL, basse: 98.00 },
  { accord: DO, basse: 130.81 },
  { accord: DO, basse: 130.81 },
  { accord: SOL, basse: 98.00 },
  { accord: RE, basse: 146.83 },
  { accord: SOL, basse: 98.00 },
  { accord: SOL, basse: 98.00 },
];

// Roulement avant : pouce, index, majeur. Le 5e doigt (index 3) fait bourdon.
const ROULEMENT = [0, 1, 2, 3, 1, 2, 3, 4, 0, 1, 2, 3, 2, 3, 4, 3];

let ctx = null;
let maitre = null;
// Bus séparés : le zap doit pouvoir passer au-dessus du reste, et le reste
// s'effacer sous lui (sidechain à l'ancienne).
let busBanjo = null, busDrone = null, busZap = null, busSfx = null, busTanks = null;
// Tout ce qui peut s'effacer devant une explosion passe par là.
let busAmbiance = null;
let ambianceCoupee = false;      // vrai une fois la partie terminée
const NIV_BANJO = 0.62;   // le banjo reste un fond, pas le sujet
const DUCK_BANJO = 0.6;   // niveau relatif du banjo pendant le tir
const DUCK_DRONE = 0.55;
let minuteur = null;
let prochaineNote = 0;
let pas = 0;              // double-croche courante dans la grille
let bpm = BPM_LENT;
let bpmCible = BPM_LENT;
let coupe = false;

const cordes = new Map();

function corde(freq) {
  const cle = Math.round(freq * 10);
  if (cordes.has(cle)) return cordes.get(cle);

  const sr = ctx.sampleRate;
  const n = Math.max(2, Math.round(sr / freq));
  const duree = 0.9;
  const buffer = ctx.createBuffer(1, Math.ceil(sr * duree), sr);
  const sortie = buffer.getChannelData(0);

  const ligne = new Float32Array(n);
  for (let i = 0; i < n; i++) ligne[i] = Math.random() * 2 - 1;

  // amortissement élevé + filtrage léger = timbre métallique et claquant,
  // la signature du banjo face à une guitare.
  const amort = 0.994;
  const doux = 0.28;
  let idx = 0;
  let prec = 0;

  for (let i = 0; i < sortie.length; i++) {
    const v = ligne[idx];
    ligne[idx] = amort * ((1 - doux) * v + doux * prec);
    prec = v;
    sortie[i] = v * Math.exp((-i / sr) * 3.2);   // décroissance du pincement
    idx = (idx + 1) % n;
  }

  cordes.set(cle, buffer);
  return buffer;
}

function pincer(freq, temps, gain) {
  const src = ctx.createBufferSource();
  src.buffer = corde(freq);
  src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.004;   // micro-désaccord

  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(busBanjo);
  src.start(temps);
  src.stop(temps + 0.9);
}

function contrebasse(freq, temps) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, temps);
  g.gain.exponentialRampToValueAtTime(0.5, temps + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, temps + 0.28);

  osc.connect(g).connect(busBanjo);
  osc.start(temps);
  osc.stop(temps + 0.3);
}

// Frappe de pied / claquement de mains sur les temps faibles.
function frappe(temps) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.ceil(sr * 0.06), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp((-i / sr) * 60);
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filtre = ctx.createBiquadFilter();
  filtre.type = 'bandpass';
  filtre.frequency.value = 1900;
  filtre.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0.35;

  src.connect(filtre).connect(g).connect(busBanjo);
  src.start(temps);
}

function programmer(temps) {
  const mesure = Math.floor(pas / 16) % GRILLE.length;
  const dans = pas % 16;
  const { accord, basse } = GRILLE[mesure];

  // Le roulement de banjo, une double-croche après l'autre.
  const note = accord[ROULEMENT[dans] % accord.length];
  const accent = dans % 4 === 0 ? 0.42 : 0.26;
  pincer(note, temps, accent);

  if (dans % 8 === 0) contrebasse(basse, temps);                  // temps 1 et 3
  if (dans === 4 || dans === 12) frappe(temps);                   // temps 2 et 4
  if (dans === 14 && Math.random() < 0.4) {                       // petite fioriture
    pincer(accord[4] * 2, temps + 0.02, 0.18);
  }

  pas++;
}

function boucle() {
  // Le tempo glisse vers sa cible plutôt que de sauter : l'accélération
  // s'entend comme un emballement, pas comme un changement de morceau.
  bpm += (bpmCible - bpm) * LISSAGE;

  const croche = 15 / bpm;     // durée d'une double-croche
  while (prochaineNote < ctx.currentTime + 0.12) {
    programmer(prochaineNote);
    prochaineNote += croche;
  }
}

// ------------------------------------------------------- bourdon de soucoupe
// Thérémine : une porteuse sinus, un vibrato qui lui tord la hauteur, et un
// trémolo qui hache l'amplitude. Les trois s'ouvrent avec la vitesse de l'engin.
const DRONE_HZ = [190, 300];        // hauteur au repos / à pleine vitesse
const DRONE_VOL = [0.015, 0.11];
const VIBRATO_HZ = [4.5, 7.5];
const VIBRATO_PROF = [4, 30];       // en Hz d'excursion
const TREMOLO_HZ = [6, 17];
const TREMOLO_PROF = [0.25, 0.85];
const VITESSE_REF = 11;             // vitesse OVNI (u/s) considérée comme "à fond"

let porteuse = null, droneGain = null, vibratoOsc = null, vibratoProf = null;
let tremoloOsc = null, tremoloProf = null;

function construireDrone() {
  porteuse = ctx.createOscillator();
  porteuse.type = 'sine';
  porteuse.frequency.value = DRONE_HZ[0];

  // Un peu de corps : une quinte discrète sous la porteuse.
  const sous = ctx.createOscillator();
  sous.type = 'triangle';
  sous.frequency.value = DRONE_HZ[0] / 2;
  const sousGain = ctx.createGain();
  sousGain.gain.value = 0.35;

  vibratoOsc = ctx.createOscillator();
  vibratoOsc.frequency.value = VIBRATO_HZ[0];
  vibratoProf = ctx.createGain();
  vibratoProf.gain.value = VIBRATO_PROF[0];
  vibratoOsc.connect(vibratoProf);
  vibratoProf.connect(porteuse.frequency);
  vibratoProf.connect(sous.frequency);

  droneGain = ctx.createGain();
  droneGain.gain.value = DRONE_VOL[0];

  // Le trémolo s'additionne au gain de base : il le fait respirer sans le couper.
  tremoloOsc = ctx.createOscillator();
  tremoloOsc.frequency.value = TREMOLO_HZ[0];
  tremoloProf = ctx.createGain();
  tremoloProf.gain.value = DRONE_VOL[0] * TREMOLO_PROF[0];
  tremoloOsc.connect(tremoloProf);
  tremoloProf.connect(droneGain.gain);

  const filtre = ctx.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 1400;

  porteuse.connect(droneGain);
  sous.connect(sousGain).connect(droneGain);
  droneGain.connect(filtre).connect(busDrone);

  for (const o of [porteuse, sous, vibratoOsc, tremoloOsc]) o.start();
}

const entre = (bornes, t) => bornes[0] + (bornes[1] - bornes[0]) * t;

// Vitesse horizontale de l'OVNI, en unités/s.
export function setVitesseUfo(vitesse) {
  if (!ctx) return;
  const t = Math.min(1, Math.max(0, vitesse / VITESSE_REF));
  const maintenant = ctx.currentTime;
  const lisse = (param, valeur) => param.setTargetAtTime(valeur, maintenant, 0.12);

  lisse(porteuse.frequency, entre(DRONE_HZ, t));
  lisse(droneGain.gain, entre(DRONE_VOL, t));
  lisse(vibratoOsc.frequency, entre(VIBRATO_HZ, t));
  lisse(vibratoProf.gain, entre(VIBRATO_PROF, t));
  lisse(tremoloOsc.frequency, entre(TREMOLO_HZ, t));
  lisse(tremoloProf.gain, entre(DRONE_VOL, t) * entre(TREMOLO_PROF, t));
}

// ------------------------------------------------------------ zap du faisceau
// Dent de scie passée dans un filtre en cloche très résonant, haché par un
// oscillateur rapide : le grésillement de pistolet laser. La hauteur monte avec
// l'avancement de l'abduction.
const ZAP_HZ = [240, 1500];         // hauteur à 0 % et à 100 % d'abduction
const ZAP_HACHE = [22, 46];         // fréquence du hachage
const ZAP_VOL = 0.26;        // volume de premier plan

let zapOsc = null, zapFiltre = null, zapGain = null, zapPorte = null;
let zapHacheOsc = null, zapHacheProf = null;

function construireZap() {
  zapOsc = ctx.createOscillator();
  zapOsc.type = 'sawtooth';
  zapOsc.frequency.value = ZAP_HZ[0];

  zapFiltre = ctx.createBiquadFilter();
  zapFiltre.type = 'bandpass';
  zapFiltre.frequency.value = ZAP_HZ[0] * 3;
  zapFiltre.Q.value = 9;

  zapGain = ctx.createGain();      // hachage
  zapGain.gain.value = 0.5;

  zapHacheOsc = ctx.createOscillator();
  zapHacheOsc.type = 'square';
  zapHacheOsc.frequency.value = ZAP_HACHE[0];
  zapHacheProf = ctx.createGain();
  zapHacheProf.gain.value = 0.5;
  zapHacheOsc.connect(zapHacheProf).connect(zapGain.gain);

  zapPorte = ctx.createGain();     // ouverture/fermeture au clic
  zapPorte.gain.value = 0;

  // Bosse de présence : c'est cette bande qui fait passer le laser devant le
  // banjo, plutôt qu'un simple coup de volume qui saturerait le mixage.
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 2600;
  presence.Q.value = 1.1;
  presence.gain.value = 9;

  zapOsc.connect(zapFiltre).connect(zapGain).connect(presence).connect(zapPorte).connect(busZap);
  zapOsc.start();
  zapHacheOsc.start();
}

function esquiver(actif) {
  const t = ctx.currentTime;
  busBanjo.gain.setTargetAtTime(NIV_BANJO * (actif ? DUCK_BANJO : 1), t, actif ? 0.03 : 0.25);
  busDrone.gain.setTargetAtTime(actif ? DUCK_DRONE : 1, t, actif ? 0.03 : 0.25);
}

export function demarrerZap() {
  if (!ctx) return;
  zapPorte.gain.cancelScheduledValues(ctx.currentTime);
  zapPorte.gain.setTargetAtTime(ZAP_VOL, ctx.currentTime, 0.015);
  esquiver(true);      // le banjo et le bourdon reculent d'un pas
}

export function arreterZap() {
  if (!ctx) return;
  zapPorte.gain.cancelScheduledValues(ctx.currentTime);
  zapPorte.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  esquiver(false);     // et reviennent en douceur
}

// Progression de l'abduction en cours, de 0 à 1.
export function setZapProgression(p) {
  if (!ctx) return;
  const t = Math.min(1, Math.max(0, p));
  const maintenant = ctx.currentTime;
  const f = entre(ZAP_HZ, t * t);          // la montée se sent surtout sur la fin
  zapOsc.frequency.setTargetAtTime(f, maintenant, 0.06);
  zapFiltre.frequency.setTargetAtTime(f * 3, maintenant, 0.06);
  zapHacheOsc.frequency.setTargetAtTime(entre(ZAP_HACHE, t), maintenant, 0.06);
}

// ----------------------------------------------------------- mugissement
// Voix animale : une dent de scie à l'enveloppe de hauteur caractéristique
// (« mmMOOoo »), passée dans deux formants. Une grosse vache a un conduit vocal
// plus long : fondamentale et formants descendent tous les deux avec le gabarit.
const MEUH_HZ = [185, 88];        // petite vache -> grosse vache
const MEUH_VOL = 0.34;            // au premier plan : c'est la vache qu'on veut entendre

export function mugir(gabarit = 0.5, duree = 1.1) {
  if (!ctx) return;
  const g = Math.min(1, Math.max(0, gabarit));
  const f = entre(MEUH_HZ, g);
  const t0 = ctx.currentTime;
  const fin = t0 + duree;

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  // Le contour typique : attaque étouffée, montée, puis chute traînante.
  osc.frequency.setValueAtTime(f * 0.82, t0);
  osc.frequency.linearRampToValueAtTime(f * 1.12, t0 + duree * 0.18);
  osc.frequency.setTargetAtTime(f * 0.74, t0 + duree * 0.3, duree * 0.45);

  const vib = ctx.createOscillator();
  vib.frequency.value = 5.2 + Math.random();
  const vibProf = ctx.createGain();
  vibProf.gain.value = f * 0.02;
  vib.connect(vibProf).connect(osc.frequency);

  // Formants : plus le gabarit est gros, plus ils sont bas.
  const echelle = 1.12 - 0.34 * g;
  const sortie = ctx.createGain();
  for (const [freq, q, niveau] of [[520, 7, 1], [1080, 9, 0.55]]) {
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = freq * echelle;
    bf.Q.value = q;
    const bg = ctx.createGain();
    bg.gain.value = niveau;
    osc.connect(bf).connect(bg).connect(sortie);
  }

  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 2300;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(MEUH_VOL, t0 + 0.09);
  env.gain.setValueAtTime(MEUH_VOL, t0 + duree * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, fin);

  sortie.connect(doux).connect(env).connect(busSfx);
  osc.start(t0); osc.stop(fin + 0.05);
  vib.start(t0); vib.stop(fin + 0.05);
}

// ------------------------------------------------- moteurs et chenilles
// Une voix par blindé, pondérée par sa distance au centre du cadre et placée
// dans le stéréo selon sa position à l'écran : un char qui traverse passe d'une
// oreille à l'autre, et celui qu'on a sous le nez couvre les autres.
const VOIX_TANKS = 8;             // au-delà, les blindés se partagent les voix
const TANK_VOL = 0.14;            // plafond par voix
const MOTEUR_HZ = [74, 108];      // ralenti -> à plein régime
const CHUG_HZ = [7, 13];          // cadence du moteur
const CLIQUETIS_HZ = [9, 19];     // cadence des chenilles

// Équilibre interne : les chenilles devant, le moteur en soutien.
const NIV_MOTEUR = 0.32;
const NIV_RUGUEUX = 0.1;
const NIV_CHENILLE = 0.85;

let bruitTank = null;
const voixTanks = [];

function bufferBruit() {
  if (bruitTank) return bruitTank;
  const sr = ctx.sampleRate;
  bruitTank = ctx.createBuffer(1, sr * 2, sr);
  const d = bruitTank.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return bruitTank;
}

function creerVoixTank() {
  const sortie = ctx.createGain();
  sortie.gain.value = 0;

  const pan = ctx.createStereoPanner();
  sortie.connect(pan).connect(busTanks);

  // --- diesel : fondamentale audible + rugosité à l'octave
  const moteur = ctx.createOscillator();
  moteur.type = 'sawtooth';
  moteur.frequency.value = MOTEUR_HZ[0];
  const grave = ctx.createBiquadFilter();
  grave.type = 'lowpass';
  grave.frequency.value = 520;
  grave.Q.value = 4;
  const moteurGain = ctx.createGain();
  moteurGain.gain.value = NIV_MOTEUR;

  const rugueux = ctx.createOscillator();
  rugueux.type = 'square';
  rugueux.frequency.value = MOTEUR_HZ[0] * 2;
  const bande = ctx.createBiquadFilter();
  bande.type = 'bandpass';
  bande.frequency.value = 620;
  bande.Q.value = 1.2;
  const rugueuxGain = ctx.createGain();
  rugueuxGain.gain.value = NIV_RUGUEUX;

  // Trémolo commun aux deux couches : c'est le même moteur qui pétarade.
  const chug = ctx.createOscillator();
  chug.type = 'sawtooth';
  chug.frequency.value = CHUG_HZ[0];
  const chugProf = ctx.createGain();
  chugProf.gain.value = NIV_MOTEUR * 0.55;
  chug.connect(chugProf);
  chugProf.connect(moteurGain.gain);
  chugProf.connect(rugueuxGain.gain);

  moteur.connect(grave).connect(moteurGain).connect(sortie);
  rugueux.connect(bande).connect(rugueuxGain).connect(sortie);

  // --- chenilles : bruit filtré, résonance de tôle, cliquetis des maillons
  const src = ctx.createBufferSource();
  src.buffer = bufferBruit();
  src.loop = true;
  src.loopStart = Math.random() * 1.5;   // décalage : deux chars ne cliquettent
  src.loopEnd = 2;                       // pas en phase

  const metal = ctx.createBiquadFilter();
  metal.type = 'bandpass';
  metal.frequency.value = 2400;
  metal.Q.value = 1.6;

  const tole = ctx.createDelay(0.05);
  tole.delayTime.value = 0.0035;
  const retour = ctx.createGain();
  retour.gain.value = 0.55;
  metal.connect(tole).connect(retour).connect(tole);

  const chenilleGain = ctx.createGain();
  chenilleGain.gain.value = NIV_CHENILLE;

  const cliq = ctx.createOscillator();
  cliq.type = 'square';
  cliq.frequency.value = CLIQUETIS_HZ[0];
  const cliqProf = ctx.createGain();
  cliqProf.gain.value = NIV_CHENILLE * 0.45;
  cliq.connect(cliqProf).connect(chenilleGain.gain);

  src.connect(metal);
  metal.connect(chenilleGain);
  tole.connect(chenilleGain);
  chenilleGain.connect(sortie);

  for (const o of [moteur, rugueux, chug, cliq]) o.start();
  src.start(0, Math.random() * 2);

  return { sortie, pan, moteur, rugueux, chug, cliq };
}

function construireTanks() {
  for (let i = 0; i < VOIX_TANKS; i++) voixTanks.push(creerVoixTank());
}

// liste : un objet par blindé audible, { x, y, marche }
//   x, y   position à l'écran en coordonnées normalisées (-1..1), centre = 0
//   marche 0 au ralenti, 1 en pleine manoeuvre
export function majTanksAudio(liste) {
  if (!ctx) return;
  const maintenant = ctx.currentTime;

  for (let i = 0; i < VOIX_TANKS; i++) {
    const v = voixTanks[i];
    const t = liste[i];

    if (!t) {                                  // voix inutilisée : on la ferme
      v.sortie.gain.setTargetAtTime(0, maintenant, 0.3);
      continue;
    }

    // Poids : 1 au centre du cadre, 0 au-delà du bord. La puissance 1.6 creuse
    // l'écart pour que le blindé proche domine nettement les lointains.
    const r = Math.hypot(t.x, t.y);
    const poids = Math.pow(Math.max(0, 1 - r / 1.25), 1.6);
    const regime = 0.4 + 0.6 * Math.min(1, Math.max(0, t.marche));

    v.sortie.gain.setTargetAtTime(TANK_VOL * poids * regime, maintenant, 0.22);
    v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, t.x)) * 0.75, maintenant, 0.22);

    const f = entre(MOTEUR_HZ, Math.min(1, Math.max(0, t.marche)));
    v.moteur.frequency.setTargetAtTime(f, maintenant, 0.3);
    v.rugueux.frequency.setTargetAtTime(f * 2, maintenant, 0.3);
    v.chug.frequency.setTargetAtTime(entre(CHUG_HZ, t.marche), maintenant, 0.3);
    v.cliq.frequency.setTargetAtTime(entre(CLIQUETIS_HZ, t.marche), maintenant, 0.3);
  }
}

// ------------------------------------------------------ canon et explosions
// Une détonation, c'est trois choses empilées : un coup de pression dans le
// grave (sinus qui plonge), un claquement (bruit filtré haut, très court) et un
// souffle (bruit qui s'éteint en se refermant dans le grave).
const CANON_VOL = 0.34;
const EXPLO_VOL = 1.15;      // dramatiquement au-dessus du reste

// Même pondération que les moteurs : au centre du cadre c'est un coup de poing,
// au bord un écho lointain.
function poidsEcran(x, y) {
  return Math.pow(Math.max(0, 1 - Math.hypot(x, y) / 1.4), 1.4);
}

function bruitSource(duree) {
  const src = ctx.createBufferSource();
  src.buffer = bufferBruit();
  src.loop = true;
  src.loopEnd = 2;
  return src;
}

function detonation(x, y, force, opts) {
  if (!ctx) return;
  const poids = poidsEcran(x, y);
  if (poids < 0.02) return;                 // hors champ : inutile de le jouer

  const t0 = ctx.currentTime;
  const d = opts.duree;
  const vol = opts.volume * poids;

  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, x)) * 0.7;
  pan.connect(busSfx);

  // 1. le coup de pression
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(opts.subHaut, t0);
  sub.frequency.exponentialRampToValueAtTime(opts.subBas, t0 + d * 0.6);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(vol * 0.9, t0);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + d * 0.8);
  sub.connect(subGain).connect(pan);
  sub.start(t0); sub.stop(t0 + d);

  // 2. le claquement
  const clac = bruitSource();
  const haut = ctx.createBiquadFilter();
  haut.type = 'highpass';
  haut.frequency.value = 1100;
  const clacGain = ctx.createGain();
  clacGain.gain.setValueAtTime(vol * opts.claquement, t0);
  clacGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  clac.connect(haut).connect(clacGain).connect(pan);
  clac.start(t0, Math.random() * 1.5); clac.stop(t0 + 0.12);

  // 3. le souffle, qui se referme dans le grave en s'éteignant
  const souffle = bruitSource();
  const bas = ctx.createBiquadFilter();
  bas.type = 'lowpass';
  bas.frequency.setValueAtTime(opts.souffleHaut, t0);
  bas.frequency.exponentialRampToValueAtTime(220, t0 + d);
  const souffleGain = ctx.createGain();
  souffleGain.gain.setValueAtTime(0.0001, t0);
  souffleGain.gain.exponentialRampToValueAtTime(vol * 0.8, t0 + 0.02);
  souffleGain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  souffle.connect(bas).connect(souffleGain).connect(pan);
  souffle.start(t0, Math.random() * 1.5); souffle.stop(t0 + d + 0.05);
}

// Départ de coup : un « piou » de pistolet en plastique. Toute la recette tient
// dans le glissando descendant très rapide — c'est lui qui fait le jouet, pas
// l'explosion.
export function canon(x, y) {
  if (!ctx) return;
  const poids = poidsEcran(x, y);
  if (poids < 0.02) return;

  const t0 = ctx.currentTime;
  const d = 0.22;
  const vol = CANON_VOL * poids;
  const aigu = 1700 + Math.random() * 400;   // chaque tir a sa petite couleur

  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, x)) * 0.7;
  pan.connect(busSfx);

  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 4200;               // plastique, pas métal
  doux.connect(pan);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  env.connect(doux);

  // Deux voix légèrement désaccordées : le petit côté criard du jouet.
  for (const [type, detune, niveau] of [['triangle', 1, 1], ['square', 1.005, 0.25]]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(aigu * detune, t0);
    osc.frequency.exponentialRampToValueAtTime(300 * detune, t0 + d * 0.8);
    const g = ctx.createGain();
    g.gain.value = niveau;
    osc.connect(g).connect(env);
    osc.start(t0);
    osc.stop(t0 + d + 0.02);
  }
}

// Le reste de la bande-son plonge sous la déflagration, puis remonte.
function ecraserAmbiance(force) {
  if (ambianceCoupee) return;    // l'ambiance est déjà éteinte, rien à écraser
  const t = ctx.currentTime;
  const creux = 1 - 0.72 * force;
  busAmbiance.gain.cancelScheduledValues(t);
  busAmbiance.gain.setTargetAtTime(creux, t, 0.02);
  busAmbiance.gain.setTargetAtTime(1, t + 0.25 + force * 0.4, 0.35);
}

// Explosion : plus grave et plus longue à mesure que la charge est grosse.
export function explosion(x, y, force = 0.4) {
  if (!ctx) return;
  const f = Math.min(1, Math.max(0.2, force));
  if (poidsEcran(x, y) > 0.15) ecraserAmbiance(f);
  detonation(x, y, f, {
    duree: 0.5 + f * 1.3,
    volume: EXPLO_VOL * (0.55 + 0.45 * f),
    subHaut: 120 - 40 * f,
    subBas: 28,
    claquement: 0.5,
    souffleHaut: 2600 - 900 * f,
  });
}

// --------------------------------------------------------- mariachi funèbre
// Chœur de trompettes : dent de scie dans un formant cuivre, gonflement à
// l'attaque, et surtout un trémolo prononcé — la signature du mariachi.
const TROMPETTE_VOL = 0.3;

function trompette(freq, t0, duree, niveau = 1, finPlaintive = false) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, t0);
  // La dernière note s'affaisse longuement : le soupir de fin de morceau.
  if (finPlaintive) {
    osc.frequency.setValueAtTime(freq, t0 + duree * 0.34);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.58, t0 + duree);
  }

  const vib = ctx.createOscillator();
  vib.frequency.value = 5.1;
  const vibProf = ctx.createGain();
  vibProf.gain.value = freq * 0.012;
  vib.connect(vibProf).connect(osc.frequency);

  // Formant cuivre + ouverture du filtre à l'attaque : le son « s'allume ».
  const cuivre = ctx.createBiquadFilter();
  cuivre.type = 'bandpass';
  cuivre.frequency.setValueAtTime(700, t0);
  cuivre.frequency.linearRampToValueAtTime(1350, t0 + 0.18);
  cuivre.Q.value = 1.8;

  const corps = ctx.createBiquadFilter();
  corps.type = 'lowpass';
  corps.frequency.value = 4200;

  // Le fondu final est long ; les autres notes gardent leur plateau habituel.
  const debutFondu = duree * (finPlaintive ? 0.34 : 0.75);

  const env = ctx.createGain();
  const vol = TROMPETTE_VOL * niveau;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(vol, t0 + 0.14);       // gonflement
  env.gain.setValueAtTime(vol, t0 + debutFondu);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);

  // Trémolo : c'est lui qui fait le mariachi.
  const trem = ctx.createOscillator();
  trem.frequency.value = 6.6;
  const tremProf = ctx.createGain();
  tremProf.gain.value = vol * 0.42;
  trem.connect(tremProf).connect(env.gain);

  // Le trémolo s'ajoute au gain : sans le refermer, il continuerait à réinjecter
  // du signal alors que la note est censée s'être éteinte — et le fondu ne
  // finirait jamais. Il ralentit aussi, comme un souffle qui s'épuise.
  tremProf.gain.setValueAtTime(vol * 0.42, t0 + debutFondu);
  tremProf.gain.linearRampToValueAtTime(0.0001, t0 + duree);
  if (finPlaintive) {
    trem.frequency.setValueAtTime(6.6, t0 + debutFondu);
    trem.frequency.linearRampToValueAtTime(3.8, t0 + duree);
  }

  osc.connect(cuivre).connect(corps).connect(env).connect(busSfx);
  for (const o of [osc, vib, trem]) { o.start(t0); o.stop(t0 + duree + 0.1); }
}

// Trois accords en la mineur : i - V - i, joués lentement. Le classique lamento.
export function jouerMariachi() {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  const accords = [
    { notes: [220.00, 261.63, 329.63], duree: 1.7 },   // Am
    { notes: [164.81, 207.65, 246.94], duree: 1.7 },   // E  (dominante)
    { notes: [220.00, 261.63, 329.63], duree: 5.4 },   // Am, avec le long soupir
  ];

  let t = t0;
  accords.forEach((accord, i) => {
    const dernier = i === accords.length - 1;
    accord.notes.forEach((f, j) => {
      // Les voix entrent en léger décalage : un vrai pupitre n'attaque jamais
      // parfaitement ensemble.
      trompette(f, t + j * 0.035, accord.duree, j === 0 ? 1 : 0.7, dernier);
    });
    t += accord.duree * 0.92;      // les accords se chevauchent un peu
  });
}

// Le contexte audio ne peut s'ouvrir que sur un geste de l'utilisateur. On tente
// quand même tout de suite : si le navigateur refuse, le premier clic ou la
// première touche le réveille.
function reveillerAudio() {
  if (!ctx || ctx.state !== 'suspended') return;
  const reprendre = () => ctx.resume();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    addEventListener(ev, reprendre, { once: true, capture: true });
  }
}

export function demarrerMusique() {
  if (ctx) { reveillerAudio(); return; }
  ambianceCoupee = false;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  maitre = ctx.createGain();
  maitre.gain.value = coupe ? 0 : VOLUME;
  bpm = BPM_LENT;   // chaque partie repart au calme

  // Un soupçon de réverbération de grange : court retard réinjecté.
  const echo = ctx.createDelay(0.4);
  echo.delayTime.value = 0.14;
  const retour = ctx.createGain();
  retour.gain.value = 0.18;
  maitre.connect(echo).connect(retour).connect(ctx.destination);
  maitre.connect(ctx.destination);

  busBanjo = ctx.createGain();
  busBanjo.gain.value = NIV_BANJO;
  busDrone = ctx.createGain();
  busZap = ctx.createGain();
  busSfx = ctx.createGain();
  busTanks = ctx.createGain();
  busAmbiance = ctx.createGain();
  busAmbiance.connect(maitre);
  for (const b of [busBanjo, busDrone, busZap, busTanks]) b.connect(busAmbiance);
  busSfx.connect(maitre);     // détonations et mugissements : jamais masqués

  construireDrone();
  construireZap();
  construireTanks();

  prochaineNote = ctx.currentTime + 0.08;
  pas = 0;
  minuteur = setInterval(boucle, 25);
  reveillerAudio();
}

// Tension : part des blindés effectivement présents dans le cadre, de 0 à 1.
// Plus ils débarquent, plus le roulement s'emballe.
export function setTensionMusique(part) {
  const t = Math.min(1, Math.max(0, part));
  bpmCible = BPM_LENT + (BPM_VIF - BPM_LENT) * t;
}

// Coupe l'ambiance — banjo, bourdon, moteurs, faisceau — mais pas le maître :
// détonations, mugissements et mariachi doivent pouvoir sonner après.
export function arreterMusique(duree = 1.2) {
  if (!ctx) return;
  ambianceCoupee = true;
  const fin = ctx.currentTime + duree;
  busAmbiance.gain.cancelScheduledValues(ctx.currentTime);
  busAmbiance.gain.setValueAtTime(busAmbiance.gain.value, ctx.currentTime);
  busAmbiance.gain.linearRampToValueAtTime(0.0001, fin);
  setTimeout(() => { clearInterval(minuteur); minuteur = null; }, duree * 1000);
}

export function basculerSon() {
  coupe = !coupe;
  if (maitre) {
    maitre.gain.cancelScheduledValues(ctx.currentTime);
    maitre.gain.setTargetAtTime(coupe ? 0 : VOLUME, ctx.currentTime, 0.05);
  }
  return !coupe;
}
