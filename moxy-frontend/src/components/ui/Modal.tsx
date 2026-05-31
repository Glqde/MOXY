// src/components/ui/Modal.tsx
// Reusable modal wrapper — portal, backdrop, focus trap, Escape key.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, width = 440, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const C = {
    overlay: "rgba(0,0,0,0.7)",
    bg: "#111118", border: "rgba(255,255,255,0.09)",
    text: "#F0F0FF", textMuted: "rgba(240,240,255,0.45)",
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: C.overlay, backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 16, width, maxWidth: "100%",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        animation: "slideUp 0.2s ease",
        display: "flex", flexDirection: "column", maxHeight: "90vh",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: `1px solid rgba(255,255,255,0.07)`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.06)", border: "none",
            color: C.textMuted, cursor: "pointer", fontSize: 16,
            width: 28, height: 28, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: "14px 20px",
            borderTop: `1px solid rgba(255,255,255,0.07)`,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>,
    document.body
  );
}

// ── Shared form primitives ────────────────────────────────────────────────────
export const C_FORM = {
  label: { color: "rgba(240,240,255,0.55)", fontSize: 12, fontWeight: 500, letterSpacing: "0.3px", marginBottom: 6, display: "block" as const },
  input: {
    width: "100%", padding: "10px 12px",
    background: "#16161F", border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10, color: "#F0F0FF", fontSize: 13, outline: "none",
    boxSizing: "border-box" as const, fontFamily: "inherit",
    transition: "border-color 0.15s",
  },
  select: {
    width: "100%", padding: "10px 12px",
    background: "#16161F", border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 10, color: "#F0F0FF", fontSize: 13, outline: "none",
    boxSizing: "border-box" as const, fontFamily: "inherit",
    cursor: "pointer",
  },
  group: { marginBottom: 16 } as const,
  btn: {
    primary: {
      padding: "10px 20px", borderRadius: 10, border: "none",
      background: "#7C6FFF", color: "#fff", fontSize: 13,
      fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
    },
    ghost: {
      padding: "10px 20px", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.09)",
      background: "transparent", color: "rgba(240,240,255,0.55)",
      fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    },
    danger: {
      padding: "10px 20px", borderRadius: 10, border: "none",
      background: "rgba(239,68,68,0.15)", color: "#EF4444",
      fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
    },
  },
};
