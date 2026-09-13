// Augmenta o `staticData` das rotas do TanStack Router.
//
// A alternativa era o shell manter uma lista de pathnames que não levam o
// padding padrão. Isso coloca a decisão longe da tela que a toma: quem move
// a rota não vê a lista. Aqui a própria rota declara, e o shell só lê.
import "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * A tela desenha a própria margem — o shell entrega o `main` sem padding.
     * Use em telas com trilho lateral ou qualquer coisa colada na borda.
     */
    fullBleed?: boolean;
  }
}
