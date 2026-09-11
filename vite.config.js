import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le build reste ouvrable depuis n'importe quel
  // sous-répertoire, pas seulement à la racine d'un domaine.
  base: './',
  server: { port: 5174, open: true },
  build: {
    // Les bundles vont dans dist/bundle/ pour ne pas entrer en collision avec
    // public/assets/, recopié tel quel (modèles 3D, planche d'explosions).
    assetsDir: 'bundle',
    target: 'es2022',
    sourcemap: true,
  },
});
