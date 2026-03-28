import { Switch } from "~/client/components/ui/switch";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export const Toggle = ({ checked, onChange, disabled = false }: ToggleProps) => {
  return (
    <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
  );
};
