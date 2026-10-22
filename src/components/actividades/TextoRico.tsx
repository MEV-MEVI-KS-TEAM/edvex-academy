// Texto con **negritas**, $LaTeX en línea$ (KaTeX), \$ literal y saltos de línea. Mismo intérprete en pantalla y en PDF.
import katex from "katex";
import { Fragment, type ReactNode } from "react";

// una fórmula y la puntuación que la sigue van juntas (el punto nunca queda solo en el renglón siguiente)
const PATRON = /(\\\$|\$[^$]+\$[.,;:)]*|\*\*[^*]+\*\*)/g;

export function tex(latex: string, display = false): string {
  // las fracciones en estilo de texto salen diminutas en el celular: con \frac se usa \displaystyle
  const l = !display && /\\frac/.test(latex) ? `\\displaystyle ${latex}` : latex;
  return katex.renderToString(l, { throwOnError: false, output: "htmlAndMathml", displayMode: display, strict: "ignore" });
}

function linea(s: string, k: string): ReactNode[] {
  return s.split(PATRON).filter((p) => p !== "").map((p, i) => {
    const key = `${k}-${i}`;
    if (p === "\\$") return <Fragment key={key}>$</Fragment>;
    const m = p.length > 2 && p.startsWith("$") ? p.match(/^\$([^$]+)\$([.,;:)]*)$/) : null;
    if (m) {
      const piezas = partirEnIgual(m[1]);
      if (piezas.length > 1) {
        // una cadena larga de igualdades puede bajar de renglón SOLO antes de un «=»; cada pieza sigue sin cortarse
        return (
          <span key={key}>
            {piezas.map((pz, j) => (
              <Fragment key={j}>
                {j > 0 && " "}
                <span style={{ whiteSpace: "nowrap" }}>
                  <span dangerouslySetInnerHTML={{ __html: tex(j > 0 ? `=${pz}` : pz) }} />
                  {j === piezas.length - 1 ? m[2] : ""}
                </span>
              </Fragment>
            ))}
          </span>
        );
      }
      return (
        <span key={key} style={{ whiteSpace: "nowrap" }}>
          <span dangerouslySetInnerHTML={{ __html: tex(m[1]) }} />
          {m[2]}
        </span>
      );
    }
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
    return <Fragment key={key}>{sinCortes(p)}</Fragment>;
  });
}

/** Parte una fórmula larga (> 24 caracteres) en sus «=» de primer nivel (fuera de llaves); si es corta, la deja entera. */
export function partirEnIgual(latex: string): string[] {
  if (latex.length <= 24 || /\\left|\\begin/.test(latex)) return [latex];
  const piezas: string[] = [];
  let nivel = 0;
  let actual = "";
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i];
    if (c === "{") nivel++;
    if (c === "}") nivel--;
    if (c === "=" && nivel === 0 && latex[i - 1] !== "\\") {
      piezas.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
  }
  piezas.push(actual.trim());
  return piezas.every((x) => x.length > 0) ? piezas : [latex];
}

/** Evita cortes de línea feos: «EXANI-II» (guion no separable), «25 %», «10 letras», «$ 1,500». */
export function sinCortes(t: string): string {
  return t
    .replace(/(\b[A-ZÁÉÍÓÚÑ]{2,})-([A-Z0-9]{1,4}\b)/g, "$1‑$2")
    .replace(/(\d)\s+(%|°|letras\b|pesos\b|años\b|cm\b|m\b|kg\b|km\b|g\b|L\b|ml\b|h\b|min\b)/g, "$1 $2")
    .replace(/(\$)\s+(\d)/g, "$1 $2");
}

export function TextoRico({ texto, como = "span", className }: { texto: string; como?: "span" | "p" | "div"; className?: string }) {
  const Tag = como;
  const lineas = (texto || "").split("\n");
  return (
    <Tag className={className}>
      {lineas.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {linea(l, String(i))}
        </Fragment>
      ))}
    </Tag>
  );
}

/** LaTeX sencillo -> texto legible para lectores de pantalla y para <option> (no admite HTML). */
export function latexLegible(t: string): string {
  let s = t;
  for (let i = 0; i < 4; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\\times/g, "×").replace(/\\div/g, "÷").replace(/\\cdot/g, "·").replace(/\\pm/g, "±")
    .replace(/\\le(q)?\b/g, "≤").replace(/\\ge(q)?\b/g, "≥").replace(/\\neq\b/g, "≠").replace(/\\approx\b/g, "≈")
    .replace(/\\pi\b/g, "π").replace(/\\degree\b|\^\{?\\circ\}?/g, "°").replace(/\\%/g, "%")
    .replace(/\\text\{([^{}]*)\}/g, "$1").replace(/\\(quad|qquad|,|;|!| )/g, " ")
    .replace(/\^\{([^{}]*)\}/g, "^$1").replace(/_\{([^{}]*)\}/g, "_$1")
    .replace(/\\left|\\right/g, "").replace(/\\([a-zA-Z]+)/g, "$1").replace(/[{}]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

/** Texto plano (para aria-label, <option>, títulos): quita marcas y vuelve legible el LaTeX. */
export function textoPlano(s: string): string {
  return (s || "").replace(/\*\*/g, "").replace(/\\\$/g, "\u0000").replace(/\$([^$]+)\$/g, (_, m) => latexLegible(m)).replace(/\u0000/g, "$");
}
