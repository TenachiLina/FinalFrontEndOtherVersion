import { redirect } from "next/navigation";

// The site's main address opens the welcome home page.
export default function RootPage() {
  redirect("/home");
}
