import type { ReactNode } from "react";
import { Card, CardContent } from "~/client/components/ui/card";

type ConceptCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
};

export const ConceptCard = ({ icon, title, description }: ConceptCardProps) => (
  <Card>
    <CardContent>
      <div className="w-8 h-8 rounded-lg bg-[var(--overlay-subtle)] flex items-center justify-center text-zinc-400 mb-3">
        {icon}
      </div>
      <h3 className="text-[13px] font-semibold text-zinc-100 mb-2">{title}</h3>
      <p className="text-[12px] text-zinc-400 leading-relaxed">{description}</p>
    </CardContent>
  </Card>
);
