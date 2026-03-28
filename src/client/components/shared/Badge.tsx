import { Badge as ShadcnBadge } from "~/client/components/ui/badge";

type BadgeVariant = "low" | "medium" | "high" | "info";

type BadgeProps = {
  label: string;
  variant: BadgeVariant;
};

export const Badge = ({ label, variant }: BadgeProps) => {
  return <ShadcnBadge variant={variant}>{label}</ShadcnBadge>;
};
