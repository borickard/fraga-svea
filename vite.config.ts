import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serverless-funktionen i api/ körs av Vercel i produktion. I dev finns ingen
 * sådan runtime, så den monteras här i stället — samma modul, samma kod, så att
 * fas 3 går att testa lokalt utan att nyckeln någonsin når klienten.
 */
function apiDevServer(): Plugin {
  return {
    name: 'svea-api-dev',
    apply: 'serve',
    configureServer(server) {
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

export default defineConfig({
  plugins: [react(), apiDevServer()],
  build: { outDir: 'dist', sourcemap: false },
});
