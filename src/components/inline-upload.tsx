"use client";

import { useRef, useState, useTransition } from "react";
import { uploadAssetAction } from "@/server/actions/assets";

/**
 * A tile in the photo row that opens the file chooser and uploads on the
 * spot — no trip to the Assets page. Calls back with the new asset so the
 * picker can select it straight away.
 */
export function InlineUpload({
  slug,
  accept = "image",
  onUploaded,
}: {
  slug: string;
  accept?: "image" | "video" | "all";
  onUploaded: (assetId: string, kind: "IMAGE" | "VIDEO") => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const ACCEPT = {
    image: "image/jpeg,image/png,image/webp,image/gif",
    video: "video/mp4,video/quicktime",
    all: "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime",
  }[accept];

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("file", file);
          start(async () => {
            const result = await uploadAssetAction(slug, {}, fd);
            if (result.error) setError(result.error);
            else if (result.assetId) {
              setError(undefined);
              onUploaded(result.assetId, result.kind ?? "IMAGE");
            }
            if (input.current) input.current.value = "";
          });
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        title={error ?? "Upload from your phone or computer"}
        className={`w-16 h-16 rounded-[10px] border-2 border-dashed text-[11px] font-bold leading-tight cursor-pointer disabled:opacity-50 ${error ? "border-chili text-chili-deep" : "border-line-strong text-ink-soft hover:border-beet hover:text-beet"}`}
      >
        {pending ? "Uploading…" : error ? "Failed — retry" : "＋ Upload"}
      </button>
    </>
  );
}
