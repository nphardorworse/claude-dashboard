export const DisclaimerCard = () => (
  <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 p-5">
    <h3 className="text-[13px] font-semibold text-amber-400 mb-3 flex items-center gap-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      Important: These numbers are approximations.
    </h3>
    <div className="text-[12px] text-zinc-300 leading-relaxed space-y-3">
      <p>
        Anthropic does not expose exact plan limits, real-time token
        consumption, or billing data through any local API. The usage numbers
        shown here are estimated from local session logs and may not match your
        actual billing.
      </p>
      <p>
        Claude Code subscriptions (Max, Pro) have session and weekly message
        limits, not token limits. The exact thresholds are not published and may
        change. The configurable limits in this dashboard are for your own
        tracking — they are not connected to Anthropic's actual rate limiting.
      </p>
      <p>
        Use this tab to understand relative token consumption across projects
        and sessions, identify which projects cost the most, and see which
        sessions contribute to your usage. Think of it as an activity monitor,
        not a billing statement.
      </p>
    </div>
  </div>
);
