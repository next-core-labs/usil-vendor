/**
 * Only /api/* and /uploads/* reach this Worker (`run_worker_first` in
 * wrangler.jsonc); every other path is the console's static build. They go to
 * the usil-backend Worker over a service binding, so the browser sees one origin
 * and the backend's HttpOnly session cookie works without CORS. A service
 * binding stays inside Cloudflare, so the zone's Bot Fight Mode never sees it.
 */
interface Env {
  BACKEND: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.BACKEND.fetch(request);
  },
};
