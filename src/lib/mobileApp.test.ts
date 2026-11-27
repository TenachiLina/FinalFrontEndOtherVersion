import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appLinks,
  credentialsMessage,
  downloadMessage,
  emailUrl,
  generatePassword,
  hasStoreLinks,
  internationalPhone,
  smsUrl,
  whatsappUrl,
} from "./mobileApp";

afterEach(() => vi.unstubAllEnvs());

const LINKS = { android: "https://play.google.com/store/apps/details?id=x", ios: "https://apps.apple.com/app/id1" };
const NONE = { android: "", ios: "" };
const details = { name: "Amine", company: "Pizzeria Roma", email: "amine@roma.dz", password: "abcDEF-2345" };

describe("store links", () => {
  it("come from the environment, empty until the app is published", () => {
    vi.stubEnv("NEXT_PUBLIC_ANDROID_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_IOS_APP_URL", "");
    expect(appLinks()).toEqual(NONE);
    expect(hasStoreLinks()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_ANDROID_APP_URL", ` ${LINKS.android} `);
    expect(appLinks()).toEqual({ android: LINKS.android, ios: "" });
    expect(hasStoreLinks()).toBe(true);
  });
});

describe("messages", () => {
  it("give the sign-in details and the download links, in the chosen language", () => {
    const en = credentialsMessage("en", details, LINKS);
    expect(en).toContain("Hello Amine,");
    expect(en).toContain("Nexo Inouty employee app (Pizzeria Roma)");
    expect(en).toContain("Email: amine@roma.dz");
    expect(en).toContain("Temporary password: abcDEF-2345");
    expect(en).toContain(`Android: ${LINKS.android}`);
    expect(en).toContain(`iPhone: ${LINKS.ios}`);
    expect(en).toContain("Keep this password private");

    const fr = credentialsMessage("fr", details, { android: LINKS.android, ios: "" });
    expect(fr).toContain("Bonjour Amine,");
    expect(fr).toContain("Mot de passe provisoire : abcDEF-2345");
    expect(fr).not.toContain("iPhone");

    expect(credentialsMessage("ar", details, LINKS)).toContain("كلمة المرور المؤقتة: abcDEF-2345");
  });

  it("say the link will follow while the app isn't published", () => {
    expect(credentialsMessage("en", details, NONE)).toContain("We'll send you the link.");
    expect(downloadMessage("fr", "Pizzeria Roma", NONE)).toContain("Nous vous enverrons le lien.");
    const share = downloadMessage("en", "Pizzeria Roma", LINKS);
    expect(share.split("\n")[0]).toBe(
      "Pizzeria Roma uses the Nexo Inouty app: see your planning, your worked hours, advances and bonuses on your phone."
    );
    expect(share).toContain("Download the app:");
  });
});

describe("phone numbers and links", () => {
  it.each([
    ["0550 12 34 56", "213550123456"],
    ["+213 550 12 34 56", "213550123456"],
    ["00213550123456", "213550123456"],
    ["+33 6 12 34 56 78", "33612345678"],
    ["", null],
    [null, null],
    ["12", null],
  ])("%s → %s", (input, expected) => {
    expect(internationalPhone(input)).toBe(expected);
  });

  it("builds WhatsApp, SMS and email links with the message", () => {
    expect(whatsappUrl("Hi & bye", "0550123456")).toBe("https://wa.me/213550123456?text=Hi%20%26%20bye");
    expect(whatsappUrl("Hi")).toBe("https://wa.me/?text=Hi");
    expect(smsUrl("Hi", "0550123456")).toBe("sms:+213550123456?body=Hi");
    expect(smsUrl("Hi", null)).toBe("sms:?body=Hi");
    expect(emailUrl("a@b.dz", "Your account", "Line 1\nLine 2")).toBe(
      "mailto:a%40b.dz?subject=Your%20account&body=Line%201%0ALine%202"
    );
  });
});

describe("generatePassword", () => {
  it("passes the server's rules and is easy to read", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-zA-Z]{6}-[2-9]{4}$/);
      expect(p).not.toMatch(/[lIO01]/);
    }
  });

  it("uses the random source given", () => {
    expect(generatePassword(() => 0)).toBe("aaaaaa-2222");
  });
});
