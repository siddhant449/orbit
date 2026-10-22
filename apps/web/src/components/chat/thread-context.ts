"use client";

import { createContext, useContext } from "react";

/**
 * Where a thread is rendered. On `/chat/:id` the address names the chat; in the post editor (`/posts/:id`) it doesn't,
 * so the editor provides the chat id here, and marks the thread as sitting beside its own post.
 */
export type ThreadPlace = { chatId: string; inPostEditor: boolean };
export const ThreadPlaceContext = createContext<ThreadPlace | null>(null);
export const useThreadPlace = () => useContext(ThreadPlaceContext);
