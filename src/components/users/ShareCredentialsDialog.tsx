"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { getLang, t } from "@/lib/i18n";
import { toast } from "@/lib/notify";
import {
  credentialsMessage,
  EMAIL_SUBJECT,
  emailUrl,
  hasStoreLinks,
  internationalPhone,
  smsUrl,
  whatsappUrl,
  type MessageLang,
} from "@/lib/mobileApp";

export interface SignInDetails {
  name: string;
  email: string;
  password: string;
  /** The employee's phone, for WhatsApp and SMS. */
  phone?: string | null;
}

const LANGS: [MessageLang, string][] = [
  ["fr", "Français"],
  ["ar", "العربية"],
  ["en", "English"],
];

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium";

/**
 * Shows an employee's sign-in details once (the server never shows a password
 * again) as a ready message, with buttons to send it by WhatsApp, SMS or
 * email, or to copy it.
 */
export default function ShareCredentialsDialog({
  details,
  onClose,
}: {
  details: SignInDetails | null;
  onClose: () => void;
}) {
  const { company } = useAuth();
  const [lang, setLang] = useState<MessageLang>(() => (getLang() as MessageLang) ?? "fr");
  if (!details) return null;

  const message = credentialsMessage(lang, {
    name: details.name,
    company: company?.name ?? "",
    email: details.email,
    password: details.password,
  });
  const phone = internationalPhone(details.phone);

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t(done));
    } catch {
      toast.error(t("Couldn't copy. Select the text and copy it by hand."));
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-[560px] p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("Send sign-in details to {name}", { name: details.name })}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("This password is shown only now. Send it to the employee, who signs in to the Nexo Inouty app with it.")}
          </p>
        </div>

        <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl bg-gray-50 p-4 text-sm dark:bg-white/[0.03]">
          <dt className="text-gray-500 dark:text-gray-400">{t("Email")}</dt>
          <dd className="font-medium text-gray-800 dark:text-white/90" data-testid="share-email">{details.email}</dd>
          <button type="button" className="text-brand-500 hover:underline" onClick={() => copy(details.email, "Email copied")}>
            {t("Copy")}
          </button>
          <dt className="text-gray-500 dark:text-gray-400">{t("Temporary password")}</dt>
          <dd className="font-mono text-base font-semibold tracking-wide text-gray-800 dark:text-white/90" data-testid="share-password">
            {details.password}
          </dd>
          <button type="button" className="text-brand-500 hover:underline" onClick={() => copy(details.password, "Password copied")}>
            {t("Copy")}
          </button>
        </dl>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="share-message" className="text-sm font-medium text-gray-700 dark:text-gray-400">
              {t("Message")}
            </label>
            <div role="group" aria-label={t("Message language")} className="flex gap-1">
              {LANGS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={lang === value}
                  onClick={() => setLang(value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    lang === value
                      ? "bg-brand-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="share-message"
            readOnly
            rows={9}
            dir={lang === "ar" ? "rtl" : "ltr"}
            value={message}
            className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
          {!hasStoreLinks() && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t("The app isn't on the stores yet: the message says the link will follow.")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <a
            href={whatsappUrl(message, details.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClass} bg-success-500 text-white hover:bg-success-600`}
          >
            {t("WhatsApp")}
          </a>
          <a href={smsUrl(message, details.phone)} className={`${buttonClass} bg-brand-500 text-white hover:bg-brand-600`}>
            {t("SMS")}
          </a>
          <a
            href={emailUrl(details.email, EMAIL_SUBJECT[lang], message)}
            className={`${buttonClass} ring-1 ring-inset ring-gray-300 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700`}
          >
            {t("Email")}
          </a>
          <button
            type="button"
            onClick={() => copy(message, "Message copied")}
            className={`${buttonClass} ring-1 ring-inset ring-gray-300 text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-700`}
          >
            {t("Copy message")}
          </button>
        </div>
        {!phone && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("No phone number on this employee's record: WhatsApp and SMS will ask who to send it to.")}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03]"
          >
            {t("Done")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
