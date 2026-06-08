// src/components/ui/Modal.tsx
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useColors } from "@/lib/theme";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}

export function Modal({ title, onClose, children, width = 440, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const C = useColors();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, animation: "fadeIn 0.15s ease",
      }}
    >
      <div style={{
        background: C.bgCard, border: `1px solid ${C.border}`,
        borderRadius: 16, width, maxWidth: "100%",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        animation: "slideUp 0.2s ease",
        display: "flex", flexDirection: "column", maxHeight: "90vh",
        transition: "background 0.2s, border-color 0.2s",
      }}>
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{
            background: C.bgElevated, border: "none",
            color: C.textMuted, cursor: "pointer", fontSize: 16,
            width: 28, height: 28, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div style={{
            padding: "14px 20px",
            borderTop: `1px solid ${C.border}`,
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

export function useFormStyles() {
  const C = useColors();
  return {
    label: { color: C.textMuted, fontSize: 12, fontWeight: 500, letterSpacing: "0.3px", marginBottom: 6, display: "block" as const },
    input: {
      width: "100%", padding: "10px 12px",
      background: C.bgElevated, border: `1px solid ${C.border}`,
      borderRadius: 10, color: C.text, fontSize: 13, outline: "none",
      boxSizing: "border-box" as const, fontFamily: "inherit",
      transition: "border-color 0.15s",
    },
    select: {
      width: "100%", padding: "10px 12px",
      background: C.bgElevated, border: `1px solid ${C.border}`,
      borderRadius: 10, color: C.text, fontSize: 13, outline: "none",
      boxSizing: "border-box" as const, fontFamily: "inherit",
      cursor: "pointer",
    },
    group: { marginBottom: 16 } as const,
    btn: {
      primary: {
        padding: "10px 20px", borderRadius: 10, border: "none",
        background: C.accent, color: "#fff", fontSize: 13,
        fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
      },
      ghost: {
        padding: "10px 20px", borderRadius: 10,
        border: `1px solid ${C.border}`,
        background: "transparent", color: C.textMuted,
        fontSize: 13, cursor: "pointer", fontFamily: "inherit",
      },
      danger: {
        padding: "10px 20px", borderRadius: 10, border: "none",
        background: C.redSoft, color: C.red,
        fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
      },
    },
  };
}