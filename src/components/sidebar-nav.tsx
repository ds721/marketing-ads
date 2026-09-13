"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TenantRole } from "@prisma/client";

const NAV = [
  { seg: "dashboard", label: "Home", hue: "" },
  { seg: "calendar", label: "Calendar", hue: "text-saffron-deep" },
  { seg: "campaigns", label: "Campaigns", hue: "text-beet-deep" },
  { seg: "products", label: "Products & offers", hue: "" },
  { seg: "assets", label: "Assets", hue: "text-leaf-deep" },
  { seg: "analytics", label: "Analytics", hue: "text-peacock-deep" },
  { seg: "integrations", label: "Integrations", hue: "" },
  { seg: "brand", label: "Brand", hue: "" },
  { seg: "settings", label: "Settings", hue: "", minRole: "ADMIN" as TenantRole },
];

const RANK: Record<TenantRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

export function SidebarNav({ slug, role }: { slug: string; role: TenantRole }) {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible flex-1 md:flex-none">
      {NAV.filter((item) => !item.minRole || RANK[role] >= RANK[item.minRole]).map((item) => {
        const href = `/app/${slug}/${item.seg}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.seg}
            href={href}
            className={cn(
              "text-sm font-semibold rounded-[10px] px-3 py-2 whitespace-nowrap transition-colors",
              active
                ? "bg-beet-tint text-beet-deep"
                : "text-ink-soft hover:text-ink hover:bg-surface-2",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
