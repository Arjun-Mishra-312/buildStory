"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUILDER_ROLES, BUILDER_ROLE_LABELS, type BuilderRole } from "@/lib/identity/builder-roles";

type ProfileSettingsProps = {
  handle: string;
  displayName: string;
  bio: string;
  builderRole: BuilderRole | null;
  handleChangeAvailable: boolean;
};

export function ProfileSettings({ handle, displayName, bio, builderRole, handleChangeAvailable }: ProfileSettingsProps) {
  const router = useRouter();
  const [displayNameValue, setDisplayNameValue] = useState(displayName);
  const [bioValue, setBioValue] = useState(bio);
  const [handleValue, setHandleValue] = useState(handle);
  const [builderRoleValue, setBuilderRoleValue] = useState<BuilderRole | "">(builderRole ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const update: Record<string, string | null> = { displayName: displayNameValue, bio: bioValue, builderRole: builderRoleValue || null };
      if (handleChangeAvailable && handleValue.trim().toLocaleLowerCase("en-US") !== handle.toLocaleLowerCase("en-US")) {
        update.handle = handleValue;
      }
      const response = await fetch("/api/creator/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Could not save your profile.");
        return;
      }
      const data = (await response.json()) as { profile: { handle: string } };
      setSaved(true);
      if (data.profile.handle !== handle) router.push("/studio/settings");
      else router.refresh();
    } catch {
      setError("Could not save your profile. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-settings">
      <section className="report-card">
        <header><span>PUBLIC PROFILE</span><strong>Edit your name, bio, and handle</strong></header>
        <label>
          <span>Display name</span>
          <input value={displayNameValue} onChange={(event) => setDisplayNameValue(event.target.value)} maxLength={80} />
        </label>
        <fieldset className="builder-role-fieldset">
          <legend>Builder role <small>Optional</small></legend>
          <div className="builder-role-options">
            {BUILDER_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                className={builderRoleValue === role ? "is-selected" : undefined}
                aria-pressed={builderRoleValue === role}
                onClick={() => setBuilderRoleValue((current) => current === role ? "" : role)}
              >
                {BUILDER_ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          <span>Bio <small>{bioValue.length}/280</small></span>
          <textarea value={bioValue} onChange={(event) => setBioValue(event.target.value)} maxLength={280} rows={3} />
        </label>
        <label>
          <span>
            Handle {handleChangeAvailable ? "(you can change this once)" : "(already used your one change)"}
          </span>
          <input
            value={handleValue}
            onChange={(event) => setHandleValue(event.target.value)}
            disabled={!handleChangeAvailable}
            maxLength={32}
          />
        </label>
        {error ? <p className="comment-thread__error" role="alert">{error}</p> : null}
        {saved ? <p className="report-card__saved" role="status">Profile saved successfully.</p> : null}
        <button className="button button--primary" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </section>
    </div>
  );
}
