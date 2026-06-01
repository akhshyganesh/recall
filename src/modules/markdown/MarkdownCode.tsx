import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  className?: string;
  children?: ReactNode;
};

export function MarkdownCode({ className, children, ...rest }: Props) {
  const isBlock = /language-[\w-]+/.test(className ?? "");
  const code = String(children ?? "").replace(/\n$/, "");

  if (!isBlock) {
    return (
      <code
        className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground"
        {...rest}
      >
        {children}
      </code>
    );
  }

  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
      <code className="font-mono text-[11.5px] leading-relaxed text-foreground">
        {code}
      </code>
    </pre>
  );
}