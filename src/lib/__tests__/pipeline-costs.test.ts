import { describe, it, expect } from "vitest";
import { median, formatUsd } from "@/lib/pipeline-costs";

describe("median", () => {
  it("ímpar: o do meio", () => expect(median([3, 1, 2])).toBe(2));
  it("par: a média dos dois centrais", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("não depende da ordem de entrada", () => expect(median([9, 1, 5])).toBe(median([1, 5, 9])));

  it("um valor fora da curva não arrasta a mediana — é por isso que não é média", () => {
    const normais = [0.05, 0.05, 0.06, 0.05];
    const comEstouro = [...normais, 4.0];
    expect(median(comEstouro)).toBeLessThan(0.1);
    const media = comEstouro.reduce((a, b) => a + b, 0) / comEstouro.length;
    expect(media).toBeGreaterThan(0.7);
  });

  it("não muta o array recebido", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});

describe("formatUsd", () => {
  it("traço quando não há número — nunca um zero inventado", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });

  it("vírgula decimal, que é como se escreve em português", () => {
    expect(formatUsd(0.05)).toBe("$ 0,05");
    expect(formatUsd(1.5)).toBe("$ 1,50");
  });

  it("abaixo de um centavo usa quatro casas: '$ 0,00' leria como grátis", () => {
    expect(formatUsd(0.0004)).toBe("$ 0,0004");
    expect(formatUsd(0.0004)).not.toBe("$ 0,00");
  });

  it("zero continua zero, com duas casas", () => expect(formatUsd(0)).toBe("$ 0,00"));
});
