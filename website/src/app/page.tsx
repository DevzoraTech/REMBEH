'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, ArrowRight, Check, Star, ChevronDown,
  Users, BarChart3, Shield, Globe, Phone, Mail,
  Wallet, FileText, ClipboardCheck, Smartphone,
  Building2, BadgeCheck, CalendarCheck,
} from 'lucide-react';

const WEB_APP = 'https://rembeh.antikra.com';
const API_BASE = 'https://rembeh-api.antikra.com/api/v1';
const DOWNLOAD_APP = 'mobile';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Apps', href: '#apps' },
  { label: 'How it works', href: '#how' },
  { label: 'FAQ', href: '#faq' },
];

const FEATURES = [
  {
    icon: Smartphone,
    title: 'Field agents capture loans on site',
    desc: 'Applicants, guarantors, National ID photos, collateral docs, and signatures — captured in the mobile app without paper forms or WhatsApp threads.',
    metric: 'End-to-end field origination',
    tag: 'Mobile',
  },
  {
    icon: BadgeCheck,
    title: 'Smile ID verification built in',
    desc: 'Verify borrower identity against National ID with Smile ID when your workspace enables it. Reduce fraud before disbursement.',
    metric: 'KYC without spreadsheet chaos',
    tag: 'Identity',
  },
  {
    icon: FileText,
    title: 'Loan applications that managers can trust',
    desc: 'Structured products, media checklists, and signed agreements stored privately per tenant — not buried in chat history.',
    metric: 'Audit-ready loan files',
    tag: 'Lending',
  },
  {
    icon: Wallet,
    title: 'Collections & wallets in one place',
    desc: 'Record repayments, track arrears, and keep agent collection activity visible to branch managers in real time.',
    metric: 'Cash discipline daily',
    tag: 'Collections',
  },
  {
    icon: CalendarCheck,
    title: 'Daily close without guesswork',
    desc: 'Close the day with clear totals for collections and outstanding work. Managers see what closed and what is still open.',
    metric: 'Day-end confidence',
    tag: 'Operations',
  },
  {
    icon: Building2,
    title: 'Multi-tenant by design',
    desc: 'Every lending company gets an isolated workspace. Branches, roles, and permissions keep staff scoped to what they should see.',
    metric: 'Zero cross-tenant leaks',
    tag: 'Platform',
  },
  {
    icon: Users,
    title: 'Invite staff. They activate and go.',
    desc: 'Email invitations, role assignment, and branch access — configured once by managers, ready for field agents the same day.',
    metric: 'Onboard in minutes',
    tag: 'Web',
  },
  {
    icon: BarChart3,
    title: 'Visibility for managers',
    desc: 'Dashboard for applications, collections, and staff activity across branches — so decisions are based on numbers, not gut feel.',
    metric: 'Peace in every decision',
    tag: 'Web',
  },
  {
    icon: Shield,
    title: 'Private storage & signed downloads',
    desc: 'Loan media and APK releases live in private S3 with short-lived signed URLs. No public bucket browsing.',
    metric: 'Bank-grade object access',
    tag: 'Security',
  },
];

const APPS = [
  {
    name: 'REMBEH Mobile',
    apiName: DOWNLOAD_APP,
    who: 'Field agents & loan officers',
    problem:
      'Paper forms, lost National ID photos, and repayment records trapped in personal phones and WhatsApp groups.',
    solution:
      'Capture KYC, submit loan applications, collect repayments, and sync with the branch — all from the REMBEH field app.',
    version: '1.0.0',
    rating: '—',
    downloads: 'Early access',
    platforms: [
      { label: 'Android APK', available: true, platform: 'android' as const },
      { label: 'iOS', available: false, platform: 'ios' as const },
    ],
    screens: [
      { label: 'Loan capture', desc: 'Start applications with product, amounts, and borrower details.' },
      { label: 'KYC media', desc: 'National ID, passport photo, collateral, and supporting docs.' },
      { label: 'Signatures', desc: 'Applicant, guarantor, and officer signatures on-device.' },
      { label: 'Collections', desc: 'Record payments and see what is due today.' },
    ],
  },
  {
    name: 'REMBEH Web',
    apiName: 'web',
    who: 'Managers, admins & branch leads',
    problem:
      'No single view of applications, collections, or staff — decisions delayed until someone forwards a spreadsheet.',
    solution:
      'One browser dashboard for workspace setup, loan products, applications, collections, daily close, and staff invitations.',
    version: '1.0.0',
    rating: '—',
    downloads: 'Live',
    platforms: [
      { label: 'Open web app', available: true, platform: 'web' as const, href: `${WEB_APP}/login` },
      { label: 'Desktop App', available: false, platform: 'desktop' as const },
    ],
    screens: [
      { label: 'Dashboard', desc: 'Live operational pulse across branches.' },
      { label: 'Applications', desc: 'Review, approve, and track loan files.' },
      { label: 'Collections', desc: 'Daily collections and arrears visibility.' },
      { label: 'Settings', desc: 'Products, staff, branches, and roles.' },
    ],
  },
];

