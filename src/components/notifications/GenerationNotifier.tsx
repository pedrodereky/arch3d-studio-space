import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function GenerationNotifier() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const askedRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    if (
      !askedRef.current &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      askedRef.current = true;
      void Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel(`user-gens-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "generations",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as { id: string; status: string };
          const old = payload.old as { status?: string };
          if (row.status === old?.status) return;

          if (row.status === "succeeded") {
            await refreshProfile?.();
            toast.success("Modelo 3D pronto", {
              description: "Sua geração está disponível na Biblioteca.",
              action: {
                label: "Ver agora",
                onClick: () =>
                  navigate({
                    to: "/app/biblioteca",
                    search: { destacar: row.id } as never,
                  }),
              },
              duration: 10000,
            });
            tryBrowserNotify("Modelo 3D pronto", "Disponível na Biblioteca", () =>
              navigate({
                to: "/app/biblioteca",
                search: { destacar: row.id } as never,
              }),
            );
          } else if (row.status === "failed") {
            toast.error("Geração falhou", {
              description: "Verifique sua imagem e tente novamente.",
              duration: 8000,
            });
            tryBrowserNotify("Geração falhou", "Verifique e tente novamente");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, navigate, refreshProfile]);

  return null;
}

function tryBrowserNotify(title: string, body: string, onClick?: () => void) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.ico" });
    if (onClick) {
      n.onclick = () => {
        window.focus();
        onClick();
        n.close();
      };
    }
  } catch {
    /* noop */
  }
}
