import Image from "next/image";

type AlbionItemIconProps = {
  itemId: string;
  quality?: number | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

const iconSizes = {
  sm: 32,
  md: 44,
  lg: 64,
};

const localIconItemIds = new Set([
  "T4_BAG",
  "T5_BAG",
  "T4_LEATHER",
  "T4_CLOTH",
  "T5_LEATHER",
  "T5_CLOTH",
  "T4_HIDE",
  "T5_HIDE",
]);

export function AlbionItemIcon({
  itemId,
  quality,
  size = "md",
  showLabel = true,
}: AlbionItemIconProps) {
  const dimension = iconSizes[size];
  const normalizedItemId = normalizeItemId(itemId);
  const src = buildAlbionItemIconUrl(normalizedItemId, quality);

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        className="grid shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-100"
        style={{ width: dimension, height: dimension }}
      >
        {src ? (
          <Image
            src={src}
            alt={`${normalizedItemId} icon`}
            width={dimension}
            height={dimension}
            sizes={`${dimension}px`}
            loading="lazy"
            decoding="async"
            unoptimized
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-xs font-bold text-slate-500">?</span>
        )}
      </span>
      {showLabel ? (
        <span className="min-w-0">
          <span className="block truncate font-semibold">{normalizedItemId}</span>
          {quality ? (
            <span className="block text-xs font-medium text-slate-500">
              Quality {quality}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

function normalizeItemId(itemId: string) {
  return itemId.trim().toUpperCase();
}

function buildAlbionItemIconUrl(itemId: string, quality?: number | null) {
  if (!/^[A-Z0-9_@.-]+$/.test(itemId)) return null;

  if (localIconItemIds.has(itemId) && (!quality || quality === 1)) {
    return `/albion-icons/${itemId}.png`;
  }

  const url = new URL(
    `https://render.albiononline.com/v1/item/${itemId}.png`,
  );

  if (quality && quality > 1) {
    url.searchParams.set("quality", String(quality));
  }

  return url.toString();
}
