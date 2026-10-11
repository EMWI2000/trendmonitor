import type { ReactNode } from "react";

interface Props {
  title: string;
  lead?: ReactNode;
}

export default function PageHeader({ title, lead }: Props) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      {lead ? <div className="mt-2 max-w-3xl text-sm text-ink2">{lead}</div> : null}
    </header>
  );
}
