// Componentes de mídia que reassinam URLs do Storage automaticamente.
// Usar no lugar de <img>/<video>/<a> sempre que a URL puder ser uma
// signed URL do Supabase Storage que possa ter expirado.
import { useFreshUrl } from "@/lib/use-fresh-url";

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

export function FreshImg({ src, ...rest }: ImgProps) {
  const fresh = useFreshUrl(src);
  if (!fresh) return null;
  return <img src={fresh} {...rest} />;
}

type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> & {
  src: string | null | undefined;
  poster?: string | null;
};

export function FreshVideo({ src, poster, ...rest }: VideoProps) {
  const freshSrc = useFreshUrl(src);
  const freshPoster = useFreshUrl(poster);
  if (!freshSrc) return null;
  return <video src={freshSrc} poster={freshPoster ?? undefined} {...rest} />;
}

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | null | undefined;
};

export function FreshLink({ href, children, ...rest }: LinkProps) {
  const fresh = useFreshUrl(href);
  if (!fresh) return null;
  return (
    <a href={fresh} {...rest}>
      {children}
    </a>
  );
}
