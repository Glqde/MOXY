// src/components/modals/CreateGroupModal.tsx
import { useState, useEffect } from "react";
import { Modal, C_FORM } from "@/components/ui/Modal";
import { useCreateGroup } from "@/hooks/useQueries";
import { useUIStore } from "@/store";

const ICONS  = ["🏠","👨‍👩‍👧‍👦","🏢","📚","🏕️","🎮","💼","🌿","🍳","🐾","💪","🎯","🏡","✈️","🎸","🌍"];
const COLORS = ["#7C6FFF","#22C55E","#F59E0B","#EF4444","#3B82F6","#EC4899","#14B8A6","#F97316","#8B5CF6","#06B6D4"];

export function CreateGroupModal() {
  const { toggleCreateGroup } = useUIStore();
  const createGroup = useCreateGroup();

  useEffect(() => {
    createGroup.reset();
  }, []);

  const [form, setForm] = useState({
    name: "", description: "", icon: "🏠",
    color: "#7C6FFF", is_private: false,
  });
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Group name is required"); return; }
    try {
      await createGroup.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        icon: form.icon, color: form.color,
        is_private: form.is_private,
      });
      toggleCreateGroup();
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? "Failed to create group");
    }
  };

  return (
    <Modal
      title="Create New Group"
      onClose={toggleCreateGroup}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={toggleCreateGroup} style={C_FORM.btn.ghost}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={createGroup.isPending}
            style={{ ...C_FORM.btn.primary, background: form.color, opacity: createGroup.isPending ? 0.7 : 1 }}
          >
            {createGroup.isPending ? "Creating…" : "Create Group"}
          </button>
        </div>
      }
    >
      {/* Preview */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        padding: "12px 14px", borderRadius: 12,
        background: `${form.color}12`, border: `1px solid ${form.color}30`,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${form.color}25`, border: `1.5px solid ${form.color}50`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>{form.icon}</div>
        <div>
          <div style={{ color: "#F0F0FF", fontSize: 15, fontWeight: 600 }}>
            {form.name || "Group name"}
          </div>
          <div style={{ color: "rgba(240,240,255,0.4)", fontSize: 12 }}>
            {form.description || "No description"}
          </div>
        </div>
      </div>

      {/* Icon */}
      <div style={C_FORM.group}>
        <label style={C_FORM.label}>Icon</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ICONS.map((ic) => (
            <button key={ic} onClick={() => setForm((f) => ({ ...f, icon: ic }))}
              style={{
                width: 38, height: 38, borderRadius: 9, border: "1.5px solid",
                borderColor: form.icon === ic ? form.color : "rgba(255,255,255,0.08)",
                background: form.icon === ic ? `${form.color}20` : "#16161F",
                fontSize: 18, cursor: "pointer", transition: "all 0.15s",
              }}
            >{ic}</button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div style={C_FORM.group}>
        <label style={C_FORM.label}>Color</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {COLORS.map((col) => (
            <button key={col} onClick={() => setForm((f) => ({ ...f, color: col }))}
              style={{
                width: 28, height: 28, borderRadius: "50%", border: "2.5px solid",
                borderColor: form.color === col ? "#fff" : "transparent",
                background: col, cursor: "pointer", transition: "border-color 0.15s",
                outline: form.color === col ? `2px solid ${col}` : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* Name */}
      <div style={C_FORM.group}>
        <label style={C_FORM.label}>Name *</label>
        <input
          value={form.name}
          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError(""); }}
          placeholder="e.g. Westbrook Flat"
          style={{ ...C_FORM.input, borderColor: error ? "#EF4444" : "rgba(255,255,255,0.09)" }}
        />
        {error && <div style={{ color: "#EF4444", fontSize: 11, marginTop: 4 }}>{error}</div>}
      </div>

      {/* Description */}
      <div style={C_FORM.group}>
        <label style={C_FORM.label}>Description</label>
        <input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Optional description"
          style={C_FORM.input}
        />
      </div>

      {/* Private toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#F0F0FF", fontSize: 13 }}>Private group</div>
          <div style={{ color: "rgba(240,240,255,0.4)", fontSize: 11, marginTop: 2 }}>
            Members can only join via invite link
          </div>
        </div>
        <button
          onClick={() => setForm((f) => ({ ...f, is_private: !f.is_private }))}
          style={{
            width: 42, height: 24, borderRadius: 12, border: "none",
            background: form.is_private ? form.color : "rgba(255,255,255,0.12)",
            cursor: "pointer", transition: "background 0.2s",
            position: "relative",
          }}
        >
          <div style={{
            position: "absolute", top: 3,
            left: form.is_private ? 20 : 3,
            width: 18, height: 18, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
          }} />
        </button>
      </div>
    </Modal>
  );
}