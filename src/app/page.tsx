import { redirect } from "next/navigation";

export default function RootPage() {
  // The proxy sends authenticated users straight to /dashboard; everyone else
  // lands on /login from there.
  redirect("/dashboard");
}
