import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const fieldClasses =
  "w-full rounded-field border border-white/15 bg-black/40 px-4 text-sm text-paper placeholder:text-mist/70 " +
  "transition-[border-color,box-shadow,background-color] duration-300 ease-apple " +
  "hover:border-white/25 focus:border-white/60 focus:bg-black/60 focus:outline-none focus:ring-4 focus:ring-white/10 " +
  "aria-[invalid=true]:border-danger/70 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/20 disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClasses, "h-12", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(fieldClasses, "py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(fieldClasses, "h-12 appearance-none bg-[length:14px] pr-10", className)} {...props}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238E8E93' stroke-width='1.6'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 14px center",
      }}
    >
      {children}
    </select>
  );
}
