import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

// The platform's single dropdown style (mirrors the student Leaderboard filter):
// square corners, themed borders, accent focus ring — consistent in light & dark mode.
export function ThemedSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  disabled,
  triggerClassName,
}: ThemedSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        className={cn(
          "h-10 w-full rounded-none border-border bg-background px-3 text-sm font-medium text-foreground shadow-none ring-0 transition-colors data-[placeholder]:text-muted-foreground focus:ring-2 focus:ring-accent/30",
          triggerClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="w-[var(--radix-select-trigger-width)] rounded-none border-border bg-card p-0 text-card-foreground shadow-elevated">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
