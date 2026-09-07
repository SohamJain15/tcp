import type { ScheduleDraft } from "@/api/classrooms";
import { istInput, istToUtc, newRequestKey } from "@/api/classrooms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ThemedSelect";

export const newSchedule = (): ScheduleDraft => ({
  id: newRequestKey(),
  title: "Lab session",
  startAt: new Date(Date.now() + 86400000).toISOString(),
  durationMinutes: 60,
  experimentIds: [],
  language: "sql",
});
export function ClassroomScheduleEditor({
  value,
  onChange,
  experiments,
  onRemove,
}: {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  onRemove?: () => void;
  experiments: Array<{
    id: string;
    title: string;
    kind: string;
    supportedLanguages?: string[];
  }>;
}) {
  const selected = experiments.filter((e) =>
    value.experimentIds.includes(e.id),
  );
  const languages = selected.length
    ? selected[0].kind === "sql"
      ? ["sql"]
      : (selected[0].supportedLanguages ?? []).filter((language) =>
          selected.every((e) => e.supportedLanguages?.includes(language)),
        )
    : [];
  const changeSelection = (ids: string[]) => {
    const chosen = experiments.filter((e) => ids.includes(e.id));
    const allowed = chosen.length
      ? chosen[0].kind === "sql"
        ? ["sql"]
        : (chosen[0].supportedLanguages ?? []).filter((l) =>
            chosen.every((e) => e.supportedLanguages?.includes(l)),
          )
      : [];
    onChange({
      ...value,
      experimentIds: ids,
      language: allowed.includes(value.language)
        ? value.language
        : (allowed[0] ?? ""),
    });
  };
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          Session title
          <Input
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Start (India time)
          <Input
            type="datetime-local"
            value={istInput(value.startAt)}
            onChange={(e) => {
              if (e.target.value)
                onChange({ ...value, startAt: istToUtc(e.target.value) });
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Duration (minutes)
          <Input
            type="number"
            min={1}
            max={240}
            value={value.durationMinutes}
            onChange={(e) =>
              onChange({ ...value, durationMinutes: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-semibold">
          Experiments for this session
        </legend>
        {experiments.map((e, index) => (
          <label key={e.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.experimentIds.includes(e.id)}
              onChange={(event) =>
                changeSelection(
                  event.target.checked
                    ? [...value.experimentIds, e.id]
                    : value.experimentIds.filter((id) => id !== e.id),
                )
              }
            />
            {index + 1}. {e.title || "Untitled"}
          </label>
        ))}
      </fieldset>
      <div className="flex items-end justify-between gap-3">
        <div className="w-60 space-y-1">
          <p className="text-sm">Required execution language</p>
          <ThemedSelect
            value={value.language}
            onValueChange={(language) => onChange({ ...value, language })}
            options={languages.map((l) => ({
              value: l,
              label: l === "sql" ? "SQL" : l,
            }))}
            placeholder="Select experiments first"
          />
          {selected.length > 0 && !languages.length && (
            <p role="alert" className="text-sm text-destructive">
              These experiments have no common language.
            </p>
          )}
        </div>
        {onRemove && (
          <Button variant="ghost" onClick={onRemove}>
            Remove session
          </Button>
        )}
      </div>
    </div>
  );
}
