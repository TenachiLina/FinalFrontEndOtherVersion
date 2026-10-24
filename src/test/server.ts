import { setupServer } from "msw/node";

/** Base URL the code under test calls (set in vitest.config.ts). */
export const API = "https://api.test";

// Tests add their own handlers with server.use(...)
export const server = setupServer();
