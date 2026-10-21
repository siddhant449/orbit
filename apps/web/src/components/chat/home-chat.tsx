"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Composer } from "@/components/home/composer";
import type { ComposerRect } from "./chat-composer";

const loadChatView = () => import("./chat-view").then((m) => m.ChatView);
const ChatView = dynamic(loadChatView);

type Started = { id: string; text: string; from: ComposerRect | null };

/**
 * The home screen: the landing composer until the first send, then the chat itself, in place. The docked
 * composer glides down from where the landing one sat. Once the first reply ends, the address becomes
 * `/chat/<id>` without remounting anything.
 */
export function HomeChat(props: Omit<ComponentProps<typeof Composer>, "onSend">) {
  const pathname = usePathname();
  const [started, setStarted] = useState<Started | null>(null);
  const moved = useRef(false);

  // Warm the chat chunk once the page is idle, so the first send doesn't wait on it.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const handle = idle(() => void loadChatView());
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(handle);
  }, []);

  // "New chat" (or the home link) while the first turn still runs on "/": the address doesn't change, so a
  // click on any link to "/" starts fresh. The turn keeps running on the server and shows up in the list.
  useEffect(() => {
    if (!started) return;
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href="/"]');
      if (link && window.location.pathname === "/") setStarted(null);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [started]);

  // Back on "/" after the address moved to the chat (the home link, the back button): start fresh.
  useEffect(() => {
    if (pathname === "/" && moved.current) {
      moved.current = false;
      setStarted(null);
    }
  }, [pathname]);

  function onSend(text: string) {
    const box = document.getElementById("composer")?.closest("form")?.getBoundingClientRect();
    setStarted({
      id: crypto.randomUUID(),
      text,
      from: box ? { top: box.top, left: box.left, width: box.width, height: box.height } : null,
    });
  }

  function onFirstFinish(id: string) {
    if (window.location.pathname !== "/") return;
    const hadFocus = document.activeElement?.id === "chat-composer";
    moved.current = true;
    window.history.replaceState(null, "", `/chat/${id}`);
    // The shell moves focus to the page heading on an address change; keep the writer where they were.
    if (!hadFocus) return;
    const composer = () => document.getElementById("chat-composer");
    const guard = (e: FocusEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "H1") composer()?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", guard);
    window.setTimeout(() => document.removeEventListener("focusin", guard), 1000);
    // In case the heading took focus before the guard was listening.
    window.setTimeout(() => {
      if (document.activeElement?.tagName === "H1") composer()?.focus({ preventScroll: true });
    }, 50);
  }

  if (!started) return <Composer {...props} onSend={onSend} />;
  return (
    <ChatView
      key={started.id}
      chatId={started.id}
      title="New chat"
      initialMessages={[]}
      voices={props.voices}
      selectedVoiceId={props.selectedVoiceId}
      initialText={started.text}
      fromRect={started.from}
      onFirstFinish={() => onFirstFinish(started.id)}
    />
  );
}
