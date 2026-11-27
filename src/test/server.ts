import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** Base URL the code under test calls (set in vitest.config.ts). */
export const API = "https://api.test";

// Tests add their own handlers with server.use(...). The ones here stay after
// each reset: the sidebar asks for the number of waiting correction requests
// on every admin page, and the header's bell asks for the notifications.
export const server = setupServer(
  http.get(`${API}/corrections/count`, () => HttpResponse.json({ pending: 0 })),
  http.get(`${API}/notifications`, () => HttpResponse.json({ items: [], unread: 0 })),
  // The Home page's dashboard: a quiet day unless a test says otherwise
  http.get(`${API}/dashboard`, () =>
    HttpResponse.json({
      day: "2026-03-11",
      time: "10:00",
      attendance: {
        employees: 0,
        counts: { planned: 0, present: 0, left: 0, late: 0, absent: 0, missing: 0, expected: 0 },
        people: [],
      },
      pending: { corrections: 0 },
      month: null,
      subscription: { status: "none", endingSoon: false, readOnly: false, daysLeft: null },
    })
  )
);
