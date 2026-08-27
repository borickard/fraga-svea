import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serverless-funktionen i api/ körs av Vercel i produktion. I dev finns ingen
 * sådan runtime, så den monteras här i stället — samma modul, samma kod, så att
 * fas 3 går att testa lokalt utan att nyckeln någonsin når klienten.
 */
function apiDevServer(mode: string): Plugin {
  return {
    name: 'svea-api-dev',
    apply: 'serve',
    configureServer(server) {
      // Vite lägger .env i import.meta.env, inte i process.env. Funktionen i
      // api/ läser process.env eftersom den körs av Vercel i produktion, så
      // nyckeln måste flyttas över här — annars ser fas 3 okonfigurerad ut
      // lokalt trots en korrekt .env. Bara serverns process rörs; ingenting
      // av det här når klientbundlen.
      const env = loadEnv(mode, process.cwd(), '');
      for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL']) {
        if (!process.env[key] && env[key]) process.env[key] = env[key];
      }
      server.middlewares.use('/api/ask', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule('/api/ask.ts');
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);

          const request = new Request(`http://localhost${req.url ?? '/'}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          });

          const response: Response = await mod.default(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiDevServer(mode)],
  build: { outDir: 'dist', sourcemap: false },
}));
