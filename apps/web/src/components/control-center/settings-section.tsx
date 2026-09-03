"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Edit3,
  KeyRound,
  Mail,
  MessageSquareText,
  Plus,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRoundCog,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { controlCenterFetch } from "../../lib/control-center-api";
import type { ControlCenterSession } from "../../lib/control-center-session";

import type {
  ControlCenterOperatorSmsContact,
  ControlCenterSettings,
  ControlCenterSettingsTemplate,
} from "./types";

import {
  ccDateTime,
  ccMoney,
  ccNumber,
} from "./formatters";

type SettingsTab =
  | "ADMINISTRATORS"
  | "COMMUNICATIONS"
  | "BILLING"
  | "SYSTEM";

export function SettingsSection({
  session,
}: {
  session: ControlCenterSession;
}) {
  const [tab, setTab] =
    useState<SettingsTab>(
      "ADMINISTRATORS",
    );

  const [settings, setSettings] =
    useState<ControlCenterSettings | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [selectedTemplate, setSelectedTemplate] =
    useState<ControlCenterSettingsTemplate | null>(
      null,
    );

  const loadSettings =
    useCallback(
      async (silent = false) => {
        if (!silent) {
          setLoading(true);
        }

        setError(null);

        try {
          const response =
            await controlCenterFetch<ControlCenterSettings>(
              "/settings",
              session,
            );

          setSettings(response);
        } catch (caughtError) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load control center settings.",
          );
        } finally {
          if (!silent) {
            setLoading(false);
          }
        }
      },
      [session],
    );

  useEffect(() => {
    void loadSettings();
  }, [
    loadSettings,
  ]);

  const configuredAdmins =
    settings?.administrators.filter(
      (admin) =>
        admin.setupComplete,
    ).length ??
    0;

  const configuredProviders =
    settings?.billing.providers.filter(
      (provider) =>
        provider.configured,
    ).length ??
    0;

  const emailTemplates =
    settings?.templates.filter(
      (template) =>
        template.channel ===
        "EMAIL",
    ).length ??
    0;

  const smsTemplates =
    settings?.templates.filter(
      (template) =>
        template.channel ===
        "SMS",
    ).length ??
    0;

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px]">
        <PageHeader />

        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            tone="green"
            label="Administrators"
            value={ccNumber(
              configuredAdmins,
            )}
            secondary={`${ccNumber(
              settings?.accessConfiguration.allowedCount,
            )} allowed identities`}
          />

          <MetricCard
            icon={Mail}
            tone="blue"
            label="Message templates"
            value={ccNumber(
              settings?.templates.length,
            )}
            secondary={`${emailTemplates} email · ${smsTemplates} SMS`}
          />

          <MetricCard
            icon={CreditCard}
            tone="purple"
            label="Payment providers"
            value={`${configuredProviders} / ${
              settings?.billing.providers.length ??
              0
            }`}
            secondary="Merchant configurations ready"
          />

          <MetricCard
            icon={ShieldCheck}
            tone="amber"
            label="Control Center security"
            value={
              settings?.accessConfiguration.jwtSecretConfigured
                ? "Ready"
                : "Review"
            }
            secondary={
              settings?.accessConfiguration.source ===
              "ENVIRONMENT"
                ? "Environment-managed access"
                : "Default allow-list active"
            }
          />
        </div>

        <section className="mt-4 overflow-hidden rounded-[10px] border border-[#dfe5eb] bg-white">
          <SettingsTabs
            active={
              tab
            }
            onChange={
              setTab
            }
            counts={{
              administrators:
                settings?.administrators.length ??
                0,

              communications:
                (settings?.operatorSmsContacts?.length ?? 0) +
                (settings?.templates.length ?? 0),

              billing:
                settings?.billing.providers.length ??
                0,

              system:
                1,
            }}
          />

          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-[10px] font-medium text-red-700">
              {
                error
              }
            </div>
          ) : null}

          {loading ? (
            <SettingsLoading />
          ) : tab ===
            "ADMINISTRATORS" ? (
          <AdministratorsView
              session={session}
              settings={
                settings
              }
            />
          ) : tab ===
            "COMMUNICATIONS" ? (
            <CommunicationsView
              session={session}
              contacts={settings?.operatorSmsContacts ?? []}
              templates={
                settings?.templates ??
                []
              }
              onEdit={
                setSelectedTemplate
              }
              onContactsChanged={() => loadSettings(true)}
            />
          ) : tab ===
            "BILLING" ? (
            <BillingView
              settings={
                settings
              }
            />
          ) : (
            <SystemView
              settings={
                settings
              }
            />
          )}
        </section>
      </div>

      {selectedTemplate ? (
        <TemplateEditor
          session={
            session
          }
          template={
            selectedTemplate
          }
          onClose={() =>
            setSelectedTemplate(
              null,
            )
          }
          onSaved={async () => {
            setSelectedTemplate(
              null,
            );

            await loadSettings();
          }}
        />
      ) : null}
    </>
  );
}

