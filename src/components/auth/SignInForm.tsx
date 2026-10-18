"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import { AuthUser, CompanyInfo, canOpen, homePathFor } from "@/lib/auth";
import { displayBrand, useSignInBrand } from "@/lib/branding";
import { friendlyError } from "@/lib/errors";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";

// Only follow ?next= to an in-app page the user is allowed to open.
function destinationFor(
  user: AuthUser,
  company: CompanyInfo | null,
  next: string | null
): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    const path = next.split("?")[0];
    if (!path.startsWith("/signin") && canOpen(path, user, company)) {
      return next;
    }
  }
  return homePathFor(user, company);
}

export default function SignInForm() {
  const { user, company, loading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const expired = searchParams.get("expired") === "1";
  const { brand, ready } = useSignInBrand();
  const b = displayBrand(brand);

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: skip the form.
  useEffect(() => {
    if (!loading && user) router.replace(destinationFor(user, company, next));
  }, [loading, user, company, next, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "This doesn't look like an email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (errors.email || errors.password) return;
    setError(null);
    setSubmitting(true);
    try {
      const signedIn = await login(email.trim(), password);
      router.replace(destinationFor(signedIn.user, signedIn.company, next));
    } catch (err) {
      setError(friendlyError(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className={`mb-5 sm:mb-8 transition-opacity ${ready ? "opacity-100" : "opacity-0"}`}>
            {/* The side panel is hidden on small screens, so show the logo here too */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.logo} alt={`${b.name} logo`} className="mb-6 h-14 max-w-[180px] object-contain lg:hidden" />
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign in to {b.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your email and password to sign in.
            </p>
          </div>
          <div>
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-6">
                <div>
                  <Label htmlFor="email">
                    Email <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    placeholder="you@example.com"
                    type="email"
                    error={!!fieldErrors.email}
                    hint={fieldErrors.email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="password">
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      error={!!fieldErrors.password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                      }}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                  {fieldErrors.password && (
                    <p className="mt-1.5 text-xs text-error-500">{fieldErrors.password}</p>
                  )}
                </div>
                {expired && !error && (
                  <p
                    role="status"
                    className="rounded-lg bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
                  >
                    Your session expired. Please sign in again.
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/15 dark:text-error-500"
                  >
                    {error}
                  </p>
                )}
                <div>
                  <Button className="w-full" size="sm" disabled={submitting}>
                    {submitting ? "Signing in…" : "Sign in"}
                  </Button>
                </div>
                <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                  Forgot your password or need an account? Ask an admin.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
