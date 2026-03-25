export const DisclaimerCard = () => (
  <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 p-5">
    <h3 className="text-[13px] font-semibold text-amber-400 mb-3">
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
