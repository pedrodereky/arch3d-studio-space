import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Em quais formatos o modelo é exportado?",
    a: "GLB, FBX, OBJ e DAE. O GLB é o padrão recomendado para Lumion. FBX funciona melhor no SketchUp e no Revit. Você baixa o que precisar.",
  },
  {
    q: "Funciona com Lumion, SketchUp e Revit?",
    a: "Sim. Os modelos são otimizados para esses três softwares. Importa direto, sem retopologia manual nem ajuste de escala.",
  },
  {
    q: "Como funcionam os créditos?",
    a: "Cada pipeline consome um número fixo de créditos. Direto custa 1, Enriquecido 2, Edita antes e Ver no projeto custam 3, e Planta para 3D custa 5. Os créditos renovam todo mês.",
  },
  {
    q: "Posso cancelar a assinatura quando quiser?",
    a: "Pode. Não tem multa, fidelidade nem letra miúda. Cancela pelo painel e o acesso continua até o fim do ciclo pago.",
  },
  {
    q: "Quão bom fica o resultado?",
    a: "Para mobiliário, luminárias e elementos decorativos a qualidade é apresentável para cliente. Para detalhes muito específicos (nó de madeira único, peça de design autoral raro) o pipeline Enriquecido entrega o melhor.",
  },
  {
    q: "Vocês usam meus modelos para treinar IA?",
    a: "Não. Suas gerações são privadas por padrão. Só ficam públicas se você marcar manualmente para publicar na biblioteca.",
  },
  {
    q: "Tem suporte em português?",
    a: "Tem. Suporte em pt-BR por chat e e-mail, com SLA de resposta no mesmo dia útil.",
  },
  {
    q: "A planta baixa precisa estar em DWG?",
    a: "Não. Aceita PDF, JPG, PNG ou DWG. A IA reconhece paredes, portas e janelas e gera a maquete 3D do projeto inteiro.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="border-t border-border/60 bg-secondary/40 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          FAQ
        </span>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground md:text-4xl">
          Perguntas frequentes
        </h2>

        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`} className="border-border/60">
              <AccordionTrigger className="py-5 text-left text-base font-medium text-foreground hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm font-light leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
