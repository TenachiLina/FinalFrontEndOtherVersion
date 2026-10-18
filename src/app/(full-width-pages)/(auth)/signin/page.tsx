import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Sign In | Nexo InOuty",
  description: "Sign in to Nexo InOuty",
};

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