function PageHeader() {
  const date =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        weekday:
          "long",
        day:
          "2-digit",
        month:
          "long",
        year:
          "numeric",
      },
    ).format(
      new Date(),
    );

  return (
    <div className="mb-5 flex items-start justify-between gap-5">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.025em] text-[#111d36]">
          Settings
        </h1>

        <p className="mt-1 text-[12.5px] font-normal text-[#63718b]">
          Control platform access, communications and operational
          configuration.
        </p>
      </div>

      <p className="mt-2 hidden text-[11px] font-medium text-[#61708a] md:block">
        {
          date
        }
      </p>
    </div>
  );
}

function SettingsTabs({
  active,
  onChange,
  counts,
}: {
  active:
    SettingsTab;

  onChange:
    (
      value:
        SettingsTab,
    ) => void;

  counts: {
    administrators:
      number;
    communications:
      number;
    billing:
      number;
    system:
      number;
  };
}) {
  const items: Array<{
    value:
      SettingsTab;
    label:
      string;
    count?:
      number;
  }> = [
    {
      value:
        "ADMINISTRATORS",
      label:
        "Administrators",
      count:
        counts.administrators,
    },

    {
      value:
        "COMMUNICATIONS",
      label:
        "Communications",
      count:
        counts.communications,
    },

    {
      value:
        "BILLING",
      label:
        "Billing configuration",
      count:
        counts.billing,
    },

    {
      value:
        "SYSTEM",
      label:
        "System",
    },
  ];

  return (
    <div className="flex min-h-[53px] items-end gap-1 overflow-x-auto px-3 sm:px-4">
      {items.map(
        (item) => {
          const selected =
            active ===
            item.value;

          return (
            <button
              key={
                item.value
              }
              type="button"
              onClick={() =>
                onChange(
                  item.value,
                )
              }
              className={`relative flex h-[52px] shrink-0 items-center gap-2 px-3 text-[11px] transition ${
                selected
                  ? "font-semibold text-[#168650]"
                  : "font-medium text-[#58677f] hover:text-[#17233c]"
              }`}
            >
              {
                item.label
              }

              {item.count !==
              undefined ? (
                <span
                  className={`grid min-w-[21px] place-items-center rounded-full px-1.5 py-[2px] text-[9px] font-semibold ${
                    selected
                      ? "bg-[#e5f5eb] text-[#188651]"
                      : "bg-[#f1f3f6] text-[#6b7890]"
                  }`}
                >
                  {
                    item.count
                  }
                </span>
              ) : null}

              {selected ? (
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-t-full bg-[#21935e]" />
              ) : null}
            </button>
          );
        },
      )}
    </div>
  );
}

function AdminPasswordCard({
  session,
}: {
  session: ControlCenterSession;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      await controlCenterFetch("/auth/change-password", session, {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not change password.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-b border-[#edf1f4] bg-[#fcfdfe] px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#eaf6ee] text-[#168650]">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold text-[#17233c]">
            Your password
          </p>
          <p className="mt-1 text-[9.5px] leading-4 text-[#718099]">
            Change the password you use to sign in to Control Center.
          </p>
          {success ? (
            <p className="mt-2 text-[10px] font-medium text-[#168650]">
              {success}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-[10px] font-medium text-red-700">{error}</p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              type="password"
              required
              minLength={8}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="h-9 rounded-[8px] border border-[#dfe5eb] bg-white px-3 text-[11px] outline-none"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className="h-9 rounded-[8px] border border-[#dfe5eb] bg-white px-3 text-[11px] outline-none"
            />
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="h-9 rounded-[8px] border border-[#dfe5eb] bg-white px-3 text-[11px] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-3 h-8 rounded-[8px] bg-[#168650] px-3 text-[10.5px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </div>
      </div>
    </form>
  );
}

function AdministratorsView({
  session,
  settings,
}: {
  session: ControlCenterSession;
  settings:
    ControlCenterSettings | null;
}) {
  return (
    <div className="border-t border-[#edf1f4]">
      <AdminPasswordCard session={session} />
      {!settings?.administrators.length ? (
      <EmptyState
        icon={UserRoundCog}
        title="No Control Center administrators"
        description="No administrator identities are currently configured."
      />
    ) : (
      <>
      <div className="border-b border-[#edf1f4] bg-[#fcfdfe] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#edf4ff] text-[#3475de]">
            <ShieldCheck className="size-4" />
          </span>

          <div>
            <p className="text-[10.5px] font-semibold text-[#17233c]">
              Protected administrator allow-list
            </p>

            <p className="mt-1 max-w-3xl text-[9.5px] leading-4 text-[#718099]">
              Control Center identities are allowed by server
              configuration. This interface intentionally does not
              add or remove privileged administrator emails.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#edf1f4]">
        {settings.administrators.map(
          (
            admin,
          ) => (
            <div
              key={
                admin.email
              }
              className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_150px_180px_150px] md:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[#eaf6ee] text-[#168650]">
                  <UserRoundCog className="size-4" />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-[10.5px] font-semibold text-[#17233c]">
                    {
                      admin.displayName
                    }
                  </p>

                  <p className="mt-1 truncate text-[9px] text-[#718099]">
                    {
                      admin.email
                    }
                  </p>
                </div>
              </div>

              <div>
                <SmallLabel>
                  Setup
                </SmallLabel>

                <div className="mt-1">
                  <StateBadge
                    good={
                      admin.setupComplete
                    }
                    goodLabel="Configured"
                    badLabel="Setup required"
                  />
                </div>
              </div>

              <div>
                <SmallLabel>
                  Last login
                </SmallLabel>

                <p className="mt-1 text-[9.5px] font-medium text-[#526078]">
                  {admin.lastLoginAt
                    ? ccDateTime(
                        admin.lastLoginAt,
                      )
                    : "Never"}
                </p>
              </div>

              <div>
                <SmallLabel>
                  Status
                </SmallLabel>

                <div className="mt-1">
                  <StatusBadge
                    value={
                      admin.status
                    }
                  />
                </div>
              </div>
            </div>
          ),
        )}
      </div>
      </>
    )}
    </div>
  );
}

function CommunicationsView({
  session,
  contacts,
  templates,
  onEdit,
  onContactsChanged,
}: {
  session: ControlCenterSession;
  contacts: ControlCenterOperatorSmsContact[];
  templates: ControlCenterSettingsTemplate[];
  onEdit: (template: ControlCenterSettingsTemplate) => void;
  onContactsChanged: () => Promise<void>;
}) {
  return (
    <div className="border-t border-[#edf1f4]">
      <OperatorSmsContactsPanel
        session={session}
        contacts={contacts}
        onChanged={onContactsChanged}
      />

      {templates.length ? (
      <div className="grid gap-3 border-t border-[#edf1f4] p-4 lg:grid-cols-2">
        {templates.map(
          (
            template,
          ) => (
            <article
              key={
                template.id
              }
              className="rounded-[10px] border border-[#dfe5eb] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-[8px] ${
                    template.channel ===
                    "EMAIL"
                      ? "bg-[#edf4ff] text-[#3475de]"
                      : "bg-[#eaf6ee] text-[#168650]"
                  }`}
                >
                  {template.channel ===
                  "EMAIL" ? (
                    <Mail className="size-4" />
                  ) : (
                    <MessageSquareText className="size-4" />
                  )}
                </span>

                <div className="flex items-center gap-2">
                  <SmallBadge
                    label={
                      template.channel
                    }
                  />

                  {template.isSystem ? (
                    <SmallBadge
                      label="System"
                    />
                  ) : null}
                </div>
              </div>

              <p className="mt-4 text-[11px] font-semibold text-[#17233c]">
                {
                  template.name
                }
              </p>

              <p className="mt-1 font-mono text-[8.5px] text-[#8490a1]">
                {
                  template.code
                }
              </p>

              {template.subject ? (
                <div className="mt-3">
                  <SmallLabel>
                    Subject
                  </SmallLabel>

                  <p className="mt-1 truncate text-[9.5px] font-medium text-[#526078]">
                    {
                      template.subject
                    }
                  </p>
                </div>
              ) : null}

              <div className="mt-3 rounded-[7px] bg-[#f8fafb] p-3">
                <p className="line-clamp-4 whitespace-pre-wrap text-[9px] leading-4 text-[#68768f]">
                  {
                    template.body
                  }
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-[8.5px] text-[#8490a1]">
                  Updated{" "}
                  {ccDateTime(
                    template.updatedAt,
                  )}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    onEdit(
                      template,
                    )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[9.5px] font-semibold text-[#168650] hover:bg-[#f0f8f3]"
                >
                  <Edit3 className="size-3" />
                  Edit
                </button>
              </div>
            </article>
          ),
        )}
      </div>
      ) : (
        <EmptyState
          icon={Mail}
          title="No communication templates"
          description="No Control Center email or SMS templates are available."
        />
      )}
    </div>
  );
}

function OperatorSmsContactsPanel({
  session,
  contacts,
  onChanged,
}: {
  session: ControlCenterSession;
  contacts: ControlCenterOperatorSmsContact[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addContact() {
    const nextName = name.trim();
    const nextPhone = phone.trim();
    if (!nextName || !nextPhone) {
      setError("Enter a name and a Ugandan mobile number.");
      return;
    }

    setBusyId("new");
    setError(null);
    try {
      await controlCenterFetch(
        "/settings/operator-sms-contacts",
        session,
        {
          method: "POST",
          body: JSON.stringify({
            name: nextName,
            phone: nextPhone,
            active: true,
          }),
        },
      );
      setName("");
      setPhone("");
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not add that contact.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-b border-[#edf1f4] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-[#15223a]">
            Payment alert SMS
          </p>
          <p className="mt-1 max-w-[620px] text-[9.5px] font-normal text-[#69768f]">
            Hamza, Bonny, and anyone you add receive one platform SMS when a
            plan or SMS pack is submitted or confirmed. These are billed to
            Pahappa, not organisation wallets. Each person can be renamed or
            replaced.
          </p>
        </div>
        <span className="rounded-full bg-[#eaf6ee] px-2 py-0.5 text-[9px] font-semibold text-[#168650]">
          {contacts.filter((row) => row.active).length} active
        </span>
      </div>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[10px] font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 divide-y divide-[#edf1f4] overflow-hidden rounded-lg border border-[#dfe5eb]">
        {contacts.length ? (
          contacts.map((contact) => (
            <OperatorSmsContactRow
              key={contact.id}
              session={session}
              contact={contact}
              busy={busyId === contact.id}
              onBusy={setBusyId}
              onError={setError}
              onChanged={onChanged}
            />
          ))
        ) : (
          <p className="px-4 py-6 text-center text-[10px] text-[#6b7890]">
            No operator numbers yet. Add Hamza, Bonny, or anyone else below.
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name, e.g. Hamza"
          maxLength={40}
          className="h-10 rounded-[7px] border border-[#dfe5eb] px-3 text-[10px] text-[#26344d] outline-none focus:border-[#87bfa1]"
        />
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Number, e.g. 0777823011"
          maxLength={20}
          className="h-10 rounded-[7px] border border-[#dfe5eb] px-3 text-[10px] text-[#26344d] outline-none focus:border-[#87bfa1]"
        />
        <button
          type="button"
          onClick={() => void addContact()}
          disabled={busyId !== null}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[#168650] px-3 text-[10px] font-semibold text-white hover:bg-[#147a48] disabled:opacity-60"
        >
          <Plus className="size-3.5" />
          Add person
        </button>
      </div>
    </div>
  );
}

function OperatorSmsContactRow({
  session,
  contact,
  busy,
  onBusy,
  onError,
  onChanged,
}: {
  session: ControlCenterSession;
  contact: ControlCenterOperatorSmsContact;
  busy: boolean;
  onBusy: (id: string | null) => void;
  onError: (message: string | null) => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phoneDisplay);

  useEffect(() => {
    setName(contact.name);
    setPhone(contact.phoneDisplay);
  }, [contact.name, contact.phoneDisplay]);
  const dirty =
    name.trim() !== contact.name || phone.trim() !== contact.phoneDisplay;

  async function save() {
    onBusy(contact.id);
    onError(null);
    try {
      await controlCenterFetch(
        `/settings/operator-sms-contacts/${contact.id}`,
        session,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
          }),
        },
      );
      await onChanged();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Could not update that contact.",
      );
    } finally {
      onBusy(null);
    }
  }

  async function toggleActive() {
    onBusy(contact.id);
    onError(null);
    try {
      await controlCenterFetch(
        `/settings/operator-sms-contacts/${contact.id}`,
        session,
        {
          method: "PATCH",
          body: JSON.stringify({ active: !contact.active }),
        },
      );
      await onChanged();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Could not update that contact.",
      );
    } finally {
      onBusy(null);
    }
  }

  async function remove() {
    onBusy(contact.id);
    onError(null);
    try {
      await controlCenterFetch(
        `/settings/operator-sms-contacts/${contact.id}`,
        session,
        {
          method: "DELETE",
        },
      );
      await onChanged();
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "Could not remove that contact.",
      );
    } finally {
      onBusy(null);
    }
  }

  return (
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] sm:items-center">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        maxLength={40}
        className="h-9 rounded-[7px] border border-[#dfe5eb] px-3 text-[10px] font-semibold text-[#17233c] outline-none focus:border-[#87bfa1] disabled:opacity-60"
      />
      <input
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        disabled={busy}
        maxLength={20}
        className="h-9 rounded-[7px] border border-[#dfe5eb] px-3 font-mono text-[10px] text-[#26344d] outline-none focus:border-[#87bfa1] disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => void toggleActive()}
          disabled={busy}
          className={`h-8 rounded-md px-2.5 text-[9.5px] font-semibold ${
            contact.active
              ? "bg-[#eaf6ee] text-[#168650]"
              : "bg-[#f1f3f6] text-[#6b7890]"
          }`}
        >
          {contact.active ? "Active" : "Paused"}
        </button>
        {dirty ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="h-8 rounded-md bg-[#168650] px-2.5 text-[9.5px] font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="grid size-8 place-items-center rounded-md text-[#df4545] hover:bg-[#fff0f0] disabled:opacity-60"
          aria-label={`Remove ${contact.name}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function BillingView({
  settings,
}: {
  settings:
    ControlCenterSettings | null;
}) {
  return (
    <div className="border-t border-[#edf1f4]">
      <div className="border-b border-[#edf1f4] px-4 py-4">
        <p className="text-[10.5px] font-semibold text-[#17233c]">
          Merchant payment providers
        </p>

        <p className="mt-1 text-[9.5px] text-[#718099]">
          Customer-facing merchant details are configured by the
          server environment and shown here for operational
          verification.
        </p>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {settings?.billing.providers.map(
          (
            provider,
          ) => (
            <article
              key={
                provider.provider
              }
              className="rounded-[10px] border border-[#dfe5eb] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className={`grid size-10 place-items-center rounded-[9px] ${
                    provider.provider ===
                    "MTN_MOMO"
                      ? "bg-[#fff6d8] text-[#b78b00]"
                      : "bg-[#fff0f0] text-[#d43c3c]"
                  }`}
                >
                  <Smartphone className="size-[18px]" />
                </span>

                <StateBadge
                  good={
                    provider.configured
                  }
                  goodLabel="Configured"
                  badLabel="Incomplete"
                />
              </div>

              <p className="mt-4 text-[11px] font-semibold text-[#17233c]">
                {
                  provider.label
                }
              </p>

              <ConfigRow
                label="Merchant code"
                value={
                  provider.merchantCode ??
                  "Not configured"
                }
              />

              <ConfigRow
                label="Registered account"
                value={
                  provider.accountName ??
                  "Not configured"
                }
              />

              <p className="mt-4 text-[8.5px] leading-4 text-[#8490a1]">
                Modify these values through deployment/server
                configuration rather than from the browser.
              </p>
            </article>
          ),
        )}
      </div>

      <div className="border-t border-[#edf1f4] px-4 py-4">
        <p className="text-[10.5px] font-semibold text-[#17233c]">
          Default subscription plans
        </p>

        <p className="mt-1 text-[9.5px] text-[#718099]">
          Pricing management remains in the Pricing workspace. These
          values are displayed here only as system configuration.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {settings?.plans.map(
            (
              plan,
            ) => (
              <div
                key={
                  plan.id
                }
                className="rounded-[9px] border border-[#dfe5eb] p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <WalletCards className="size-4 text-[#168650]" />

                  <StatusBadge
                    value={
                      plan.isActive
                        ? "ACTIVE"
                        : "INACTIVE"
                    }
                  />
                </div>

                <p className="mt-3 text-[10.5px] font-semibold text-[#17233c]">
                  {
                    plan.name
                  }
                </p>

                <p className="mt-1 text-[8.5px] text-[#8490a1]">
                  {formatInterval(
                    plan.interval,
                  )}
                </p>

                <p className="mt-3 text-[17px] font-bold text-[#111d36]">
                  {ccMoney(
                    plan.amount,
                    plan.currency,
                  )}
                </p>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function SystemView({
  settings,
}: {
  settings:
    ControlCenterSettings | null;
}) {
  const configuration =
    settings?.accessConfiguration;

  return (
    <div className="border-t border-[#edf1f4] p-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <SystemCard
          icon={ShieldCheck}
          title="Administrator access source"
          value={
            configuration?.source ===
            "ENVIRONMENT"
              ? "Environment configuration"
              : "Built-in default"
          }
          description={
            configuration?.source ===
            "ENVIRONMENT"
              ? "CONTROL_CENTER_ALLOWED_EMAILS is providing the privileged administrator allow-list."
              : "No custom environment allow-list was detected; the built-in server defaults are active."
          }
          healthy={
            Boolean(
              configuration?.allowedCount,
            )
          }
        />

        <SystemCard
          icon={KeyRound}
          title="Authentication signing key"
          value={
            configuration?.jwtSecretConfigured
              ? "Configured"
              : "Fallback / missing"
          }
          description="Controls signing and validation of Control Center authentication tokens."
          healthy={
            Boolean(
              configuration?.jwtSecretConfigured,
            )
          }
        />

        <SystemCard
          icon={ServerCog}
          title="Allowed administrators"
          value={ccNumber(
            configuration?.allowedCount,
          )}
          description="Privileged email identities currently accepted by the Control Center authentication layer."
          healthy={
            Boolean(
              configuration?.allowedCount,
            )
          }
        />

        <SystemCard
          icon={CreditCard}
          title="Merchant providers"
          value={`${settings?.billing.providers.filter(
            (provider) =>
              provider.configured,
          ).length ?? 0} / ${
            settings?.billing.providers.length ??
            0
          } configured`}
          description="Manual subscription-payment merchant configurations available to Rembeh."
          healthy={
            Boolean(
              settings?.billing.providers.every(
                (provider) =>
                  provider.configured,
              ),
            )
          }
        />
      </div>

      <div className="mt-4 rounded-[9px] border border-[#d9e5ef] bg-[#f7fbff] p-4">
        <div className="flex gap-3">
          <ServerCog className="mt-0.5 size-4 shrink-0 text-[#3475de]" />

          <div>
            <p className="text-[10px] font-semibold text-[#26344d]">
              Configuration boundary
            </p>

            <p className="mt-1 max-w-4xl text-[9.5px] leading-5 text-[#68768f]">
              Security credentials, administrator allow-lists and
              payment merchant configuration remain deployment-level
              settings. The Control Center can inspect configuration
              health without exposing secrets or silently changing
              infrastructure-level controls.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({
  session,
  template,
  onClose,
  onSaved,
}: {
  session:
    ControlCenterSession;

  template:
    ControlCenterSettingsTemplate;

  onClose:
    () => void;

  onSaved:
    () => Promise<void>;
}) {
  const [name, setName] =
    useState(
      template.name,
    );

  const [subject, setSubject] =
    useState(
      template.subject ??
        "",
    );

  const [body, setBody] =
    useState(
      template.body,
    );

  const [saving, setSaving] =
    useState(
      false,
    );

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const changed =
    name.trim() !==
      template.name ||
    subject.trim() !==
      (
        template.subject ??
        ""
      ) ||
    body.trim() !==
      template.body;

  async function save() {
    if (
      !body.trim()
    ) {
      setError(
        "Template body is required.",
      );

      return;
    }

    setSaving(
      true,
    );

    setError(
      null,
    );

    try {
      await controlCenterFetch(
        `/message-templates/${template.id}`,
        session,
        {
          method:
            "PATCH",

          body:
            JSON.stringify({
              name:
                name.trim(),

              subject:
                template.channel ===
                "EMAIL"
                  ? subject.trim()
                  : "",

              body:
                body.trim(),
            }),
        },
      );

      await onSaved();
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update message template.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center px-4">
      <button
        type="button"
        onClick={
          onClose
        }
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-[1px]"
        aria-label="Close template editor"
      />

      <section className="relative z-10 flex max-h-[86vh] w-full max-w-[650px] flex-col overflow-hidden rounded-[12px] border border-[#dfe5eb] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#edf1f4] px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold text-[#17233c]">
              Edit communication template
            </p>

            <p className="mt-1 font-mono text-[8.5px] text-[#8490a1]">
              {
                template.code
              }
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="grid size-8 place-items-center rounded-md text-[#65738a] hover:bg-[#f3f5f7]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <FormLabel
            label="Template name"
          >
            <input
              value={
                name
              }
              onChange={(
                event,
              ) =>
                setName(
                  event.target.value,
                )
              }
              maxLength={
                120
              }
              className="h-10 w-full rounded-[7px] border border-[#dfe5eb] px-3 text-[10px] text-[#26344d] outline-none focus:border-[#87bfa1]"
            />
          </FormLabel>

          {template.channel ===
          "EMAIL" ? (
            <FormLabel
              label="Subject"
              className="mt-4"
            >
              <input
                value={
                  subject
                }
                onChange={(
                  event,
                ) =>
                  setSubject(
                    event.target.value,
                  )
                }
                maxLength={
                  200
                }
                className="h-10 w-full rounded-[7px] border border-[#dfe5eb] px-3 text-[10px] text-[#26344d] outline-none focus:border-[#87bfa1]"
              />
            </FormLabel>
          ) : null}

          <FormLabel
            label="Message body"
            className="mt-4"
          >
            <textarea
              value={
                body
              }
              onChange={(
                event,
              ) =>
                setBody(
                  event.target.value,
                )
              }
              rows={
                12
              }
              maxLength={
                1600
              }
              className="w-full resize-none rounded-[7px] border border-[#dfe5eb] px-3 py-3 text-[10px] leading-5 text-[#26344d] outline-none focus:border-[#87bfa1]"
            />

            <p className="mt-1 text-right text-[8px] text-[#8490a1]">
              {
                body.length
              }
              /1600
            </p>
          </FormLabel>

          <div className="mt-4 rounded-[8px] bg-[#f8fafb] p-3">
            <p className="text-[9px] font-semibold text-[#526078]">
              Template variables
            </p>

            <p className="mt-1 text-[8.5px] leading-4 text-[#8490a1]">
              Existing placeholders such as {"{{name}}"} and{" "}
              {"{{organization}}"} are rendered when messages are
              sent. Do not remove required placeholders unless that is
              intentional.
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-[7px] border border-red-100 bg-red-50 px-3 py-2 text-[9.5px] text-red-700">
              {
                error
              }
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#edf1f4] bg-[#fbfcfd] px-5 py-3">
          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="h-9 rounded-md border border-[#dfe5eb] bg-white px-3.5 text-[9.5px] font-semibold text-[#526078]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() =>
              void save()
            }
            disabled={
              saving ||
              !changed
            }
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#188653] px-3.5 text-[9.5px] font-semibold text-white disabled:opacity-40"
          >
            <Check className="size-3.5" />
            {saving
              ? "Saving..."
              : "Save template"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SystemCard({
  icon: Icon,
  title,
  value,
  description,
  healthy,
}: {
  icon:
    LucideIcon;

  title:
    string;

  value:
    string;

  description:
    string;

  healthy:
    boolean;
}) {
  return (
    <article className="rounded-[10px] border border-[#dfe5eb] bg-white p-4">
      <div className="flex items-start justify-between">
        <span
          className={`grid size-9 place-items-center rounded-[8px] ${
            healthy
              ? "bg-[#eaf6ee] text-[#168650]"
              : "bg-[#fff2df] text-[#bd6b13]"
          }`}
        >
          <Icon className="size-4" />
        </span>

        <StateBadge
          good={
            healthy
          }
          goodLabel="Healthy"
          badLabel="Review"
        />
      </div>

      <p className="mt-4 text-[10px] font-semibold text-[#526078]">
        {
          title
        }
      </p>

      <p className="mt-1 text-[15px] font-bold text-[#17233c]">
        {
          value
        }
      </p>

      <p className="mt-2 text-[9px] leading-4 text-[#8490a1]">
        {
          description
        }
      </p>
    </article>
  );
}

function ConfigRow({
  label,
  value,
}: {
  label:
    string;
  value:
    string;
}) {
  return (
    <div className="mt-3 grid grid-cols-[120px_minmax(0,1fr)] gap-3">
      <p className="text-[9px] text-[#8490a1]">
        {
          label
        }
      </p>

      <p className="break-words text-[9.5px] font-semibold text-[#526078]">
        {
          value
        }
      </p>
    </div>
  );
}

function FormLabel({
  label,
  className = "",
  children,
}: {
  label:
    string;
  className?:
    string;
  children:
    React.ReactNode;
}) {
  return (
    <label
      className={`block ${className}`}
    >
      <span className="mb-2 block text-[9.5px] font-semibold text-[#34425b]">
        {
          label
        }
      </span>

      {
        children
      }
    </label>
  );
}

function SmallLabel({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <p className="text-[8.5px] font-medium uppercase tracking-[0.04em] text-[#8490a1]">
      {
        children
      }
    </p>
  );
}

function SmallBadge({
  label,
}: {
  label:
    string;
}) {
  return (
    <span className="rounded-[5px] bg-[#eef2f6] px-2 py-1 text-[8px] font-semibold text-[#59677d]">
      {
        label
      }
    </span>
  );
}

function StateBadge({
  good,
  goodLabel,
  badLabel,
}: {
  good:
    boolean;

  goodLabel:
    string;

  badLabel:
    string;
}) {
  return (
    <span
      className={`inline-flex min-h-[21px] items-center gap-1.5 rounded-[5px] px-2 text-[8.5px] font-semibold ${
        good
          ? "bg-[#eaf6ee] text-[#1b804e]"
          : "bg-[#fff2df] text-[#bd6b13]"
      }`}
    >
      {good ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <AlertTriangle className="size-3" />
      )}

      {good
        ? goodLabel
        : badLabel}
    </span>
  );
}

function StatusBadge({
  value,
}: {
  value:
    string;
}) {
  const normalized =
    value.toUpperCase();

  const styles =
    normalized ===
    "ACTIVE"
      ? "bg-[#eaf6ee] text-[#1b804e]"
      : normalized ===
          "SUSPENDED"
        ? "bg-[#fff0f0] text-[#c93f3f]"
        : normalized ===
            "NOT_SETUP"
          ? "bg-[#fff2df] text-[#bd6b13]"
          : "bg-[#eef2f6] text-[#59677d]";

  return (
    <span
      className={`inline-flex min-h-[21px] items-center rounded-[5px] px-2 text-[8.5px] font-semibold ${styles}`}
    >
      {labelFromValue(
        value,
      )}
    </span>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  secondary,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;

  label:
    string;

  value:
    string;

  secondary:
    string;
}) {
  return (
    <section className="flex min-h-[108px] items-center gap-4 rounded-[10px] border border-[#dfe5eb] bg-white px-4">
      <LargeIcon
        icon={
          icon
        }
        tone={
          tone
        }
      />

      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-[#5e6c84]">
          {
            label
          }
        </p>

        <p className="mt-1 truncate text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#101d37]">
          {
            value
          }
        </p>

        <p className="mt-1 text-[9.5px] text-[#68758d]">
          {
            secondary
          }
        </p>
      </div>
    </section>
  );
}

type IconTone =
  | "green"
  | "blue"
  | "purple"
  | "amber";

function LargeIcon({
  icon: Icon,
  tone,
}: {
  icon:
    LucideIcon;

  tone:
    IconTone;
}) {
  return (
    <span
      className={`grid size-[52px] shrink-0 place-items-center rounded-[11px] ${
        tone ===
        "blue"
          ? "bg-[#edf4ff] text-[#276de9]"
          : tone ===
              "purple"
            ? "bg-[#f3edff] text-[#7146de]"
            : tone ===
                "amber"
              ? "bg-[#fff3df] text-[#e38012]"
              : "bg-[#eaf6ee] text-[#198b55]"
      }`}
    >
      <Icon
        className="size-[22px]"
        strokeWidth={
          1.9
        }
      />
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon:
    LucideIcon;

  title:
    string;

  description:
    string;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center border-t border-[#edf1f4] px-6 py-12 text-center">
      <div>
        <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eef6f1] text-[#168650]">
          <Icon className="size-5" />
        </div>

        <p className="mt-3 text-[12px] font-semibold text-[#17233c]">
          {
            title
          }
        </p>

        <p className="mx-auto mt-1 max-w-md text-[9.5px] leading-5 text-[#6b7890]">
          {
            description
          }
        </p>
      </div>
    </div>
  );
}

function SettingsLoading() {
  return (
    <div className="grid gap-3 border-t border-[#edf1f4] p-4 md:grid-cols-2">
      {Array.from({
        length:
          4,
      }).map(
        (
          _,
          index,
        ) => (
          <div
            key={
              index
            }
            className="h-[150px] animate-pulse rounded-[10px] border border-[#edf1f4] bg-[#fafbfc]"
          />
        ),
      )}
    </div>
  );
}

function formatInterval(
  value:
    string,
) {
  return value
    .toLowerCase()
    .replace(
      /_/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (
        letter,
      ) =>
        letter.toUpperCase(),
    );
}

function labelFromValue(
  value:
    string,
) {
  return value
    .replace(
      /_/g,
      " ",
    )
    .trim()
    .split(
      /\s+/,
    )
    .map(
      (
        word,
      ) =>
        word
          .charAt(
            0,
          )
          .toUpperCase() +
        word
          .slice(
            1,
          )
          .toLowerCase(),
    )
    .join(
      " ",
    );
}