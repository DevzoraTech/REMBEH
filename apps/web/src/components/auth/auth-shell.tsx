import type { ReactNode } from "react";
import { AuthScene } from "./auth-scene";

/** @deprecated Prefer AuthScene / the (auth) layout. Kept for any leftover imports. */
export function AuthShell({
  children,
  footer,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <AuthScene>
      {children}
      {footer ? <div className="mt-5">{footer}</div> : null}
    </AuthScene>
  );
}
