# Mockups — direções de layout

Canvas publicado: https://claude.ai/code/artifact/bce31899-8d79-4b19-90b3-d6760e9c7e52

Arquivos-fonte das telas de proposta do Arq3D Studio. Cada `.dc.html` é uma
prancha; `canvas.json` define a disposição delas no canvas.

**Direção A — Ateliê** foi a escolhida e está desenvolvida em sete telas
(página *Direção A* do canvas):

| Tela | Arquivo |
|---|---|
| Login | `LoginA.dc.html` |
| Dashboard | `Main.dc.html` |
| Gerar — Objetos 3D | `Gerar.dc.html` |
| Redecorar — resultado | `Redecorar.dc.html` |
| Biblioteca | `Biblioteca.dc.html` |
| Projetos | `Projetos.dc.html` |
| Studio | `Studio.dc.html` |

As direções **B — Painel** (`AppB`, `LoginB`) e **C — Estúdio** (`AppC`,
`LoginC`) ficaram na página *Não escolhidas*, guardadas como referência.

> O shell (sidebar + header) é repetido em cada prancha de propósito: pranchas
> não compartilham nada em tempo de execução. A navegação precisa ficar
> idêntica nas sete — mexeu em uma, mexa em todas, ou a estrutura passa a
> mudar conforme a tela.

As cores, raios, sombra e tipografia saem dos tokens reais do produto
(`src/styles.css` e `design-system/colors_and_type.css`) — navy `#02162A`,
azul `#0A4F95`, azul claro `#E8F0FB`, fundo `#F9F9F9`, raios 4/8/12/20/32.
No navegador a fonte é Mulish, substituta métrica do Avenir LT Std, que não
está no Google Fonts; no app o Avenir continua sendo carregado dos OTFs locais.

O arquivo publicado (o canvas navegável) é gerado a partir destes e **não** é
versionado — tem ~2,5 MB de código do editor. Ver `.gitignore`.

Para atualizar o canvas a partir destes arquivos, passe a URL acima como
destino — republicar por caminho de arquivo criaria um canvas separado.
