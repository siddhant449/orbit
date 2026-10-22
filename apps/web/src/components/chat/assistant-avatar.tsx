import { LogoMark } from "@brandloop/ui";

/** The 28 px Orbit mark beside every reply (screens.md B2, p03). Decorative: the reply names its author for screen readers. */
export function AssistantAvatar() {
  return (
    <span aria-hidden="true" className="assistant-avatar">
      <LogoMark size={14} />
    </span>
  );
}
