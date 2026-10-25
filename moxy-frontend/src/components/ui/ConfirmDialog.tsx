// src/components/ui/ConfirmDialog.tsx
// In-app replacement for window.confirm(). Native dialogs are blocked or
// auto-cancelled in some embedded browsers (and look out of place), so
// destructive actions ask through this instead:
//
//   if (!(await confirmAction({ title: "Delete task?", confirmLabel: "Delete" }))) return;

import { create } from "zustand";
import { Modal } from "@/components/ui/Modal";
import { useColors } from "@/lib/theme";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean; // red confirm button
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

const useConfirmStore = create<ConfirmState>()(() => ({ request: null }));

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().request?.resolve(false); // replace any open one
    useConfirmStore.setState({ request: { danger: true, confirmLabel: "Confirm", ...options, resolve } });
  });
}

function settle(ok: boolean) {
  const { request } = useConfirmStore.getState();
  useConfirmStore.setState({ request: null });
  request?.resolve(ok);
}

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const C = useColors();
  if (!request) return null;

  return (
    <Modal
      title={request.title}
      onClose={() => settle(false)}
      width={380}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => settle(false)} style={{
            padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.border}`,
            background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer",
          }}>Cancel</button>
          <button autoFocus onClick={() => settle(true)} style={{
            padding: "9px 16px", borderRadius: 9, border: "none",
            background: request.danger ? C.red : C.accent, color: "#fff",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>{request.confirmLabel}</button>
        </div>
      }
    >
      {request.message && (
        <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.5 }}>{request.message}</div>
      )}
    </Modal>
  );
}
