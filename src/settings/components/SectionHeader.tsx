type Props = {
  title: string;
  description?: string;
};

export function SectionHeader({ title, description }: Props) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/55 pb-4">
      <h1 className="text-[15px] font-bold uppercase tracking-normal">{title}</h1>
      {description ? (
        <p className="text-[12px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
