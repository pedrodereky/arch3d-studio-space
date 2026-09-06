import { Link } from "@tanstack/react-router";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`font-black uppercase tracking-[0.22em] text-[1.05rem] leading-none ${className}`}
    >
      Arq3D Studio
    </Link>
  );
}
