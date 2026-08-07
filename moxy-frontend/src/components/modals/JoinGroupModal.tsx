// src/components/modals/JoinGroupModal.tsx
import { useState } from "react";
import { Modal, useFormStyles } from "@/components/ui/Modal";
import { useColors } from "@/lib/theme";
import { groupApi } from "@/api/services";
import { useUIStore, useToastStore } from "@/store";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/hooks/useQueries";

interface Props {
  onClose: () => void;
}

export function JoinGroupModal({ onClose }: Props) {
  const F = useFormStyles();
  const C = useColors();
  const qc = useQueryClient();
  const { addToast } = useToastStore.getState();
  const { setActiveGroup, setActivePage } = useUIStore();

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  const handleJoin = async () => {
    const parsed = code.trim().split("/").pop() ?? "";
    if (!parsed) { setError("Please enter an invite link or code"); return; }
    setError("");
    setJoining(true);
    try {
      const group = await groupApi.joinByInvite(parsed);
      await qc.invalidateQueries({ queryKey: QK.groups });
      addToast({ emoji: group.icon, title: `Joined ${group.name}!` });
      setActiveGroup(group.id);
      setActivePage("dashboard");
      onClose();
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? "Invalid invite code";
      setError(msg);
    } finally {
      setJoining(false);
    }
  };

  return (
    <Modal title="Join a Group" onClose={onClose} width={420}>
      <p style={{ color: C.textMuted, fontSize: 13, margin: "0 0 20px" }}>
        Paste an invite link or code shared by a group member.
      </p>

      <div style={F.group}>
        <label style={F.label}>Invite link or code</label>
        <input
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !joining) handleJoin(); }}
          placeholder="https://moxy-brown.vercel.app/join/abc123"
          style={{ ...F.input, borderColor: error ? C.red : C.border }}
        />
        {error && (
          <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{error}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={onClose} style={F.btn.ghost}>Cancel</button>
        <button
          onClick={handleJoin}
          disabled={joining}
          style={{
            ...F.btn.primary,
            opacity: joining ? 0.6 : 1,
            cursor: joining ? "not-allowed" : "pointer",
          }}
        >{joining ? "Joining…" : "Join Group"}</button>
      </div>
    </Modal>
  );
}