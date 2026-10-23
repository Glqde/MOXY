// src/components/ui/ToastContainer.tsx
import { useToastStore, type Toast } from "@/store";

// Accent per toast type: green for completions, amber for undos/info, red for errors
const ACCENT: Record<NonNullable<Toast["type"]>, string> = {
  success: "34,197,94",
  info: "245,158,11",
  error: "239,68,68",
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      display: "flex", flexDirection: "column", gap: 8, zIndex: 9999,
      alignItems: "center",
    }}>
      {toasts.map((t) => {
        const rgb = ACCENT[t.type ?? "success"];
        return (
        <div
          key={t.id}
          role="status"
          onClick={() => removeToast(t.id)}
          style={{
            background: "#16161F",
            border: `1px solid rgba(${rgb},0.45)`,
            borderRadius: 12, padding: "12px 20px",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: `0 0 0 1px rgba(${rgb},0.2), 0 8px 32px rgba(0,0,0,0.6)`,
            cursor: "pointer", minWidth: 240, maxWidth: 360,
            animation: "toastIn 0.3s ease",
          }}
        >
          {t.emoji && <span style={{ fontSize: 18 }}>{t.emoji}</span>}
          <div>
            <div style={{ color: "#F0F0FF", fontSize: 13, fontWeight: 500 }}>{t.title}</div>
            {t.sub && <div style={{ color: "rgba(240,240,255,0.45)", fontSize: 12 }}>{t.sub}</div>}
          </div>
        </div>
        );
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
