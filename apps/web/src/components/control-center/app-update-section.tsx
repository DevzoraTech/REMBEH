"use client";

import {
  FileText,
  ImagePlus,
  Plus,
  RefreshCw,
  Save,
  Smartphone,
  Trash2,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import type { ControlCenterSession } from "../../lib/control-center-session";
import { controlCenterFetch } from "../../lib/control-center-api";
import {
  IconBadge,
  Panel,
  SectionTitle,
  SelectControl,
} from "./control-center-primitives";

type WhatsNewItem = {
  title: string;
  body: string | null;
};

type AppUpdateScreen = {
  id: string;
  readyMessage: string | null;
  requiredMessage: string | null;
  whatsNewTitle: string;
  whatsNewItems: WhatsNewItem[];
  mediaType: "NONE" | "IMAGE" | "VIDEO";
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  mediaPreviewUrl: string | null;
  mediaTitle: string | null;
  mediaBody: string | null;
  mediaCtaLabel: string | null;
  stayConnectedTitle: string | null;
  stayConnectedBody: string | null;
  isActive: boolean;
  updatedAt: string;
};

type ScreenForm = {
  readyMessage: string;
  requiredMessage: string;
  whatsNewTitle: string;
  whatsNewItems: Array<{ title: string; body: string }>;
  mediaType: "NONE" | "IMAGE" | "VIDEO";
  mediaUrl: string;
  mediaStorageKey: string;
  mediaTitle: string;
  mediaBody: string;
  mediaCtaLabel: string;
  stayConnectedTitle: string;
  stayConnectedBody: string;
  isActive: boolean;
};

const emptyForm: ScreenForm = {
  readyMessage: "A new REMBEH update is ready.",
  requiredMessage: "This update is required to continue using REMBEH.",
  whatsNewTitle: "What's new in this update",
  whatsNewItems: [
    {
      title: "Works better offline",
      body: "Improved offline reliability for your daily work.",
    },
  ],
  mediaType: "NONE",
  mediaUrl: "",
  mediaStorageKey: "",
  mediaTitle: "See what's new",
  mediaBody:
    "Watch a quick 1-minute video to see how this update makes REMBEH even better for you.",
  mediaCtaLabel: "Watch video",
  stayConnectedTitle: "Stay connected",
  stayConnectedBody:
    "Keep REMBEH open and stay connected to Wi-Fi for a faster and uninterrupted update.",
  isActive: true,
};

function parseWhatsNewText(raw: string): Array<{ title: string; body: string }> {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/).map((block) => block.trim());
  const useBlocks = blocks.length > 1;
  const chunks = useBlocks ? blocks : normalized.split("\n");

  return chunks
    .map((chunk) => {
      const lines = chunk
        .split("\n")
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean);
      if (lines.length === 0) return null;
      return {
        title: lines[0] ?? "",
        body: lines.slice(1).join(" ").trim(),
      };
    })
    .filter((item): item is { title: string; body: string } =>
      Boolean(item?.title),
    );
}

function isWhatsNewTextFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "text/plain" ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  );
}

function toForm(screen: AppUpdateScreen): ScreenForm {
  return {
    readyMessage: screen.readyMessage ?? "",
    requiredMessage: screen.requiredMessage ?? "",
    whatsNewTitle: screen.whatsNewTitle || "What's new in this update",
    whatsNewItems:
      screen.whatsNewItems.length > 0
        ? screen.whatsNewItems.map((item) => ({
            title: item.title,
            body: item.body ?? "",
          }))
        : emptyForm.whatsNewItems,
    mediaType: screen.mediaType,
    mediaUrl: screen.mediaUrl ?? "",
    mediaStorageKey: screen.mediaStorageKey ?? "",
    mediaTitle: screen.mediaTitle ?? "",
    mediaBody: screen.mediaBody ?? "",
    mediaCtaLabel: screen.mediaCtaLabel ?? "",
    stayConnectedTitle: screen.stayConnectedTitle ?? "",
    stayConnectedBody: screen.stayConnectedBody ?? "",
    isActive: screen.isActive,
  };
}