const STEPS = [
  { num: '01', title: 'Register workspace', desc: 'Create your lending organization on the web app and verify your account.' },
  { num: '02', title: 'Configure products', desc: 'Set loan products, invite managers and field agents, assign branches and roles.' },
  { num: '03', title: 'Deploy field app', desc: 'Install the Android APK on agent phones. They sign in with invitation credentials.' },
  { num: '04', title: 'Originate & collect', desc: 'Capture loans in the field, verify identity, collect repayments, and close the day.' },
];

const FAQS = [
  {
    q: 'What is REMBEH?',
    a: 'REMBEH is a multi-tenant Financial Management System for lending institutions. It covers field origination, KYC (including Smile ID), loan applications, collections, wallets, and daily close — with a web dashboard for managers and a mobile app for field agents.',
  },
  {
    q: 'Who builds REMBEH?',
    a: 'REMBEH is built by ANTIKRA Mechanism (ANTIKRA). The product tagline is “Peace in every decision.”',
  },
  {
    q: 'How do I get the Android app?',
    a: 'Download the latest APK from the Apps section on this site. The download is served through a private S3 object via a short-lived signed URL from the REMBEH API. iOS is coming later.',
  },
  {
    q: 'How do managers access the system?',
    a: `Open ${WEB_APP} in any modern browser and sign in. No desktop install is required.`,
  },
  {
    q: 'Is our data isolated from other companies?',
    a: 'Yes. REMBEH is multi-tenant: every organization is a separate workspace. Database queries and object storage are scoped by tenant.',
  },
  {
    q: 'Does REMBEH support Smile ID?',
    a: 'Yes. Workspaces can enable Smile ID for National ID verification as part of the loan application flow.',
  },
  {
    q: 'How are app updates delivered?',
    a: 'Code patches can ship via Shorebird. Full APK releases are uploaded to S3 and registered in the API so the website and in-app updater can fetch them.',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
};

const staggerContainer = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.08 } },
  viewport: { once: true, margin: '-80px' },
};

