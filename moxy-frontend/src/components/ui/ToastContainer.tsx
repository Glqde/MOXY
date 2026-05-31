// src/components/ui/ToastContainer.tsx
import { useToastStore } from "@/store";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      display: "flex", flexDirection: "column", gap: 8, zIndex: 9999,
      alignItems: "center",
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          style={{
            background: "#16161F",
            border: `1px solid rgba(124,111,255,0.4)`,
            borderRadius: 12, padding: "12px 20px",
            display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 0 0 1px rgba(124,111,255,0.2), 0 8px 32px rgba(0,0,0,0.6)",
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
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
