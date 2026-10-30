import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({root:'public-app',publicDir:'../public',plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},server:{host:'127.0.0.1',port:5174},build:{outDir:'../dist-public',emptyOutDir:true,sourcemap:false}});
