export const TERMOS_USO_TEMPLATE = `TERMOS DE USO — ARQ3D STUDIO

Última atualização: [DATA]

1. ACEITAÇÃO
Ao criar uma conta e usar a plataforma, você concorda integralmente com estes termos. Se não concordar, não utilize o serviço.

2. SOBRE A PLATAFORMA
A Arq3D Studio, operada por [SEU NOME / RAZÃO SOCIAL], CNPJ [SEU CNPJ], oferece geração de modelos 3D e renderizações a partir de imagens fornecidas pelo usuário, utilizando provedores de inteligência artificial de terceiros.

3. CONTA DE USUÁRIO
Você é responsável por manter a confidencialidade de suas credenciais e por todas as atividades realizadas em sua conta. Notifique imediatamente em caso de uso não autorizado.

4. USO PERMITIDO
Você se compromete a usar a plataforma apenas para finalidades legais e respeitando direitos de terceiros. É proibido enviar conteúdo que viole direitos autorais, de imagem, marca ou que contenha material ilegal, ofensivo ou discriminatório.

5. DIREITOS SOBRE O CONTEÚDO
Você mantém os direitos sobre as imagens enviadas. Concede a [SEU NOME / RAZÃO SOCIAL] uma licença não exclusiva e limitada para processar essas imagens com a finalidade exclusiva de prestar o serviço contratado. Os modelos 3D gerados pertencem a você.

6. CRÉDITOS E PAGAMENTO
A geração consome créditos conforme o plano contratado. Créditos não utilizados não são reembolsáveis. Cancelamentos podem ser feitos a qualquer momento e passam a valer no próximo ciclo.

7. LIMITAÇÃO DE RESPONSABILIDADE
A plataforma é fornecida "como está". Não garantimos disponibilidade ininterrupta nem qualidade específica nos resultados gerados por IA. [SEU NOME / RAZÃO SOCIAL] não se responsabiliza por danos indiretos decorrentes do uso do serviço.

8. ENCERRAMENTO
Reservamos o direito de suspender contas que violem estes termos, com ou sem aviso prévio.

9. ALTERAÇÕES
Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas por e-mail ou no painel.

10. LEI APLICÁVEL
Estes termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de [SUA CIDADE / UF] para dirimir controvérsias.
`;

export const POLITICA_PRIVACIDADE_TEMPLATE = `POLÍTICA DE PRIVACIDADE — ARQ3D STUDIO

Última atualização: [DATA]

Esta política descreve como [SEU NOME / RAZÃO SOCIAL], CNPJ [SEU CNPJ], coleta, usa e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).

1. DADOS COLETADOS
- Cadastro: nome, e-mail, senha (criptografada), número CAU e nome do escritório (opcional).
- Conteúdo: imagens enviadas para geração e modelos 3D resultantes.
- Uso: logs de acesso, IP, dispositivo, eventos de geração e consumo de créditos.
- Pagamento: dados processados diretamente pelo provedor (Stripe). Não armazenamos número de cartão.

2. FINALIDADE
- Prestação do serviço de geração 3D.
- Cobrança e gestão de créditos.
- Suporte técnico e comunicação operacional.
- Melhoria do produto, sempre de forma agregada e anônima.

3. COMPARTILHAMENTO
Compartilhamos dados estritamente com provedores necessários à operação:
- Replicate (hospedagem dos modelos 3D).
- Google Gemini (processamento de imagens).
- Supabase (banco de dados e armazenamento).
- Stripe (pagamentos, quando aplicável).
Esses provedores atuam como operadores de dados e estão sujeitos às próprias políticas de privacidade.

4. ARMAZENAMENTO
Imagens e modelos ficam armazenados enquanto sua conta estiver ativa. Você pode solicitar exclusão a qualquer momento por meio dos canais informados.

5. SEUS DIREITOS (LGPD)
Você pode, a qualquer momento, solicitar:
- Confirmação de tratamento e acesso aos seus dados.
- Correção de dados incompletos ou desatualizados.
- Anonimização, bloqueio ou exclusão.
- Portabilidade.
- Revogação do consentimento.
Contato do encarregado de dados (DPO): [SEU EMAIL DE CONTATO].

6. SEGURANÇA
Aplicamos medidas técnicas razoáveis para proteger seus dados, incluindo criptografia em trânsito e em repouso, controle de acesso e segregação de ambientes. Nenhum sistema é 100% imune; em caso de incidente, comunicaremos conforme exige a LGPD.

7. COOKIES
Usamos cookies essenciais para autenticação. Não utilizamos cookies de rastreamento publicitário.

8. ALTERAÇÕES
Esta política pode ser atualizada. Mudanças relevantes serão comunicadas por e-mail ou no painel.

9. CONTATO
Em caso de dúvidas, entre em contato em [SEU EMAIL DE CONTATO].
`;

export type PricingTier = {
  name: string;
  price: number;
  credits: number;
  features: string;
};

export const DEFAULT_PRICING_TIERS: PricingTier[] = [
  {
    name: "Free",
    price: 0,
    credits: 3,
    features: "3 gerações/mês\nMarca d'água\nResolução padrão",
  },
  {
    name: "Starter",
    price: 49,
    credits: 30,
    features: "30 gerações/mês\nSem marca d'água\nFormatos GLB e FBX",
  },
  {
    name: "Studio",
    price: 149,
    credits: 120,
    features: "120 gerações/mês\nProjetos ilimitados\nSuporte prioritário",
  },
  {
    name: "Agency",
    price: 399,
    credits: 500,
    features: "500 gerações/mês\nMúltiplos usuários\nAPI de integração",
  },
];
