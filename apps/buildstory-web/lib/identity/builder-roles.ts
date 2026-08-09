export const BUILDER_ROLES = [
  "independent-builder",
  "engineer",
  "designer",
  "founder",
  "product",
  "student",
  "other",
] as const;

export type BuilderRole = (typeof BUILDER_ROLES)[number];

export const BUILDER_ROLE_LABELS: Record<BuilderRole, string> = {
  "independent-builder": "Independent builder",
  engineer: "Engineer",
  designer: "Designer",
  founder: "Founder",
  product: "Product",
  student: "Student / learning",
  other: "Other",
};

export function isBuilderRole(value: unknown): value is BuilderRole {
  return typeof value === "string" && (BUILDER_ROLES as readonly string[]).includes(value);
}

export function builderRoleLabel(value: BuilderRole | null | undefined): string | null {
  return value ? BUILDER_ROLE_LABELS[value] : null;
}
