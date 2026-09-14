"use client";

import { useTransition } from "react";
import { setTenantStatusAction, setTenantPlanAction } from "@/server/actions/admin";

export function TenantAdminActions({
  tenantId,
  status,
  planId,
}: {
  tenantId: string;
  status: string;
  planId: string;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2 justify-end">
      <select
        defaultValue={planId}
        disabled={pending}
        onChange={(e) => start(() => setTenantPlanAction(tenantId, e.target.value))}
        className="text-xs border border-line rounded-[8px] px-2 py-1 bg-surface cursor-pointer"
        aria-label="Change plan"
      >
        <option value="starter">Starter</option>
        <option value="growth">Growth</option>
        <option value="pro">Pro</option>
      </select>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
          if (confirm(`${next === "SUSPENDED" ? "Suspend" : "Reactivate"} this business?`)) {
            start(() => setTenantStatusAction(tenantId, next));
          }
        }}
        className="text-xs font-semibold text-ink-faint hover:text-chili-deep cursor-pointer"
      >
        {status === "ACTIVE" ? "Suspend" : "Reactivate"}
      </button>
    </div>
  );
}
