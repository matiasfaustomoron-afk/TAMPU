import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils/helpers";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "gradient";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const variantStyles: Record<string, string> = {
  default:
    "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:-translate-y-px active:translate-y-0 active:brightness-95",
  gradient:
    "text-white shadow-md bg-[linear-gradient(135deg,_oklch(0.68_0.16_38),_oklch(0.55_0.18_55))] hover:brightness-110 hover:-translate-y-px active:translate-y-0",
  destructive:
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:-translate-y-px active:translate-y-0",
  outline:
    "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground hover:-translate-y-px active:translate-y-0",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-px active:translate-y-0",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
};

const sizeStyles: Record<string, string> = {
  default: "h-10 px-5 py-2 text-sm",
  sm: "h-8 rounded-lg px-3 text-xs",
  lg: "h-12 rounded-xl px-7 text-base",
  icon: "h-10 w-10 rounded-xl",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium",
          "ring-offset-background transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
