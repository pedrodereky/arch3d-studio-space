import { Link } from "@tanstack/react-router";

/**
 * A marca do Arq3D Studio — o mesmo desenho do favicon.
 *
 * As cores são fixas, não tokens: uma marca não reflui com o tema. Se ela
 * mudasse junto com a interface, deixaria de bater com o ícone da aba, que é
 * um arquivo estático e não tem como acompanhar.
 *
 * Desenhada inline em vez de <img src="/favicon.svg"> para escalar sem
 * requisição e não piscar no primeiro render.
 */
export function Mark({ className = "", size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Arq3D Studio"
    >
      <rect width="64" height="64" rx="13" fill="#02162A" />
      <path d="M32 12 L55 54 L43 54 L32 32 L21 54 L9 54 Z" fill="#FFFFFF" />
      <rect x="16.7" y="39.6" width="30.6" height="5" fill="#7FA8D4" />
    </svg>
  );
}

/**
 * Marca + nome curto, para o topo da barra lateral.
 *
 * Por que "Arq3D" e não o wordmark inteiro: a barra tem 244px, o que deixa
 * 196px úteis com o padding atual. Medido no Chromium com a Avenir real,
 * "ARQ3D STUDIO" com tracking 0.22em ocupa 171,8px sozinho — e 187,6px se a
 * fonte não tiver carregado ainda. Somar a marca estouraria a barra,
 * garantido no primeiro paint. Este lockup dá 77px (84 no pior caso).
 *
 * O wordmark completo continua na landing, no login e na página pública do
 * cliente, onde há espaço.
 */
export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2.5 ${className}`} aria-label="Arq3D Studio">
      <Mark />
      <span className="text-[15px] font-black leading-none tracking-[-0.01em] text-primary">
        Arq3D
      </span>
    </Link>
  );
}
