import { redirect } from "next/navigation";

// The profile is on the My account page.
export default function Profile() {
  redirect("/account");
}
