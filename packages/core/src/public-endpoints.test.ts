import { describe, expect, it } from "vitest";

import { apiBaseUrlFromEnv, PUBLIC_API_BASE_URL } from "./public-endpoints.js";

/** Scoped by precondition: only the value FROM THE ENVIRONMENT is judged, not an embedder's */
/** programmatic `baseUrl`, where the code's author picks the address. */

describe("API address from the environment", () => {
  it("an unset variable keeps the SDK default: a refusal does not replace the default", () => {
    expect(apiBaseUrlFromEnv(undefined)).toBeUndefined();
    expect(apiBaseUrlFromEnv("")).toBeUndefined();
  });

  it("`https:` is accepted verbatim", () => {
    expect(apiBaseUrlFromEnv("https://api.example.com")).toBe("https://api.example.com");
    expect(apiBaseUrlFromEnv(PUBLIC_API_BASE_URL)).toBe(PUBLIC_API_BASE_URL);
  });

  it("outbound `http:` is REFUSED: the key is sent to this address", () => {
    // Accepting `http://` would send `Authorization: Bearer cw_…` in the clear, and the
    // caller would never learn of it.
    expect(() => apiBaseUrlFromEnv("http://api.example.com")).toThrow(/https/);
  });

  it("loopback `http:` is allowed explicitly: a local API goes nowhere", () => {
    for (const raw of ["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
      expect(apiBaseUrlFromEnv(raw), raw).toBe(raw);
    }
  });

  it("a loopback NAME does not make a public host loopback", () => {
    // `localhost.evil.test` resolves anywhere: the whole host is checked.
    expect(() => apiBaseUrlFromEnv("http://localhost.evil.test")).toThrow(/https/);
  });

  it("a foreign scheme is refused like `http:`", () => {
    expect(() => apiBaseUrlFromEnv("ftp://api.example.com")).toThrow(/https/);
    expect(() => apiBaseUrlFromEnv("file:///etc/passwd")).toThrow(/https/);
  });

  it("a non-URL is refused with its own message, not a constructor crash", () => {
    expect(() => apiBaseUrlFromEnv("api.example.com")).toThrow(/not a URL/);
  });
});
