// The employee mobile app (Nexo Inouty): where to download it, and the
// ready-made messages a manager sends to employees (download links, sign-in
// details). Messages are written in the employee's language, which may differ
// from the language of the website.

export type MessageLang = "en" | "fr" | "ar";

export interface AppLinks {
  /** Google Play page, or "" while the app isn't published there. */
  android: string;
  /** App Store page, or "" while the app isn't published there. */
  ios: string;
}

/**
 * Store pages, set once the app is published:
 * NEXT_PUBLIC_ANDROID_APP_URL and NEXT_PUBLIC_IOS_APP_URL (see .env.example).
 * Read on each call so a test can change them.
 */
export function appLinks(): AppLinks {
  return {
    android: (process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? "").trim(),
    ios: (process.env.NEXT_PUBLIC_IOS_APP_URL ?? "").trim(),
  };
}

export const hasStoreLinks = (links: AppLinks = appLinks()) => !!(links.android || links.ios);

const TEXTS: Record<MessageLang, Record<string, string>> = {
  en: {
    hello: "Hello {name},",
    appIntro: "{company} uses the Nexo Inouty app: see your planning, your worked hours, advances and bonuses on your phone.",
    account: "Here is your account for the Nexo Inouty employee app ({company}):",
    email: "Email: {email}",
    password: "Temporary password: {password}",
    download: "Download the app:",
    android: "Android: {url}",
    ios: "iPhone: {url}",
    notYet: "The app will soon be on Google Play and the App Store. We'll send you the link.",
    private: "Keep this password private and don't share it.",
  },
  fr: {
    hello: "Bonjour {name},",
    appIntro: "{company} utilise l'application Nexo Inouty : consultez votre planning, vos heures travaillées, vos avances et vos primes sur votre téléphone.",
    account: "Voici votre compte pour l'application employé Nexo Inouty ({company}) :",
    email: "E-mail : {email}",
    password: "Mot de passe provisoire : {password}",
    download: "Téléchargez l'application :",
    android: "Android : {url}",
    ios: "iPhone : {url}",
    notYet: "L'application sera bientôt sur Google Play et l'App Store. Nous vous enverrons le lien.",
    private: "Gardez ce mot de passe pour vous et ne le partagez pas.",
  },
  ar: {
    hello: "مرحبًا {name}،",
    appIntro: "تستخدم {company} تطبيق Nexo Inouty: اطّلع على جدولك وساعات عملك وسُلفك ومكافآتك من هاتفك.",
    account: "إليك حسابك في تطبيق الموظف Nexo Inouty ({company}):",
    email: "البريد الإلكتروني: {email}",
    password: "كلمة المرور المؤقتة: {password}",
    download: "حمّل التطبيق:",
    android: "أندرويد: {url}",
    ios: "آيفون: {url}",
    notYet: "سيتوفر التطبيق قريبًا على Google Play وApp Store. سنرسل لك الرابط.",
    private: "احتفظ بكلمة المرور هذه لنفسك ولا تشاركها.",
  },
};

function fill(lang: MessageLang, key: string, values: Record<string, string> = {}): string {
  let s = TEXTS[lang][key];
  for (const [k, v] of Object.entries(values)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function downloadLines(lang: MessageLang, links: AppLinks): string[] {
  if (!hasStoreLinks(links)) return [fill(lang, "notYet")];
  return [
    fill(lang, "download"),
    ...(links.android ? [fill(lang, "android", { url: links.android })] : []),
    ...(links.ios ? [fill(lang, "ios", { url: links.ios })] : []),
  ];
}

/** The message with an employee's sign-in details and the download links. */
export function credentialsMessage(
  lang: MessageLang,
  d: { name: string; company: string; email: string; password: string },
  links: AppLinks = appLinks()
): string {
  return [
    fill(lang, "hello", { name: d.name }),
    "",
    fill(lang, "account", { company: d.company }),
    fill(lang, "email", { email: d.email }),
    fill(lang, "password", { password: d.password }),
    "",
    ...downloadLines(lang, links),
    "",
    fill(lang, "private"),
  ].join("\n");
}

/** The message inviting staff to download the app. */
export function downloadMessage(lang: MessageLang, company: string, links: AppLinks = appLinks()): string {
  return [fill(lang, "appIntro", { company }), "", ...downloadLines(lang, links)].join("\n");
}

/**
 * A phone number for wa.me (international digits, no "+"). Algerian numbers
 * written locally ("0550 12 34 56") get the 213 country code. Null when
 * there is nothing usable.
 */
export function internationalPhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("00")) digits = digits.slice(2);
  else if (!raw.startsWith("+") && digits.length === 10 && digits.startsWith("0")) {
    digits = `213${digits.slice(1)}`;
  }
  return digits.length >= 8 ? digits : null;
}

/** WhatsApp with the message ready; without a number the sender picks the contact. */
export function whatsappUrl(text: string, phone?: string | null): string {
  const number = internationalPhone(phone);
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}

export function smsUrl(text: string, phone?: string | null): string {
  const number = internationalPhone(phone);
  return `sms:${number ? `+${number}` : ""}?body=${encodeURIComponent(text)}`;
}

export function emailUrl(to: string, subject: string, text: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export const EMAIL_SUBJECT: Record<MessageLang, string> = {
  en: "Your Nexo Inouty account",
  fr: "Votre compte Nexo Inouty",
  ar: "حسابك في Nexo Inouty",
};

const LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"; // no l, I, O: easy to read
const DIGITS = "23456789"; // no 0, 1

/**
 * A temporary password that passes the server's rules (8+ characters, a
 * letter and a number) and is easy to read out or type on a phone.
 */
export function generatePassword(random: (n: number) => number = secureRandom): string {
  const pick = (chars: string) => chars[random(chars.length)];
  const letters = Array.from({ length: 6 }, () => pick(LETTERS)).join("");
  const digits = Array.from({ length: 4 }, () => pick(DIGITS)).join("");
  return `${letters}-${digits}`;
}

function secureRandom(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}
