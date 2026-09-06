import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string;
          poster?: string;
          alt?: string;
          "camera-controls"?: boolean | "";
          "auto-rotate"?: boolean | "";
          "auto-rotate-delay"?: string | number;
          "interaction-prompt"?: "auto" | "when-focused" | "none";
          "shadow-intensity"?: string | number;
          "environment-image"?: string;
          exposure?: string | number;
          "camera-orbit"?: string;
          "field-of-view"?: string;
          loading?: "auto" | "lazy" | "eager";
          reveal?: "auto" | "interaction" | "manual";
          ar?: boolean | "";
          "touch-action"?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
