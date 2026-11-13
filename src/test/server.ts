import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** Base URL the code under test calls (set in vitest.config.ts). */
export const API = "https://api.test";

// Tests add their own handlers with server.use(...). The ones here stay after
// each reset: the sidebar asks for the number of waiting correction requests
// on every admin page.
export const server = setupServer(
  http.get(`${API}/corrections/count`, () => HttpResponse.json({ pending: 0 }))
);
