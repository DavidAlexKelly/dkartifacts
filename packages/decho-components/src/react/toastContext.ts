/**
 * The toast dispatcher, and the hook that reads it.
 *
 * In its own module for the same reason `useDismiss` is: a file exporting both
 * a component and a hook breaks fast refresh. `ToastHost` renders the stack
 * and provides this; `useToast()` is what everything else calls.
 *
 * WHY A CONTEXT, IN A PACKAGE THAT AVOIDS THEM
 * --------------------------------------------
 * The theming layer deliberately has no context — custom properties inherit
 * through the DOM on their own, and the previous styling package's three
 * contexts were the reason it could not theme a portal. This one carries a
 * *function*, not a theme, and a dispatcher has none of those problems. The
 * alternative is threading an `onToast` callback through every component that
 * might fail, which is what consumers do today and why they give up and show
 * nothing.
 */

import React from "react";
import type { Toast } from "./toastQueue.js";

export interface ToastInput extends Omit<Toast, "id" | "count"> {
  id?: string;
}

export interface ToastApi {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/**
 * What `useToast()` returns with no host above it.
 *
 * A no-op rather than a throw. A component that throws because nobody mounted
 * a host turns "no feedback" into "white page", which is a worse failure than
 * the one it is complaining about — and the warning names the message that was
 * dropped, so it is still findable in development.
 */
const NOOP: ToastApi = {
  push: (toast) => {
    if (process.env["NODE_ENV"] !== "production") {
      console.warn(`[decho] useToast() with no <ToastHost> above it. Dropped: ${toast.message}`);
    }
    return "";
  },
  dismiss: () => {},
  clear: () => {},
};

export const ToastContext = React.createContext<ToastApi>(NOOP);

/** The push/dismiss functions. Safe to call without a host; see above. */
export function useToast(): ToastApi {
  return React.useContext(ToastContext);
}
