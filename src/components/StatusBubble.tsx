type StatusBubbleProps = {
  text: string;
};

export default function StatusBubble({ text }: StatusBubbleProps) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        background: "rgba(15,123,108,0.10)",
        border: "1px solid rgba(15,123,108,0.14)",
        color: "#0f6d61",
        fontWeight: 700,
        lineHeight: 1.4,
      }}
    >
      {text}
    </div>
  );
}
