"use client";
import { useTheme, type Theme } from "@/lib/hooks/use-theme";
import { Sun, Moon, Monitor } from "lucide-react";

const OPTIONS: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: "light", icon: <Sun className="w-3.5 h-3.5" />, label: "Claro" },
  { value: "dark", icon: <Moon className="w-3.5 h-3.5" />, label: "Oscuro" },
  { value: "system", icon: <Monitor className="w-3.5 h-3.5" />, label: "Sistema" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/40 border" role="radiogroup" aria-label="Tema">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={theme === opt.value}
          aria-label={opt.label}
          onClick={() => setTheme(opt.value)}
          className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
            theme === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
