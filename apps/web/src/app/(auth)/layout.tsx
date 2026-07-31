import type { ReactNode } from "react";
import { AuthScene } from "../../components/auth/auth-scene";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthScene>{children}</AuthScene>;
}
