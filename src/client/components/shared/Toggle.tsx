type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export const Toggle = ({ checked, onChange, disabled = false }: ToggleProps) => {
  const handleClick = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      className={`relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-snappy active:scale-95 ${
        checked
          ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
          : "bg-zinc-800"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {/* Track inner highlight */}
      <span className={`absolute inset-0 rounded-full transition-snappy ${
        checked
          ? "shadow-[inset_0_1px_1px_var(--glow-inset-strong)]"
          : "shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
      }`} />

      {/* Knob */}
      <span
        className={`relative inline-block h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-snappy ${
          checked ? "translate-x-[20px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
};
