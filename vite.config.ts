import { defineConfig } from 'vite';

// Relative asset paths so the static export works from any root (IPFS gateways, ENS names, subfolders).
export default defineConfig({ base: './' });
