import Image from "next/image";
import Link from "next/link";
import rembehIcon from "../assets/rembeh-icon.png";

export default function NotFound() {
  return (
    <main className="auth-shell flex min-h-screen items-center justify-center px-5 py-10 text-[var(--slate-text)]">
      <div className="auth-card w-full max-w-[460px] animate-rise">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image
            src={rembehIcon}
            alt="REMBEH"
            className="size-11 object-cover"
            priority
          />
          <div>
            <p className="font-[family-name:var(--font-display)] text-2xl leading-none tracking-[-0.03em] text-[var(--midnight-navy)]">
              REMBEH
            </p>
            <p className="mt-1 text-[11px] font-medium lowercase tracking-[0.16em] text-[var(--slate-text)]/55">
              by ANTIKRA Mechanism
            </p>
          </div>
        </Link>

        <p className="mt-8 text-[11px] font-semibold lowercase tracking-[0.18em] text-[var(--warm-gold)]">
          error 404
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl leading-[1.12] tracking-[-0.03em] text-[var(--midnight-navy)]">
          Page not found
        </h1>
        <p className="mt-4 text-sm leading-7 text-[var(--slate-text)]/70">
          The page you requested does not exist or may have moved. Check the
          address, or return to the home page.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary h-11 px-4 text-sm">
            go to home
          </Link>
          <Link href="/dashboard" className="btn btn-ghost h-11 px-4 text-sm">
            open dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
