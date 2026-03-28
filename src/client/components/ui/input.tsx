import * as React from "react"

import { cn } from "~/client/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-[var(--border-hairline)] bg-[var(--overlay-subtle)] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-snappy focus:border-blue-500/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
