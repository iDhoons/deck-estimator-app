type Option<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedToggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
}) {
  return (
    <div>
      {label && <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{label}</div>}

      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: "inline-flex",
          border: "1px solid #333",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              style={{
                padding: "10px 12px",
                border: "none",
                background: selected ? "#111" : "#fff",
                color: selected ? "#fff" : "#111",
                cursor: "pointer",
                fontWeight: 700,
                letterSpacing: 0.2,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
