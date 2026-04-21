import { useState, useEffect } from "react";

/**
 * Обычное числовое поле HTML (не SVG).
 * Используется в панелях свойств.
 * Поддерживает математические выражения: "538+16", "+16", "-5".
 */
interface NumInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color?: string;
  width?: string;
  label?: string;
}

export function NumInput({
  value, onChange,
  min = 0, max = 5000,
  color = "#d97706", width = "100%",
  label,
}: NumInputProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = (rawText: string) => {
    const input = String(rawText).trim().replace(/\s/g, '');
    let n = NaN;
    const mathMatch = input.match(/^(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/);
    if (mathMatch) {
      const a = parseFloat(mathMatch[1]);
      const b = parseFloat(mathMatch[3]);
      n = mathMatch[2] === '+' ? a + b : a - b;
    } else if (input.length >= 2 && (input[0] === '+' || input[0] === '-')) {
      const num = parseFloat(input.slice(1));
      if (!isNaN(num)) n = input[0] === '+' ? value + num : value - num;
    } else {
      const num = parseFloat(input);
      if (!isNaN(num)) n = num;
    }
    if (!isNaN(n) && n >= min && n <= max) {
      const rounded = Math.round(n);
      onChange(rounded);
      setText(String(rounded));
    } else {
      setText(String(value));
    }
  };

  return (
    <div>
      {label && (
        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>
          {label}
        </div>
      )}
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={e => { setFocused(false); commit(e.target.value); }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setText(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="1200 или 538+16"
        style={{
          width,
          padding: "3px 6px",
          fontSize: 12,
          background: "#111318",
          border: `1px solid ${color}44`,
          borderRadius: 4,
          color,
          outline: "none",
          textAlign: "center",
          fontFamily: "'IBM Plex Mono',monospace",
        }}
      />
    </div>
  );
}
