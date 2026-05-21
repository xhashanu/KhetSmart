type Props = { value: number; alertLevel: string };

export function GlutGauge({ value, alertLevel }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const color =
    alertLevel === "HIGH" ? "#c0392b" : alertLevel === "MEDIUM" ? "#c99a12" : "#2d5a45";

  return (
    <div className="glut-gauge" aria-label={`Glut risk ${clamped}%`}>
      <svg viewBox="0 0 120 120" className="glut-gauge__svg">
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke="rgba(26,61,46,0.12)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray="226 302"
          transform="rotate(135 60 60)"
        />
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * 226} 302`}
          transform="rotate(135 60 60)"
          className="glut-gauge__arc"
        />
      </svg>
      <div className="glut-gauge__center">
        <span className="glut-gauge__value">{clamped}%</span>
        <span className="glut-gauge__label">Glut risk</span>
      </div>
      <span className={`glut-gauge__badge glut-gauge__badge--${alertLevel.toLowerCase()}`}>
        {alertLevel}
      </span>
    </div>
  );
}
