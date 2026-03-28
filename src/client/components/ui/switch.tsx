import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "~/client/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full transition-snappy active:scale-[0.96] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-blue-500 data-[state=checked]:shadow-[0_0_12px_var(--glow-blue)] data-[state=unchecked]:bg-zinc-700",
        className
      )}
      {...props}
    >
      {/* Track inner highlight */}
      <span className="absolute inset-0 rounded-full transition-snappy peer-data-[state=checked]:shadow-[inset_0_1px_1px_var(--glow-inset-strong)] peer-data-[state=unchecked]:shadow-[inset_0_1px_2px_var(--glow-track-off)]" />
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none relative block size-4 rounded-full bg-white shadow-[0_1px_3px_var(--glow-knob)] ring-0 transition-snappy data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[3px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
