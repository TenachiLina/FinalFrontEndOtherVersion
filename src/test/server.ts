import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** Base URL the code under test calls (set in vitest.config.ts). */
export const API = "https://api.test";

// Tests add their own handlers with server.use(...). The ones here stay after
// each reset: the sidebar asks for the number of waiting correction requests
// on every admin page, and the header's bell asks for the notifications.
export const server = setupServer(
  http.get(`${API}/corrections/count`, () => HttpResponse.json({ pending: 0 })),
  http.get(`${API}/notifications`, () => HttpResponse.json({ items: [], unread: 0 }))
);
