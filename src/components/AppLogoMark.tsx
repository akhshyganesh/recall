import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  alt?: string;
};

export function AppLogoMark({ className, alt = "Recall" }: Props) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      draggable={false}
      className={cn("size-5 shrink-0 object-contain select-none", className)}
    />
  );
}
