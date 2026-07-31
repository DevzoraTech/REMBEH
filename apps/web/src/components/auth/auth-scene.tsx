"use client";

import {
  BarChart3,
  ChevronDown,
  Globe,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import authBgImage from "../../assets/auth-bg-image.png";
import rembehIcon from "../../assets/rembeh-icon.png";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Enterprise Grade Security",
    description: "Bank-level encryption and security to protect your data.",
  },
  {
    icon: BarChart3,
    title: "Real-time Insights",
    description: "Live dashboards and reports to drive smarter decisions.",
  },
  {
    icon: Users,
    title: "Built for Growth",
    description: "Scalable platform that grows with your institution.",
  },
] as const;

type AuthSceneProps = {
  children: ReactNode;
  panelKey?: string;
};

export function AuthScene({ children, panelKey }: AuthSceneProps) {
  const pathname = usePathname();
  const contentKey = panelKey ?? pathname;

  return (
    <main className="relative h-dvh overflow-hidden text-white">
      <Image
        src={authBgImage}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(6,14,24,0.72)_0%,rgba(8,18,30,0.48)_48%,rgba(8,16,28,0.55)_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_42%,rgba(15,138,108,0.16),transparent_52%)]"
        aria-hidden
      />

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] w-full opacity-[0.18]"
        viewBox="0 0 1440 420"
        fill="none"
        aria-hidden
        preserveAspectRatio="none"
      >
        <path
          d="M0 320 C180 260 320 300 480 240 C640 180 760 220 920 160 C1080 100 1220 140 1440 90"
          stroke="#1db978"
          strokeWidth="1.2"
        />
        <path
          d="M0 360 C220 300 380 340 540 280 C700 220 840 260 1000 210 C1160 160 1280 190 1440 150"
          stroke="#1db978"
          strokeWidth="1"
          opacity="0.7"
        />
        <circle cx="480" cy="240" r="3.5" fill="#1db978" />
        <circle cx="920" cy="160" r="3.5" fill="#1db978" />
      </svg>

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-black/20 px-2.5 text-[11px] font-medium normal-case tracking-normal text-white/90 backdrop-blur-md"
          aria-label="Language"
        >
          <Globe className="size-3.5 opacity-80" />
          English
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </div>

      <div className="relative z-10 grid h-full w-full lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Left brand column — logo top, copy vertically centered, trust pinned bottom */}
        <section className="hidden h-full min-h-0 flex-col pl-[6%] pr-8 pt-8 pb-7 lg:flex xl:pl-[8%] xl:pr-10">
          <Link href="/" className="inline-flex w-fit shrink-0 items-center gap-3">
            <Image
              src={rembehIcon}
              alt="REMBEH"
              className="size-10 object-cover"
              priority
            />
            <div>
              <p className="text-[1.35rem] font-bold leading-none tracking-[0.06em]">
                REMBEH
              </p>
              <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/50">
                Lending Operations Platform
              </p>
            </div>
          </Link>

          <div className="flex min-h-0 flex-1 flex-col justify-center py-6 xl:py-8">
            <div className="max-w-[34rem]">
              <h1 className="font-[family-name:var(--font-display)] text-[2.35rem] leading-[1.15] tracking-[-0.02em] text-white xl:text-[3rem]">
                Lending with intelligence.
                <br />
                <span className="text-[#1db978]">Growing with purpose.</span>
              </h1>

              <div className="mt-4 h-[2px] w-12 rounded-full bg-[#1db978] xl:mt-5" />

              <p className="mt-4 max-w-[28rem] text-sm leading-6 text-white/65 xl:mt-5 xl:text-[15px] xl:leading-7">
                Powerful tools for lending institutions to manage operations,
                track performance and build stronger communities.
              </p>

              <ul className="mt-8 space-y-5 xl:mt-10 xl:space-y-6">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <li key={feature.title} className="flex items-start gap-3.5">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-[#1db978]/55 bg-[#1db978]/10 text-[#1db978]">
                        <Icon className="size-4" strokeWidth={2} />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-semibold leading-none text-white xl:text-[15px]">
                          {feature.title}
                        </p>
                        <p className="mt-1.5 text-[13px] leading-5 text-white/55">
                          {feature.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <p className="flex shrink-0 items-center gap-2 text-[12px] text-white/50">
            <span className="flex size-5 items-center justify-center rounded-full border border-[#1db978]/40 text-[#1db978]">
              <Lock className="size-2.5" />
            </span>
            Secured. Reliable. Trusted by lenders.
          </p>
        </section>

        {/* Modal column — centered in its half, width scales with viewport */}
        <section className="flex h-full items-center justify-center px-4 py-8 sm:px-8 lg:px-8 xl:px-10 2xl:px-12">
          <div
            className="w-full rounded-2xl border border-white/80 bg-white/95 shadow-[0_18px_50px_rgba(4,12,24,0.45)] backdrop-blur-xl
              max-w-[min(100%,22rem)] p-4
              sm:max-w-[24rem] sm:p-5
              lg:max-w-[min(92%,26rem)] lg:p-5
              xl:max-w-[min(88%,28.5rem)] xl:p-6
              2xl:max-w-[min(84%,31rem)] 2xl:p-7"
          >
            <div key={contentKey} className="animate-rise">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export function AuthCardHeader({
  title,
  subtitle,
  showLogo = true,
}: {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {showLogo ? (
        <Image
          src={rembehIcon}
          alt=""
          className="size-8 object-cover xl:size-9"
          aria-hidden
        />
      ) : null}
      <h2
        className={`${showLogo ? "mt-2 xl:mt-2.5" : ""} text-[1.15rem] font-bold tracking-[-0.02em] text-[var(--midnight-navy)] xl:text-[1.3rem]`}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-1 max-w-[36ch] text-[11px] leading-4 text-slate-500 xl:text-[12px] xl:leading-5">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** Compact step indicator for multi-step auth modals */
export function AuthStepBar({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  const label = steps[current] ?? "";

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--forest-emerald)]">
          Step {current + 1} of {steps.length}
        </p>
        <p className="truncate text-[11px] font-medium text-slate-500">
          {label}
        </p>
      </div>
      <div className="mt-2 flex gap-1">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <span
              key={step}
              className={`h-1 flex-1 rounded-full transition ${
                done || active ? "bg-[var(--forest-emerald)]" : "bg-[#e2e8ee]"
              } ${active ? "opacity-100" : done ? "opacity-70" : "opacity-100"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/** @deprecated use AuthStepBar */
export function AuthStepPills({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return <AuthStepBar steps={steps} current={current} />;
}

export function AuthPrimaryButton({
  children,
  loading = false,
  disabled = false,
  type = "submit",
  onClick,
}: {
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className="group flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[linear-gradient(90deg,#14a87a_0%,#0f8a6c_100%)] text-[13px] font-bold normal-case tracking-normal text-white shadow-[0_8px_18px_rgba(15,138,108,0.28)] transition hover:brightness-[1.04] disabled:cursor-not-allowed disabled:opacity-70 xl:h-11 xl:text-sm"
    >
      {children}
    </button>
  );
}

export function AuthGhostButton({
  children,
  disabled = false,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 flex-1 items-center justify-center rounded-xl border border-[#d7dee6] bg-white text-[13px] font-semibold normal-case tracking-normal text-[var(--midnight-navy)] transition hover:bg-slate-50 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AuthCardSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="mx-auto size-8 animate-pulse rounded-lg bg-[#e4ebe8]" />
      <div className="mx-auto h-5 w-32 animate-pulse rounded-md bg-[#e4ebe8]" />
      <div className="mx-auto h-3 w-40 animate-pulse rounded-md bg-[#e4ebe8]" />
      <div className="mt-3 h-9 w-full animate-pulse rounded-xl bg-[#e4ebe8]" />
      <div className="h-9 w-full animate-pulse rounded-xl bg-[#e4ebe8]" />
      <div className="h-10 w-full animate-pulse rounded-xl bg-[#e4ebe8]" />
    </div>
  );
}