const staggerItem = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-brand-900/95 backdrop-blur-xl shadow-lg shadow-black/10' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <img src="/mark.png" alt="REMBEH" width={32} height={32} className="rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-white">REMBEH</span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-brand-300 hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <a href={`${WEB_APP}/login`} className="text-sm font-medium text-brand-300 hover:text-white transition-colors px-4 py-2">
            Log in
          </a>
          <a href={`${WEB_APP}/register`} className="text-sm font-semibold bg-accent-500 hover:bg-accent-600 text-white px-5 py-2 rounded-lg transition-colors">
            Open web app
          </a>
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-white p-2" aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-brand-900/98 backdrop-blur-xl border-t border-white/5"
          >
            <div className="px-6 py-4 flex flex-col gap-3">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm font-medium text-brand-300 hover:text-white py-2">
                  {l.label}
                </a>
              ))}
              <hr className="border-white/10 my-2" />
              <a href={`${WEB_APP}/login`} className="text-sm font-medium text-brand-300 py-2">
                Log in
              </a>
              <a href={`${WEB_APP}/register`} className="text-sm font-semibold bg-accent-500 text-white px-5 py-2.5 rounded-lg text-center">
                Open web app
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function LiveOpsBadge() {
  const [rows, setRows] = useState([
    { id: 'LN-1042', label: 'Application submitted', status: 'new' },
    { id: 'COL-88', label: 'Collection recorded', status: 'ok' },
    { id: 'KYC-19', label: 'Smile ID verified', status: 'ok' },
  ]);

  useEffect(() => {
    const items = [
      'Application submitted',
      'Collection recorded',
      'Smile ID verified',
      'Agreement signed',
      'Daily close started',
      'Staff invited',
    ];
    const ids = ['LN-1042', 'COL-88', 'KYC-19', 'LN-1107', 'COL-91', 'AGT-04'];
    const statuses = ['new', 'ok', 'pending'] as const;
    const interval = setInterval(() => {
      setRows((prev) => {
        const next = [...prev];
        next.shift();
        next.push({
          id: ids[Math.floor(Math.random() * ids.length)],
          label: items[Math.floor(Math.random() * items.length)],
          status: statuses[Math.floor(Math.random() * statuses.length)],
        });
        return next;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (s: string) => {
    if (s === 'new') return 'bg-gold-400/20 text-gold-400';
    if (s === 'pending') return 'bg-brand-500/20 text-brand-300';
    return 'bg-accent-400/20 text-accent-300';
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.8, duration: 0.5 }}
      className="absolute -right-2 top-16 z-20 hidden xl:block"
    >
      <div className="bg-brand-900/90 backdrop-blur-md border border-white/10 rounded-lg p-3 shadow-2xl w-56">
        <p className="text-[10px] font-semibold text-gold-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
          Live operations
        </p>
        <div className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {rows.map((o, i) => (
              <motion.div
                key={`${o.id}-${o.label}-${i}`}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.9 }}
                transition={{ duration: 0.35 }}
                className="flex items-center justify-between text-xs gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-brand-500 font-mono shrink-0">{o.id}</span>
                  <span className="text-white truncate">{o.label}</span>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${statusColor(o.status)}`}>
                  {o.status}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function HeroMock() {
  return (
    <div className="bg-brand-800 border border-white/[0.06] rounded-xl overflow-hidden shadow-2xl shadow-black/30 relative">
      <div className="flex items-center gap-2 px-5 pt-4 pb-3">
        <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
        <div className="ml-3 flex-1 max-w-xs">
          <div className="h-5 bg-white/[0.04] rounded flex items-center px-2.5 gap-1.5">
            <Shield size={10} className="text-brand-500" />
            <span className="text-[10px] text-brand-500">rembeh.antikra.com/dashboard</span>
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gold-400 font-semibold">Today</p>
            <p className="text-2xl font-extrabold text-white mt-1">Collections pulse</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-brand-400">Branch open</p>
            <p className="text-lg font-bold text-accent-400">UGX 4.2M</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Applications', value: '18' },
            { label: 'Verified KYC', value: '12' },
            { label: 'In arrears', value: '5' },
          ].map((c) => (
            <div key={c.label} className="rounded-lg bg-white/[0.04] border border-white/5 p-3">
              <p className="text-[10px] text-brand-400">{c.label}</p>
              <p className="text-xl font-bold text-white mt-1">{c.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4 space-y-2">
          {['Agent Amina — 3 collections', 'Agent Joseph — loan LN-1107 submitted', 'Manager review queue — 4 waiting'].map(
            (line) => (
              <div key={line} className="flex items-center gap-2 text-xs text-brand-300">
                <ClipboardCheck size={12} className="text-accent-400 shrink-0" />
                {line}
              </div>
            ),
          )}
        </div>
      </div>
      <LiveOpsBadge />
    </div>
  );
}

function Hero() {
  const [typedText, setTypedText] = useState('');
  const fullText = 'Peace in every decision.';

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 45);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-brand-900">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#0f8a6c 1px, transparent 1px), linear-gradient(90deg, #0f8a6c 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-gold-500/10" />

      <div className="relative max-w-7xl mx-auto px-6 pt-28 pb-20 grid lg:grid-cols-2 gap-16 items-center">
        <motion.div {...fadeUp}>
          <div className="inline-flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-xs font-medium text-gold-400">ANTIKRA Mechanism</span>
            <span className="text-brand-600">·</span>
            <span className="text-xs font-medium text-brand-300">Financial Management System</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] tracking-tight text-white">
            REMBEH
          </h1>
          <p className="mt-3 text-xl sm:text-2xl font-semibold text-accent-300 tracking-tight">
            Lending operations without the chaos.
          </p>

          <div className="mt-5 h-6">
            <p className="text-base text-brand-400 font-mono">
              {typedText}
              <span className="animate-pulse text-gold-400">|</span>
            </p>
          </div>

          <p className="mt-4 text-base text-brand-400 leading-relaxed max-w-lg">
            Field agents capture loans and collections. Managers see applications, wallets, and daily close in one
            system — isolated per institution, built for East African lending teams.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={`${WEB_APP}/login`}
              className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Web app login <ArrowRight size={16} />
            </a>
            <a
              href="#apps"
              className="inline-flex items-center gap-2 text-white font-medium px-6 py-3 rounded-lg border border-white/15 hover:bg-white/[0.05] transition-all"
            >
              Download Android
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-5 text-xs text-brand-500">
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-accent-400" /> Smile ID ready
            </span>
            <span className="w-px h-3 bg-brand-700" />
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-accent-400" /> Multi-tenant
            </span>
            <span className="w-px h-3 bg-brand-700" />
            <span className="flex items-center gap-1.5">
              <Check size={12} className="text-accent-400" /> Field + web
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="hidden lg:block relative"
        >
          <HeroMock />
        </motion.div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { value: 'Field + web', label: 'One platform' },
    { value: 'Tenant-scoped', label: 'Data isolation' },
    { value: 'S3 private', label: 'Media & APKs' },
    { value: 'Shorebird', label: 'OTA patches' },
  ];
  return (
    <section className="relative -mt-1 bg-white border-b border-brand-100">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <motion.div {...staggerContainer} className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <motion.div key={s.label} {...staggerItem} className="text-center">
              <p className="text-sm font-semibold text-brand-900">{s.value}</p>
              <p className="text-xs text-brand-500 mt-0.5">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function Features() {
  const painPoints = [
    'KYC photos trapped in WhatsApp',
    'No single view of collections',
    'Paper loan files that go missing',
    'Agents offline from branch truth',
    'Manual daily close spreadsheets',
    'Unclear who owes what today',
  ];

  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div {...fadeUp} className="max-w-2xl mb-6">
          <p className="text-sm font-semibold text-accent-500 uppercase tracking-wider mb-3">What you get</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Everything a lending team needs between the field and the branch
          </h2>
        </motion.div>

        <motion.div {...fadeUp} className="mb-14 bg-brand-50 border border-brand-100 rounded-xl p-5">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-3">
            If you are not on REMBEH, you are probably still doing this:
          </p>
          <div className="flex flex-wrap gap-2">
            {painPoints.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 bg-white border border-brand-100 rounded-lg px-3 py-1.5 text-xs text-brand-700"
              >
                <span className="w-1 h-1 rounded-full bg-red-400" />
                {p}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div {...staggerContainer} className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              {...staggerItem}
              className="group bg-white border border-brand-100 rounded-xl p-6 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-100/50 transition-all duration-300"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-lg bg-brand-900 flex items-center justify-center">
                  <f.icon size={16} className="text-white" />
                </div>
                <span className="text-[10px] font-semibold text-accent-500 uppercase tracking-wider">{f.tag}</span>
              </div>
              <h3 className="text-base font-bold text-brand-900 leading-snug mb-2.5">{f.title}</h3>
              <p className="text-sm text-brand-500 leading-relaxed mb-4">{f.desc}</p>
              <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                <span className="text-xs font-semibold text-emerald-800">{f.metric}</span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function DownloadPanel({ app }: { app: (typeof APPS)[number] }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(platform: {
    label: string;
    available: boolean;
    platform: string;
    href?: string;
  }) {
    if (!platform.available) return;
    if (platform.href) {
      window.open(platform.href, '_blank');
      return;
    }
    setDownloading(platform.platform);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/app/download/${app.apiName}?platform=${platform.platform}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'No Android release published yet — coming soon.');
      }
      const data = await res.json();
      window.location.href = data.downloadUrl;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(null);
    }
  }

  const isWeb = app.platforms.some((p) => p.platform === 'web' && p.available);

  return (
    <div className="lg:w-60 border-t lg:border-t-0 lg:border-l border-brand-100 bg-brand-50/50 p-6 lg:p-8 flex flex-col justify-center">
      <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-3">{isWeb ? 'Open now' : 'Download'}</p>
      <div className="space-y-2.5">
        {app.platforms.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handleDownload(p)}
            disabled={!p.available || downloading === p.platform}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm font-medium transition-all ${
              p.available
                ? 'bg-brand-900 text-white hover:bg-brand-800 cursor-pointer shadow-sm'
                : 'bg-brand-100 text-brand-400 cursor-not-allowed'
            }`}
          >
            <span className="flex items-center gap-2">
              {p.platform === 'android' && <Globe size={14} />}
              {p.platform === 'ios' && <Phone size={14} />}
              {p.platform === 'web' && <Building2 size={14} />}
              {downloading === p.platform ? 'Fetching…' : p.label}
            </span>
            {p.available ? <ArrowRight size={14} /> : <span className="text-[10px] uppercase tracking-wide">Soon</span>}
          </button>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
      <p className="text-[10px] text-brand-400 mt-3 leading-relaxed">
        {isWeb
          ? 'Works in any modern browser. No install.'
          : 'APK served via private S3 signed URL when a release is registered.'}
      </p>
    </div>
  );
}

function AppShowcase() {
  return (
    <section id="apps" className="py-24 bg-brand-50/40">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div {...fadeUp} className="max-w-2xl mb-6">
          <p className="text-sm font-semibold text-accent-500 uppercase tracking-wider mb-3">Apps</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">One platform. Field app + web.</h2>
        </motion.div>

        <motion.div {...fadeUp} className="mb-14 bg-white border border-brand-100 rounded-xl p-5">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-3">Not sure which surface?</p>
          <div className="flex flex-wrap gap-2">
            {[
              { role: 'I am a field agent', app: 'REMBEH Mobile' },
              { role: 'I manage loans or collections', app: 'REMBEH Web' },
            ].map((item) => (
              <span
                key={item.role}
                className="inline-flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-lg px-3 py-1.5 text-xs text-brand-700"
              >
                <span className="font-medium">{item.role}</span>
                <span className="text-brand-400">→</span>
                <span className="font-semibold text-accent-500">{item.app}</span>
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div {...staggerContainer} className="space-y-8">
          {APPS.map((app) => (
            <motion.div
              key={app.name}
              {...staggerItem}
              className="border border-brand-100 rounded-2xl overflow-hidden bg-white hover:border-brand-200 hover:shadow-lg hover:shadow-brand-100/50 transition-all duration-300"
            >
              <div className="flex flex-col lg:flex-row">
                <div className="flex-1 p-6 lg:p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-brand-900">
                      <img src="/mark.png" alt="" className="w-9 h-9 rounded-lg" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-brand-900">{app.name}</h3>
                      <p className="text-sm text-accent-500 font-medium mt-0.5">{app.who}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-brand-500">
                        <span className="flex items-center gap-0.5">
                          <Star size={11} className="fill-gold-400 text-gold-400" /> {app.rating}
                        </span>
                        <span className="w-px h-3 bg-brand-200" />
                        <span>{app.downloads}</span>
                        <span className="w-px h-3 bg-brand-200" />
                        <span>v{app.version}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">The problem</p>
                      <p className="text-sm text-red-700 leading-relaxed">{app.problem}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1.5">
                        How REMBEH fixes it
                      </p>
                      <p className="text-sm text-emerald-800 leading-relaxed">{app.solution}</p>
                    </div>
                  </div>

                  <p className="text-[10px] font-semibold text-brand-600 uppercase tracking-wider mb-3">What you will see</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {app.screens.map((s) => (
                      <div key={s.label} className="bg-brand-50 rounded-lg p-3 border border-brand-100">
                        <p className="text-xs font-semibold text-brand-900">{s.label}</p>
                        <p className="text-[11px] text-brand-500 mt-1 leading-tight">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <DownloadPanel app={app} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="py-24 bg-brand-900 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(#c4922a 1px, transparent 1px), linear-gradient(90deg, #c4922a 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-gold-400 uppercase tracking-wider mb-3">Getting started</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            From signup to field collections
          </h2>
        </motion.div>
        <motion.div {...staggerContainer} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <motion.div key={s.num} {...staggerItem} className="relative">
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-accent-500/40 to-transparent z-0" />
              )}
              <div className="relative bg-white/[0.04] border border-white/10 rounded-xl p-6 hover:bg-white/[0.07] transition-colors">
                <span className="text-4xl font-black text-accent-500/25">{s.num}</span>
                <h3 className="text-lg font-bold text-white mt-2 mb-2">{s.title}</h3>
                <p className="text-sm text-brand-400 leading-relaxed">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <section id="faq" className="py-24 bg-white">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div {...fadeUp} className="text-center mb-14">
          <p className="text-sm font-semibold text-accent-500 uppercase tracking-wider mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Frequently asked questions</h2>
        </motion.div>
        <motion.div {...staggerContainer} className="space-y-3">
          {FAQS.map((f, i) => (
            <motion.div key={f.q} {...staggerItem} className="bg-brand-50/70 rounded-xl border border-brand-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="text-sm font-semibold pr-4">{f.q}</span>
                <ChevronDown
                  size={18}
                  className={`text-brand-400 shrink-0 transition-transform duration-200 ${openIdx === i ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence>
                {openIdx === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="px-6 pb-5 text-sm text-brand-500 leading-relaxed">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 bg-brand-900 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-gold-500/10" />
      <motion.div {...fadeUp} className="relative max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Peace in every decision.
        </h2>
        <p className="mt-5 text-lg text-brand-400 max-w-xl mx-auto">
          Give field agents a proper loan app and give managers a single place to run lending operations.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <a
            href={`${WEB_APP}/login`}
            className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base"
          >
            Open REMBEH Web <ArrowRight size={18} />
          </a>
          <a
            href="mailto:hello@antikra.com"
            className="inline-flex items-center gap-2 bg-white/[0.06] hover:bg-white/10 text-white font-semibold px-8 py-4 rounded-xl border border-white/10 transition-all text-base"
          >
            <Mail size={18} /> Contact ANTIKRA
          </a>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  const cols = [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '#features' },
        { label: 'Apps', href: '#apps' },
        { label: 'FAQ', href: '#faq' },
        { label: 'API health', href: `${API_BASE}/platform/health` },
      ],
    },
    {
      title: 'Apps',
      links: [
        { label: 'REMBEH Mobile', href: '#apps' },
        { label: 'REMBEH Web', href: WEB_APP },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'ANTIKRA Mechanism', href: '#' },
        { label: 'Contact', href: 'mailto:hello@antikra.com' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', href: '/privacy/' },
        { label: 'Terms of Service', href: '/terms/' },
        { label: 'Cookie Policy', href: '/cookies/' },
      ],
    },
  ];

  return (
    <footer className="bg-brand-900 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <img src="/mark.png" alt="REMBEH" width={28} height={28} className="rounded-lg" />
              <span className="text-base font-bold text-white">REMBEH</span>
            </div>
            <p className="text-sm text-brand-500 leading-relaxed">
              Financial Management System by ANTIKRA Mechanism. Peace in every decision.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-4">{c.title}</h4>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm text-brand-500 hover:text-white transition-colors">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-brand-600">© {new Date().getFullYear()} ANTIKRA Mechanism. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="mailto:hello@antikra.com" className="text-brand-600 hover:text-white transition-colors" aria-label="Email">
              <Mail size={16} />
            </a>
            <a href={WEB_APP} className="text-brand-600 hover:text-white transition-colors" aria-label="Web">
              <Globe size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Features />
        <AppShowcase />
        <HowItWorks />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
