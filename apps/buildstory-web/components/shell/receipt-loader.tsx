export function ReceiptLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="receipt-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="receipt-loader__card" aria-hidden="true"><span className="receipt-loader__dot" /><span className="receipt-loader__line" /><i /><i /><i /></div>
      <span>{label}</span>
    </div>
  );
}
