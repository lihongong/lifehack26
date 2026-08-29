import { useState } from "react";

export default function ProfileForm({ participant, submitLabel, onSubmit }) {
  const [displayName, setDisplayName] = useState(participant?.displayName || "");
  const [nusZone, setNusZone] = useState(participant?.nusZone || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit({ displayName, nusZone });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="profile-form" onSubmit={submit}>
      <label>
        Public display name
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          minLength={3}
          maxLength={30}
          required
          autoComplete="nickname"
        />
      </label>
      <label>
        Private NUS Zone
        <select value={nusZone} onChange={(event) => setNusZone(event.target.value)}>
          <option value="">Not selected</option>
          <option>Kent Ridge</option>
          <option>Bukit Timah</option>
          <option>Outram</option>
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-action" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
