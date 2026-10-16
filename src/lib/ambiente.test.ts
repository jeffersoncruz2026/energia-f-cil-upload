import { describe, expect, it } from "vitest";

import { ehAmbienteEdicao, rotaSoEdicao } from "./ambiente";

describe("ambiente de edição × publicado", () => {
  it("reconhece o preview do editor Lovable e o desenvolvimento local", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "51e4de4a-aac7-4385-90e3-552f6886771f.lovableproject.com",
      "id-preview--51e4de4a-aac7-4385-90e3-552f6886771f.lovable.app",
      "preview--energia-facil.lovable.app",
    ]) {
      expect(ehAmbienteEdicao(host), host).toBe(true);
    }
  });

  it("projeto publicado (lovable.app ou domínio próprio) não é edição", () => {
    for (const host of ["energia-facil.lovable.app", "energia.grupolage.com.br"]) {
      expect(ehAmbienteEdicao(host), host).toBe(false);
    }
  });

  it("só as guias de consulta ficam no publicado", () => {
    for (const r of [
      "/unidades",
      "/importar",
      "/grupo-bc",
      "/pendencias",
      "/historico",
      "/configuracoes",
    ]) {
      expect(rotaSoEdicao(r), r).toBe(true);
    }
    for (const r of [
      "/dashboard",
      "/faturas",
      "/faturas/abc",
      "/solar",
      "/alertas",
      "/relatorios",
      "/unidades/123",
    ]) {
      expect(rotaSoEdicao(r), r).toBe(false);
    }
  });
});
