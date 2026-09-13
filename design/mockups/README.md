# Mockups — direções de layout

Canvas publicado: https://claude.ai/code/artifact/bce31899-8d79-4b19-90b3-d6760e9c7e52

Arquivos-fonte das telas de proposta do Arq3D Studio. Cada `.dc.html` é uma
prancha; `canvas.json` define a disposição delas no canvas.

Três direções, login e área interna em cada uma:

| Direção | Área interna | Login | Aposta |
|---|---|---|---|
| A — Ateliê | `Main.dc.html` | `LoginA.dc.html` | chrome claro, respiro editorial, o render como herói |
| B — Painel | `AppB.dc.html` | `LoginB.dc.html` | mantém o DNA atual (sidebar navy), mais denso |
| C — Estúdio | `AppC.dc.html` | `LoginC.dc.html` | workspace escuro para sessões longas de produção |

As cores, raios, sombra e tipografia saem dos tokens reais do produto
(`src/styles.css` e `design-system/colors_and_type.css`) — navy `#02162A`,
azul `#0A4F95`, azul claro `#E8F0FB`, fundo `#F9F9F9`, raios 4/8/12/20/32.
No navegador a fonte é Mulish, substituta métrica do Avenir LT Std, que não
está no Google Fonts; no app o Avenir continua sendo carregado dos OTFs locais.

O arquivo publicado (o canvas navegável) é gerado a partir destes e **não** é
versionado — tem ~2,5 MB de código do editor. Ver `.gitignore`.

Para atualizar o canvas a partir destes arquivos, passe a URL acima como
destino — republicar por caminho de arquivo criaria um canvas separado.
