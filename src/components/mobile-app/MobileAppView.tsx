"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useAuth } from "@/context/AuthContext";
import { canOpen } from "@/lib/auth";
import { getLang, t } from "@/lib/i18n";
import { toast } from "@/lib/notify";
import {
  appLinks,
  downloadMessage,
  hasStoreLinks,
  whatsappUrl,
  type MessageLang,
} from "@/lib/mobileApp";

const STORES = [
  { key: "android", name: "Google Play", device: "Android" },
  { key: "ios", name: "App Store", device: "iPhone" },
] as const;

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium";

/** A QR code for a link, as an image (made in the browser, nothing is sent). */
function useQrCode(url: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (url) {
      QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#1d2939", light: "#ffffff" } })
        .then((data) => alive && setSrc(data))
        .catch(() => alive && setSrc(null));
    }
    return () => {
      alive = false;
    };
  }, [url]);
  return url ? src : null;
}

function StoreCard({ store, url }: { store: (typeof STORES)[number]; url: string }) {
  const qr = useQrCode(url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("Link copied"));
    } catch {
      toast.error(t("Couldn't copy. Select the text and copy it by hand."));
    }
  };
  return (
    <div data-testid={`store-${store.key}`} className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 p-5 text-center dark:border-gray-800">
      <p className="font-semibold text-gray-800 dark:text-white/90">
        {store.device} · {store.name}
      </p>
      {qr ? (
        // A data: image made in the browser: next/image has nothing to optimize
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={t("QR code to download the app on {device}", { device: store.device })} className="h-44 w-44 rounded-lg bg-white p-1" />
      ) : (
        <div className="h-44 w-44 animate-pulse rounded-lg bg-gray-100 dark:bg-white/5" />
      )}
      <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-brand-500 hover:underline">
        {url}
      </a>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={`${buttonClass} ring-1 ring-inset ring-gray-300 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700`}>
          {t("Copy link")}
        </button>
      </div>
    </div>
  );
}

/** Opens a printable poster with the QR codes, for the staff room. */
async function printPoster(company: string, lang: MessageLang) {
  const links = appLinks();
  const codes = await Promise.all(
    STORES.filter((s) => links[s.key]).map(async (s) => ({
      ...s,
      url: links[s.key],
      qr: await QRCode.toDataURL(links[s.key], { margin: 1, width: 600 }),
    }))
  );
  const escape = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const lines = downloadMessage(lang, company, links).split("\n")[0];
  const html = `<!doctype html><html dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<title>Nexo Inouty</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;color:#1d2939;margin:40px}
  h1{font-size:40px;margin:0 0 8px}h1 span{color:#E2470F}
  p.lead{font-size:20px;max-width:640px;margin:0 auto 32px}
  .codes{display:flex;justify-content:center;gap:48px;flex-wrap:wrap}
  .code img{width:260px;height:260px}.code b{display:block;font-size:22px;margin-bottom:8px}
  .code small{display:block;margin-top:6px;color:#667085;word-break:break-all;max-width:260px}
</style></head><body>
<h1>Nexo <span>Inouty</span></h1>
<p class="lead">${escape(lines)}</p>
<div class="codes">${codes
    .map(
      (c) =>
        `<div class="code"><b>${c.device} · ${c.name}</b><img src="${c.qr}" alt=""><small>${escape(c.url)}</small></div>`
    )
    .join("")}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) {
    toast.error(t("Allow pop-ups for this site to print the poster."));
    return;
  }
  win.document.write(html);
  win.document.close();
}

/**
 * The employee app: where employees download it, how to share the link, and
 * how they get an account. Store links come from NEXT_PUBLIC_ANDROID_APP_URL
 * and NEXT_PUBLIC_IOS_APP_URL once the app is published.
 */
export default function MobileAppView() {
  const { user, company } = useAuth();
  const links = appLinks();
  const published = hasStoreLinks(links);
  const [lang, setLang] = useState<MessageLang>(() => (getLang() as MessageLang) ?? "fr");
  const message = downloadMessage(lang, company?.name ?? "", links);
  const canManageUsers = !!user && canOpen("/users", user, company);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success(t("Message copied"));
    } catch {
      toast.error(t("Couldn't copy. Select the text and copy it by hand."));
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t("With the Nexo Inouty app, employees see their planning, worked hours, advances and bonuses on their phone, and report mistakes before payday.")}
      </p>

      {published ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {STORES.filter((s) => links[s.key]).map((s) => (
              <StoreCard key={s.key} store={s} url={links[s.key]} />
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-gray-800 dark:text-white/90">{t("Share the download link")}</h4>
              <div role="group" aria-label={t("Message language")} className="flex gap-1">
                {(["fr", "ar", "en"] as MessageLang[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={lang === value}
                    onClick={() => setLang(value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      lang === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
                    }`}
                  >
                    {{ fr: "Français", ar: "العربية", en: "English" }[value]}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              aria-label={t("Message")}
              readOnly
              rows={5}
              dir={lang === "ar" ? "rtl" : "ltr"}
              value={message}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer" className={`${buttonClass} bg-success-500 text-white hover:bg-success-600`}>
                {t("Share on WhatsApp")}
              </a>
              <button type="button" onClick={copyMessage} className={`${buttonClass} ring-1 ring-inset ring-gray-300 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700`}>
                {t("Copy message")}
              </button>
              <button
                type="button"
                onClick={() => printPoster(company?.name ?? "", lang)}
                className={`${buttonClass} bg-brand-500 text-white hover:bg-brand-600`}
              >
                {t("Print a poster with the QR codes")}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div role="status" className="rounded-xl border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
          <p className="font-semibold text-gray-800 dark:text-white/90">{t("The app isn't on the stores yet")}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("As soon as it is published on Google Play and the App Store, the download links, QR codes and sharing buttons appear here.")}
          </p>
        </div>
      )}

      <div className="rounded-xl bg-gray-50 p-5 dark:bg-white/[0.03]">
        <h4 className="mb-2 font-semibold text-gray-800 dark:text-white/90">{t("How an employee starts")}</h4>
        <ol className="list-decimal space-y-1 ps-5 text-sm text-gray-700 dark:text-gray-300">
          <li>{t("An admin creates their account: Users → Add user → Mobile app employee, and picks the employee.")}</li>
          <li>{t("The admin sends them their sign-in details by WhatsApp, SMS or email (the button appears right after creating the account).")}</li>
          <li>{t("The employee downloads the app and signs in with that email and password.")}</li>
        </ol>
        {canManageUsers && (
          <Link href="/users" className="mt-3 inline-block text-sm font-medium text-brand-500 hover:underline">
            {t("Go to Users")} →
          </Link>
        )}
      </div>
    </div>
  );
}
