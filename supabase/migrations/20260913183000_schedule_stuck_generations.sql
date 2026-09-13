-- Agenda a limpeza de gerações travadas dentro do próprio banco.
--
-- A rota /api/cron/stuck-generations existe e faz exatamente uma coisa: chamar
-- `mark_stuck_generations_failed()`. O salto por HTTP não acrescenta nada —
-- e acrescenta pontos de falha: exige o app no ar, uma URL pública e o segredo
-- LOVABLE_CRON_SECRET viajando a cada chamada. Agendar no banco tira os três.
--
-- A rota continua útil para disparo manual e é idempotente, então as duas
-- coisas podem coexistir sem estrago: rodar duas vezes não causa efeito extra.
--
-- REQUISITO: a extensão pg_cron precisa estar habilitada no projeto. No
-- Supabase isso costuma ser feito em Database → Extensions (ou pelo
-- `create extension` abaixo, quando o papel que aplica a migração tem direito).
-- Se o create falhar por permissão, habilite pelo painel e aplique de novo.

create extension if not exists pg_cron;

-- Remove antes de criar: aplicar esta migração duas vezes, ou mudar a
-- periodicidade depois, não pode deixar dois jobs iguais girando.
do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'mark-stuck-generations'
  ) then
    perform cron.unschedule('mark-stuck-generations');
  end if;
end
$$;

-- De hora em hora. A função decide o que é "travado"; aqui só se define quando
-- perguntar. Diário também serviria — a rota e a função são idempotentes.
select cron.schedule(
  'mark-stuck-generations',
  '0 * * * *',
  $job$ select public.mark_stuck_generations_failed(); $job$
);
