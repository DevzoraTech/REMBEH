import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import rembehIcon from "../../assets/rembeh-icon.png";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="auth-shell min-h-screen text-[var(--slate-text)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1200px] lg:grid-cols-[1fr_1fr]">
        <aside className="auth-panel relative overflow-hidden px-6 py-8 text-white sm:px-10 lg:px-12 lg:py-10">
          <div className="auth-panel__glow" aria-hidden />
          <div className="auth-panel__grid" aria-hidden />

          <div className="relative z-10 flex h-full min-h-[280px] flex-col">
            <Link href="/" className="inline-flex w-fit items-center gap-3">
              <Image
                src={rembehIcon}
                alt="REMBEH"
                className="size-11 object-cover"
                priority
              />
              <div>
                <p className="font-[family-name:var(--font-display)] text-3xl leading-none tracking-[-0.03em]">
                  REMBEH
                </p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">
                  Lending operations platform
                </p>
              </div>
            </Link>

            <div className="mt-auto max-w-lg pb-2 pt-14 lg:pt-20">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--warm-gold)]">
                {eyebrow}
              </p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-[1.08] tracking-[-0.03em] sm:text-[2.75rem]">
                {title}
              </h1>
              <p className="mt-4 max-w-md text-sm leading-7 text-white/68">
                {description}
              </p>
            </div>
          </div>
        </aside>

        <section className="flex items-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="auth-card mx-auto w-full max-w-[460px] animate-rise">
            {children}
            {footer ? <div className="mt-5">{footer}</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
