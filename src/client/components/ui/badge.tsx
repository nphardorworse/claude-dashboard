import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "~/client/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide ring-1 ring-inset transition-snappy [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--overlay-subtle)] text-zinc-300 ring-[var(--border-accent)]",
        low: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
        medium: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
        high: "bg-red-500/10 text-red-400 ring-red-500/20",
        info: "bg-[var(--overlay-subtle)] text-zinc-300 ring-[var(--border-accent)]",
        destructive: "bg-red-500/10 text-red-400 ring-red-500/20",
        outline: "text-zinc-400 ring-[var(--border-hairline)]",
        secondary:
          "bg-[var(--overlay-faint)] text-zinc-400 ring-[var(--border-hairline)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
