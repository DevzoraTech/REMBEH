"use client";

import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Settings,
  Tag,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import type { ControlCenterAdmin } from "../../lib/control-center-session";
import { clearControlCenterAuth } from "../../lib/control-center-session";

export type ControlCenterSection =
  | "dashboard"
  | "clients"
  | "subscriptions"
  | "payments"
  | "pricing"
  | "communications"
  | "reports"
  | "users"
  | "audit"
  | "settings";

type NavItem = {
  id: ControlCenterSection;
  label: string;
  icon: typeof LayoutDashboard;
};

const primaryNav: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "clients",
    label: "Clients",
    icon: Users,
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    icon: Building2,
  },
  {
    id: "payments",
    label: "Payments",
    icon: CreditCard,
  },
  {
    id: "pricing",
    label: "Pricing",
    icon: Tag,
  },
];

const secondaryNav: NavItem[] = [
  {
    id: "communications",
    label: "Communications",
    icon: Mail,
  },
  {
    id: "reports",
    label: "Reports",
    icon: BarChart3,
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
  },
  {
    id: "audit",
    label: "Audit Logs",
    icon: FileText,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

export function ControlCenterShell({
  admin,
  active,
  onSectionChange,
  children,
}: {
  admin: ControlCenterAdmin;
  active: ControlCenterSection;
  onSectionChange: (section: ControlCenterSection) => void;
  children: ReactNode;
}) {
  const router = useRouter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  function selectSection(section: ControlCenterSection) {
    onSectionChange(section);
    setMobileMenuOpen(false);
    setProfileOpen(false);
  }

  function logout() {
    clearControlCenterAuth();
    router.replace("/control-center/login");
  }

  return (
    <main className="min-h-screen bg-[#fbfcfd] text-[#12213f]">
      <DesktopSidebar
        admin={admin}
        active={active}
        collapsed={collapsed}
        profileOpen={profileOpen}
        onProfileToggle={() => setProfileOpen((value) => !value)}
        onCollapse={() => setCollapsed((value) => !value)}
        onSelect={selectSection}
        onLogout={logout}
      />

      <section
        className={`min-h-screen transition-[padding] duration-200 ${
          collapsed ? "xl:pl-[72px]" : "xl:pl-[218px]"
        }`}
      >
        <TopBar
          admin={admin}
          collapsed={collapsed}
          onDesktopMenu={() => setCollapsed((value) => !value)}
          onMobileMenu={() => setMobileMenuOpen(true)}
        />

        <div className="px-5 pb-8 pt-5 lg:px-7 xl:px-8">{children}</div>
      </section>

      {mobileMenuOpen ? (
        <MobileSidebar
          admin={admin}
          active={active}
          onClose={() => setMobileMenuOpen(false)}
          onSelect={selectSection}
          onLogout={logout}
        />
      ) : null}
    </main>
  );
}

function DesktopSidebar({
  admin,
  active,
  collapsed,
  profileOpen,
  onProfileToggle,
  onCollapse,
  onSelect,
  onLogout,
}: {
  admin: ControlCenterAdmin;
  active: ControlCenterSection;
  collapsed: boolean;
  profileOpen: boolean;
  onProfileToggle: () => void;
  onCollapse: () => void;
  onSelect: (section: ControlCenterSection) => void;
  onLogout: () => void;
}) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden border-r border-[#e6ebf0] bg-white transition-[width] duration-200 xl:block ${
        collapsed ? "w-[72px]" : "w-[218px]"
      }`}
    >
      <div className="flex h-full flex-col">
        <div
          className={`flex h-[68px] shrink-0 items-center border-b border-[#edf1f4] ${
            collapsed ? "justify-center px-2" : "px-6"
          }`}
        >
          <Brand collapsed={collapsed} />
        </div>

        <div className="flex-1 overflow-y-auto px-2.5 py-7">
          <NavGroup
            items={primaryNav}
            active={active}
            collapsed={collapsed}
            onSelect={onSelect}
          />

          <div className="my-5 border-t border-[#edf1f4]" />

          <NavGroup
            items={secondaryNav}
            active={active}
            collapsed={collapsed}
            onSelect={onSelect}
          />
        </div>

        <div className="border-t border-[#edf1f4] px-2.5 pb-3 pt-3">
          <button
            type="button"
            onClick={onCollapse}
            className={`mb-2 flex h-9 w-full items-center rounded-md text-[12.5px] font-medium text-[#61708b] transition hover:bg-[#f6f8fa] hover:text-[#24334e] ${
              collapsed ? "justify-center" : "gap-2.5 px-3"
            }`}
            title={collapsed ? "Expand sidebar" : undefined}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <>
                <ChevronLeft className="size-4" />
                <span>Collapse</span>
              </>
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={onProfileToggle}
              className={`flex w-full items-center rounded-lg transition hover:bg-[#f7f9fa] ${
                collapsed ? "justify-center py-2" : "gap-2.5 px-2 py-2"
              }`}
              title={collapsed ? admin.displayName : undefined}
            >
              <Avatar name={admin.displayName} />

              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[12.5px] font-semibold text-[#17233c]">
                      {admin.displayName}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] font-medium text-[#6d7890]">
                      Super Admin
                    </span>
                  </span>

                  <ChevronDown
                    className={`size-3.5 shrink-0 text-[#738098] transition ${
                      profileOpen ? "rotate-180" : ""
                    }`}
                  />
                </>
              ) : null}
            </button>

            {profileOpen && !collapsed ? (
              <div className="absolute bottom-[52px] left-0 right-0 rounded-lg border border-[#e2e7ec] bg-white p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] font-medium text-[#526078] transition hover:bg-red-50 hover:text-red-700"
                >
                  <LogOut className="size-4" />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  admin,
  collapsed,
  onDesktopMenu,
  onMobileMenu,
}: {
  admin: ControlCenterAdmin;
  collapsed: boolean;
  onDesktopMenu: () => void;
  onMobileMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#e6ebf0] bg-white/95 px-5 backdrop-blur lg:px-7 xl:px-8">
      <div>
        <button
          type="button"
          onClick={onMobileMenu}
          className="grid size-8 place-items-center rounded-md text-[#30405b] transition hover:bg-[#f5f7f9] xl:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-[19px]" />
        </button>

        <button
          type="button"
          onClick={onDesktopMenu}
          className="hidden size-8 place-items-center rounded-md text-[#30405b] transition hover:bg-[#f5f7f9] xl:grid"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <Menu className="size-[19px]" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="relative grid size-9 place-items-center rounded-md text-[#31415d] transition hover:bg-[#f5f7f9]"
          aria-label="Notifications"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-[5px] top-[3px] grid size-[14px] place-items-center rounded-full bg-[#dc3c3c] text-[8px] font-bold text-white">
            3
          </span>
        </button>

        <div className="h-7 w-px bg-[#e6ebf0]" />

        <div className="hidden items-center gap-2.5 sm:flex">
          <Avatar name={admin.displayName} compact />

          <div className="min-w-0">
            <p className="max-w-[170px] truncate text-[12px] font-semibold leading-4 text-[#15213a]">
              {admin.displayName}
            </p>
            <p className="text-[10px] font-medium leading-4 text-[#6b7890]">
              Super Admin
            </p>
          </div>

          <ChevronDown className="ml-1 size-3.5 text-[#526078]" />
        </div>
      </div>
    </header>
  );
}

function NavGroup({
  items,
  active,
  collapsed,
  onSelect,
}: {
  items: NavItem[];
  active: ControlCenterSection;
  collapsed: boolean;
  onSelect: (section: ControlCenterSection) => void;
}) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const selected = active === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            title={collapsed ? item.label : undefined}
            className={`relative flex h-[39px] w-full items-center rounded-lg transition ${
              collapsed ? "justify-center" : "gap-3 px-3"
            } ${
              selected
                ? "bg-[#edf6f1] text-[#188651]"
                : "text-[#485a76] hover:bg-[#f7f9fa] hover:text-[#17233c]"
            }`}
          >
            {selected ? (
              <span className="absolute -left-2.5 top-[8px] h-[23px] w-[2px] rounded-r-full bg-[#19915a]" />
            ) : null}

            <Icon
              className={`size-[17px] shrink-0 ${
                selected ? "text-[#168a53]" : "text-[#536580]"
              }`}
              strokeWidth={1.8}
            />

            {!collapsed ? (
              <span
                className={`text-[12.5px] ${
                  selected ? "font-semibold" : "font-medium"
                }`}
              >
                {item.label}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function MobileSidebar({
  admin,
  active,
  onClose,
  onSelect,
  onLogout,
}: {
  admin: ControlCenterAdmin;
  active: ControlCenterSection;
  onClose: () => void;
  onSelect: (section: ControlCenterSection) => void;
  onLogout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-[#0f172a]/35"
        aria-label="Close navigation"
      />

      <aside className="relative flex h-full w-[280px] flex-col bg-white shadow-2xl">
        <div className="flex h-[68px] items-center justify-between border-b border-[#edf1f4] px-5">
          <Brand collapsed={false} />

          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-[#536078] hover:bg-[#f5f7f9]"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-6">
          <NavGroup
            items={primaryNav}
            active={active}
            collapsed={false}
            onSelect={onSelect}
          />

          <div className="my-5 border-t border-[#edf1f4]" />

          <NavGroup
            items={secondaryNav}
            active={active}
            collapsed={false}
            onSelect={onSelect}
          />
        </div>

        <div className="border-t border-[#edf1f4] p-3">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={admin.displayName} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[#17233c]">
                {admin.displayName}
              </p>
              <p className="mt-0.5 text-[10.5px] font-medium text-[#6d7890]">
                Super Admin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mt-1 flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-[12px] font-medium text-[#526078] transition hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </div>
      </aside>
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-[35px] shrink-0 place-items-center rounded-[10px] bg-[#269364] text-[15px] font-bold text-white">
        R
      </div>

      {!collapsed ? (
        <div>
          <p className="text-[18px] font-bold leading-[20px] tracking-[-0.02em] text-[#111d36]">
            Rembeh
          </p>
          <p className="mt-[2px] text-[10px] font-medium leading-4 text-[#65738d]">
            Control Center
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Avatar({
  name,
  compact = false,
}: {
  name: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-[#1c925a] font-semibold text-white ${
        compact ? "size-8 text-[10px]" : "size-9 text-[10px]"
      }`}
    >
      {initials(name)}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "A";

  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}