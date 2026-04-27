import { useState, useRef, useEffect } from "react";

/**
 * Редактируемое число внутри SVG.
 * По клику превращается в <input> через <foreignObject>.
 * Поддерживает математические выражения: "538+16", "+16", "-5", "30-30".
 */
interface SvgInputProps {
  x: number;
  y: number;
  width: number;
  value: number;
  onChange: (v: number) => void;
  color?: string;
  anchor?: "start" | "middle" | "end";
  fontSize?: number;
}

export function SvgInput({
  x, y, width, value, onChange,
  color = "#d97706", anchor = "middle", fontSize = 9,
}: SvgInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setText(String(value)); }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const commit = (rawText: string) => {
    setEditing(false);
    const input = String(rawText).trim().replace(/\s/g, '');
    let n = NaN;
    const mathMatch = input.match(/^(-?\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/);
    if (mathMatch) {
      // Regex имеет три capture-группы — при успешном match они всегда определены.
      const a = parseFloat(mathMatch[1]!);
      const b = parseFloat(mathMatch[3]!);
      n = mathMatch[2] === '+' ? a + b : a - b;
    } else if (input.length >= 2 && (input[0] === '+' || input[0] === '-')) {
      const num = parseFloat(input.slice(1));
      if (!isNaN(num)) n = input[0] === '+' ? value + num : value - num;
    } else {
      const num = parseFloat(input);
      if (!isNaN(num)) n = num;
    }
    if (!isNaN(n) && n >= 0 && n < 5000) {
      onChange(Math.round(n));
    } else {
      setText(String(value));
    }
  };

  const foW = Math.max(width, 42);
  const foX = anchor === "middle" ? x - foW / 2 : x;

  if (!editing) {
    return (
      <text
        x={x} y={y} textAnchor={anchor} fontSize={fontSize} fill={color}
        fontWeight="bold"
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={e => { e.stopPropagation(); setEditing(true); }}
        onMouseDown={e => e.stopPropagation()}
        fontFamily="'IBM Plex Mono',monospace"
      >{Math.round(value)}</text>
    );
  }

  return (
    <foreignObject x={foX} y={y - 12} width={foW} height={18}>
      <input
        ref={ref}
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === "Enter") { commit((e.target as HTMLInputElement).value); }
          if (e.key === "Escape") { setEditing(false); setText(String(value)); }
          if (e.key === "Tab") { e.preventDefault(); commit((e.target as HTMLInputElement).value); }
        }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        placeholder="538+16"
        style={{
          width: "100%", height: "100%",
          padding: "0 2px",
          fontSize: fontSize + 1,
          fontFamily: "'IBM Plex Mono',monospace",
          background: "#111318",
          border: `1.5px solid ${color}`,
          borderRadius: 3,
          color,
          outline: "none",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      />
    </foreignObject>
  );
}
