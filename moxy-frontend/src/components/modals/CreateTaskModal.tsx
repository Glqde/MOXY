// src/components/modals/CreateTaskModal.tsx
import { useState, useEffect } from "react";
import { Modal, useFormStyles } from "@/components/ui/Modal";
import { useColors } from "@/lib/theme";
import { useCreateTask } from "@/hooks/useQueries";
import { useUIStore } from "@/store";
import type { Priority, RecurrenceType, TaskCreate } from "@/types";

const EMOJIS = ["✅","🐱","🐶","🗑️","🛒","⚡","🚿","📝","📅","💊","🌱","🔑","📦","🧹","💡","🎯","🍳","🏋️"];
const CATEGORIES = ["Chores", "Pet Care", "Shopping", "Bills", "Health", "Work", "Personal", "Other"];
const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "hourly",  label: "Hourly" },
  { value: "daily",   label: "Daily" },
  { value: "weekly",  label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "minutes", label: "Every N minutes" },
  { value: "custom",  label: "Custom (cron)" },
];

interface Props {
  groupId: string;
}

export function CreateTaskModal({ groupId }: Props) {
  const F = useFormStyles();
  const C = useColors();
  const { toggleCreateTask } = useUIStore();
  const createTask = useCreateTask(groupId);

  // Reset stuck mutation on mount (same fix as CreateGroupModal)
  useEffect(() => {
    createTask.reset();
  }, []);

  const [form, setForm] = useState<{
    title: string; emoji: string; description: string;
    priority: Priority; category: string; tags: string;
    recurrenceType: RecurrenceType; intervalValue: string; cronExpr: string;
  }>({
    title: "", emoji: "✅", description: "",
    priority: "medium", category: "Chores", tags: "",
    recurrenceType: "daily", intervalValue: "1", cronExpr: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (form.recurrenceType === "custom" && !form.cronExpr.trim())
      e.cronExpr = "Cron expression required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const payload: TaskCreate = {
      title: form.title.trim(),
      emoji: form.emoji,
      description: form.description.trim() || undefined,
      priority: form.priority,
      category: form.category || undefined,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      assigned_member_ids: [],
      recurrence: {
        recurrence_type: form.recurrenceType,
        interval_value: ["minutes", "hourly", "daily", "weekly", "monthly"].includes(form.recurrenceType)
          ? parseInt(form.intervalValue) || 1 : undefined,
        cron_expression: form.recurrenceType === "custom" ? form.cronExpr : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        cooldown_minutes: 0,
      },
    };

    try {
      await createTask.mutateAsync(payload);
      toggleCreateTask();
    } catch {
      // error handled by mutation (toast shown)
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Modal
      title="Create Shared Task"
      onClose={toggleCreateTask}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={toggleCreateTask} style={F.btn.ghost}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={createTask.isPending}
            style={{ ...F.btn.primary, opacity: createTask.isPending ? 0.6 : 1 }}
          >
            {createTask.isPending ? "Creating…" : "Create Task"}
          </button>
        </div>
      }
    >
      {/* Emoji picker */}
      <div style={F.group}>
        <label style={F.label}>Icon</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setForm((f) => ({ ...f, emoji: e }))}
              style={{
                width: 36, height: 36, borderRadius: 8, border: "1.5px solid",
                borderColor: form.emoji === e ? C.accent : C.border,
                background: form.emoji === e ? C.accentSoft : C.bgElevated,
                fontSize: 18, cursor: "pointer", transition: "all 0.15s",
              }}
            >{e}</button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div style={F.group}>
        <label style={F.label}>Title *</label>
        <input
          value={form.title} onChange={set("title")}
          placeholder="e.g. Feed the cat"
          style={{ ...F.input, borderColor: errors.title ? C.red : C.border }}
        />
        {errors.title && <div style={{ color: C.red, fontSize: 11, marginTop: 4 }}>{errors.title}</div>}
      </div>

      {/* Description */}
      <div style={F.group}>
        <label style={F.label}>Description</label>
        <textarea
          value={form.description} onChange={set("description")}
          placeholder="Optional details…" rows={2}
          style={{ ...F.input, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {/* Priority + Category */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={F.label}>Priority</label>
          <select value={form.priority} onChange={set("priority")} style={F.select}>
            <option value="low">🟢 Low</option>
            <option value="medium">🟡 Medium</option>
            <option value="high">🔴 High</option>
          </select>
        </div>
        <div>
          <label style={F.label}>Category</label>
          <select value={form.category} onChange={set("category")} style={F.select}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Recurrence */}
      <div style={F.group}>
        <label style={F.label}>Recurrence</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <select value={form.recurrenceType} onChange={set("recurrenceType")} style={F.select}>
            {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {form.recurrenceType !== "custom" ? (
            <input
              type="number" min="1" max="999"
              value={form.intervalValue} onChange={set("intervalValue")}
              placeholder="Interval" style={F.input}
            />
          ) : (
            <input
              value={form.cronExpr} onChange={set("cronExpr")}
              placeholder="0 7,19 * * *"
              style={{ ...F.input, borderColor: errors.cronExpr ? C.red : C.border }}
            />
          )}
        </div>
        {errors.cronExpr && <div style={{ color: C.red, fontSize: 11, marginTop: 4 }}>{errors.cronExpr}</div>}
        <div style={{ color: C.textSub, fontSize: 11, marginTop: 5 }}>
          Task resets automatically after each period. Any member can complete it once per period.
        </div>
      </div>

      {/* Tags */}
      <div style={F.group}>
        <label style={F.label}>Tags (comma separated)</label>
        <input
          value={form.tags} onChange={set("tags")}
          placeholder="chores, weekly, important"
          style={F.input}
        />
      </div>
    </Modal>
  );
}