export function ControlCenterAppUpdateSection({
  session,
}: {
  session: ControlCenterSession;
}) {
  const [form, setForm] = useState<ScreenForm>(emptyForm);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const screen = await controlCenterFetch<AppUpdateScreen>(
        "/app-update-screen",
        session,
      );
      setForm(toForm(screen));
      setPreviewUrl(screen.mediaPreviewUrl);
      setMediaFile(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the update screen.",
      );
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof ScreenForm>(key: K, value: ScreenForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applyWhatsNewText(file: File, text: string) {
    const items = parseWhatsNewText(text);
    if (items.length === 0) {
      setError("That file had no What's new lines. Put one point per line, or a title and body separated by a blank line.");
      return;
    }
    setError(null);
    update("whatsNewItems", items);
    setNotice(`Loaded ${items.length} What's new point${items.length === 1 ? "" : "s"} from ${file.name}.`);
  }

  function onContentFile(file: File | null) {
    if (!file) {
      setMediaFile(null);
      return;
    }
    if (isWhatsNewTextFile(file)) {
      void file.text().then((text) => applyWhatsNewText(file, text));
      return;
    }
    setMediaFile(file);
    update("mediaType", file.type.startsWith("video/") ? "VIDEO" : "IMAGE");
    setNotice(`Ready to upload ${file.name} as the update ${file.type.startsWith("video/") ? "video" : "image"}.`);
  }

  async function uploadMedia(file: File) {
    const presign = await controlCenterFetch<{
      uploadUrl: string;
      storageKey: string;
      mediaType: "IMAGE" | "VIDEO";
    }>("/app-update-screen/media/presign", session, {
      method: "POST",
      body: JSON.stringify({
        mimeType: file.type,
        fileName: file.name,
      }),
    });
    const response = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) {
      throw new Error("Media upload failed. Please try again.");
    }
    return presign;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      let mediaStorageKey = form.mediaStorageKey || null;
      let mediaType = form.mediaType;
      if (mediaFile) {
        const uploaded = await uploadMedia(mediaFile);
        mediaStorageKey = uploaded.storageKey;
        mediaType = uploaded.mediaType;
      }
      if (mediaType === "NONE") {
        mediaStorageKey = null;
      }
      const saved = await controlCenterFetch<AppUpdateScreen>(
        "/app-update-screen",
        session,
        {
          method: "PATCH",
          body: JSON.stringify({
            readyMessage: form.readyMessage,
            requiredMessage: form.requiredMessage,
            whatsNewTitle: form.whatsNewTitle,
            whatsNewItems: form.whatsNewItems
              .map((item) => ({
                title: item.title.trim(),
                body: item.body.trim() || null,
              }))
              .filter((item) => item.title.length > 0),
            mediaType,
            mediaUrl:
              mediaType === "NONE" || mediaStorageKey
                ? null
                : form.mediaUrl || null,
            mediaStorageKey,
            mediaTitle: form.mediaTitle || null,
            mediaBody: form.mediaBody || null,
            mediaCtaLabel: form.mediaCtaLabel || null,
            stayConnectedTitle: form.stayConnectedTitle || null,
            stayConnectedBody: form.stayConnectedBody || null,
            isActive: form.isActive,
          }),
        },
      );
      setForm(toForm(saved));
      setPreviewUrl(saved.mediaPreviewUrl);
      setMediaFile(null);
      setNotice("Update screen saved. Phones will show this on the next check.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the screen.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionTitle
        title="App update screen"
        subtitle="The picker below controls the What's new text and the video or image shown when a phone must install a new REMBEH APK."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <Panel>
          <p className="px-5 py-8 text-sm text-slate-500">Loading…</p>
        </Panel>
      ) : (
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <Panel>
            <div className="flex items-start gap-3 border-b border-[#edf1f4] px-5 py-4">
              <IconBadge icon={Smartphone} />
              <div>
                <p className="text-sm font-semibold text-[#17233c]">
                  Messages on the phone
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Shown above the What's new list.
                </p>
              </div>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                Ready message
                <input
                  value={form.readyMessage}
                  onChange={(event) =>
                    update("readyMessage", event.target.value)
                  }
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Required warning
                <input
                  value={form.requiredMessage}
                  onChange={(event) =>
                    update("requiredMessage", event.target.value)
                  }
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                />
              </label>
            </div>
          </Panel>

          <Panel>
            <div className="flex items-start gap-3 border-b border-[#edf1f4] px-5 py-4">
              <IconBadge
                icon={
                  form.mediaType === "VIDEO"
                    ? Video
                    : form.mediaType === "IMAGE"
                      ? ImagePlus
                      : FileText
                }
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#17233c]">
                  What's new picker
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  This picker sets the What's new text on the phone, and the
                  video or image shown with it. Load a .txt file, type the
                  points, and optionally attach media.
                </p>
              </div>
            </div>

            <div className="grid gap-4 border-b border-[#edf1f4] p-5 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                Content type
                <SelectControl
                  ariaLabel="Content type"
                  className="mt-1.5 w-full"
                  value={form.mediaType}
                  onChange={(value) =>
                    update("mediaType", value as ScreenForm["mediaType"])
                  }
                  options={[
                    { value: "NONE", label: "Text only" },
                    { value: "IMAGE", label: "Image + text" },
                    { value: "VIDEO", label: "Video + text" },
                  ]}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600">
                Pick What's new text, image, or video
                <input
                  type="file"
                  accept="image/*,video/*,.txt,.md,text/plain"
                  onChange={(event) => {
                    onContentFile(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                  className="mt-1.5 block w-full text-sm"
                />
                <span className="mt-1 block text-[11px] font-medium text-slate-400">
                  .txt fills What's new. Images and videos fill the promo card.
                </span>
              </label>
            </div>

            <div className="space-y-3 border-b border-[#edf1f4] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#17233c]">
                    What's new text
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    One point per line, or title then body with a blank line
                    between points.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#dfe5eb] bg-white px-3 text-xs font-semibold">
                    <FileText className="size-3.5" />
                    Load .txt
                    <input
                      type="file"
                      accept=".txt,.md,text/plain"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file) {
                          void file.text().then((text) =>
                            applyWhatsNewText(file, text),
                          );
                        }
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      update("whatsNewItems", [
                        ...form.whatsNewItems,
                        { title: "", body: "" },
                      ])
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dfe5eb] bg-white px-3 text-xs font-semibold"
                  >
                    <Plus className="size-3.5" />
                    Add point
                  </button>
                </div>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Section title
                <input
                  value={form.whatsNewTitle}
                  onChange={(event) =>
                    update("whatsNewTitle", event.target.value)
                  }
                  className="mt-1.5 h-11 w-full max-w-md rounded-xl border border-[#dfe5eb] px-3 text-sm"
                />
              </label>
              {form.whatsNewItems.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-xl border border-[#edf1f4] bg-[#fbfdfc] p-3 md:grid-cols-[1fr_1.2fr_auto]"
                >
                  <input
                    value={item.title}
                    placeholder="Title"
                    onChange={(event) => {
                      const next = [...form.whatsNewItems];
                      next[index] = { ...item, title: event.target.value };
                      update("whatsNewItems", next);
                    }}
                    className="h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm"
                  />
                  <input
                    value={item.body}
                    placeholder="Supporting text"
                    onChange={(event) => {
                      const next = [...form.whatsNewItems];
                      next[index] = { ...item, body: event.target.value };
                      update("whatsNewItems", next);
                    }}
                    className="h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        "whatsNewItems",
                        form.whatsNewItems.filter((_, i) => i !== index),
                      )
                    }
                    className="grid size-11 place-items-center rounded-xl border border-[#dfe5eb] text-slate-500"
                    aria-label="Remove point"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {form.mediaType !== "NONE" ? (
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
                  Or paste a media URL
                  <input
                    value={form.mediaUrl}
                    onChange={(event) => update("mediaUrl", event.target.value)}
                    placeholder="https://"
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Card title
                  <input
                    value={form.mediaTitle}
                    onChange={(event) =>
                      update("mediaTitle", event.target.value)
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Button label
                  <input
                    value={form.mediaCtaLabel}
                    onChange={(event) =>
                      update("mediaCtaLabel", event.target.value)
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
                  Card description
                  <textarea
                    value={form.mediaBody}
                    onChange={(event) =>
                      update("mediaBody", event.target.value)
                    }
                    rows={3}
                    className="mt-1.5 w-full rounded-xl border border-[#dfe5eb] px-3 py-2 text-sm"
                  />
                </label>
                {previewUrl || mediaFile ? (
                  <p className="text-xs text-emerald-700 md:col-span-2">
                    {mediaFile
                      ? `Ready to upload ${mediaFile.name}`
                      : "Current media is live on the update screen."}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="px-5 py-4 text-xs text-slate-500">
                Text only — phones will show the What's new list without a
                video or image card.
              </p>
            )}
          </Panel>

          <Panel>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600">
                Stay connected title
                <input
                  value={form.stayConnectedTitle}
                  onChange={(event) =>
                    update("stayConnectedTitle", event.target.value)
                  }
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe5eb] px-3 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => update("isActive", event.target.checked)}
                />
                Show this content on phones
              </label>
              <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
                Stay connected text
                <textarea
                  value={form.stayConnectedBody}
                  onChange={(event) =>
                    update("stayConnectedBody", event.target.value)
                  }
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-[#dfe5eb] px-3 py-2 text-sm"
                />
              </label>
            </div>
          </Panel>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#003f35] px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Save className="size-4" />
              {saving ? "Saving…" : "Save update screen"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
