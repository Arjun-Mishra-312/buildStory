import { modelBrandFallbackLetter, resolveModelBrand, resolveProviderBrand, type ModelBrand } from "@/lib/brands/model-mark";

function MarkView({ brand, label, className = "" }: { brand: ModelBrand | null; label: string; className?: string }) {
  if (!brand) {
    return (
      <span className={`model-mark model-mark--fallback ${className}`.trim()} aria-hidden="true">
        {modelBrandFallbackLetter(label)}
      </span>
    );
  }
  return (
    <span
      className={`model-mark ${className}`.trim()}
      data-brand={brand.id}
      style={{ maskImage: `url(${brand.src})`, WebkitMaskImage: `url(${brand.src})` }}
      aria-hidden="true"
    />
  );
}

export function ModelMark({
  id,
  label,
  provider,
  className,
}: {
  id?: string | null;
  label?: string | null;
  provider?: string | null;
  className?: string;
}) {
  const brand = resolveModelBrand({ id, label, provider });
  return <MarkView brand={brand} label={label || id || ""} className={className} />;
}

export function ProviderMark({ provider, className }: { provider: string; className?: string }) {
  const brand = resolveProviderBrand(provider);
  return <MarkView brand={brand} label={provider} className={className} />;
}

export function ModelName({
  id,
  label,
  provider,
  className,
}: {
  id?: string | null;
  label: string;
  provider?: string | null;
  className?: string;
}) {
  return (
    <span className={`model-name ${className ?? ""}`.trim()}>
      <ModelMark id={id} label={label} provider={provider} />
      <span>{label}</span>
    </span>
  );
}
