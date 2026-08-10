type TooltipProps = {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "end";
};

export function Tooltip({ label, children, side = "top", align = "center" }: TooltipProps) {
  return (
    <span className={`tooltip tooltip--${side} tooltip--align-${align}`}>
      {children}
      <span className="tooltip__bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}
