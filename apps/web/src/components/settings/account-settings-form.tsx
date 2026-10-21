"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Hint, Input, Label, NativeSelect } from "@brandloop/ui";
import { updateProfileSettingsAction } from "@/app/(app)/actions";
import { languages } from "@/lib/locales";

type ProfileFields = { id: string; name: string; language: string; timezone: string };

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 border-b border-line py-6 sm:grid-cols-[200px_1fr] sm:gap-8">{children}</div>;
}

export function AccountSettingsForm({ email, profile }: { email: string; profile: ProfileFields }) {
  const [values, setValues] = useState(profile);
  const [pending, startTransition] = useTransition();
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const dirty =
    values.name !== profile.name || values.language !== profile.language || values.timezone !== profile.timezone;

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfileSettingsAction(profile.id, {
        name: values.name,
        language: values.language,
        timezone: values.timezone,
      });
      if (result.ok) toast.success("Settings saved");
      else toast.error(result.error);
    });
  }

  return (
    <form onSubmit={save} className="max-w-2xl">
      <p className="text-sm text-ink-muted">
        These settings apply to the profile you’re working in now. Signed in as {email}.
      </p>
      <Row>
        <div>
          <Label htmlFor="name">Profile name</Label>
          <Hint className="mt-1">Shown in the profile menu.</Hint>
        </div>
        <Input id="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required />
      </Row>
      <Row>
        <div>
          <Label htmlFor="language">Language</Label>
          <Hint className="mt-1">The language the AI writes and replies in.</Hint>
        </div>
        <NativeSelect id="language" value={values.language} onChange={(e) => setValues({ ...values, language: e.target.value })}>
          {languages.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Hint className="mt-1">Used when scheduling posts.</Hint>
        </div>
        <NativeSelect id="timezone" value={values.timezone} onChange={(e) => setValues({ ...values, timezone: e.target.value })}>
          {!timezones.includes(values.timezone) && <option value={values.timezone}>{values.timezone}</option>}
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll("_", " ")}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <div className="flex justify-end gap-2 pt-6">
        <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => setValues(profile)}>
          Discard
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
