import { redirect } from "next/navigation";

// Accounts are created by an admin from the Users page; there is no public sign-up.
export default function SignUp() {
  redirect("/signin");
}
