"use client";
// Actividades autocorregibles de una unidad. Se porta TAL CUAL a la plantilla (Next.js 14): sin dependencias fuera de
// react y katex, estilos en CSS module y colores de la escuela por las variables --color-* de «Personalizar mi página».
// Nada se envía al servidor: el avance vive solo en el navegador del alumno (almacen.ts).
// FUENTE: C:\clientes-MEV\actividades\sistema\web\src\actividades (vista previa y PDF del sistema de actividades).
// EDVEX: el avance se guarda por alumno (prop `alumno`, llave «<alumno>/<unidad>»): varias cuentas comparten equipo.
// Copiado tal cual salvo un parámetro sin usar que el lint de la plantilla rechaza; corregir.ts, tipos.ts, almacen.ts y
// TextoRico.tsx son copia exacta. El CSS cambia SOLO los colores de resultado (bien/mal/modelo/parcial): fondos derivados
// de --color-superficie y textos mezclados con --color-texto, para que se lean también en paletas oscuras. Lo propio de la plantilla vive en datos.ts, Descargas.tsx y SeccionActividades.tsx.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "katex/dist/katex.min.css";
import s from "./Actividades.module.css";
import { borrar, cargar, guardar, leerPreferencia, guardarPreferencia, VACIO, type EstadoUnidad } from "./almacen";
import {
  calificar, cuentaHuecos, formatoRespuesta, opcionesRelacionar, ordenAlfabetico, ordenInicial, yaLoDice,
  type Calificacion, type EstadoActividad,
} from "./corregir";
import { TextoRico, textoPlano } from "./TextoRico";
import type {
  Abierta, Actividad, ActividadesUnidad, Completar, EjercicioNumerico, Numerico, OpcionMultiple, Ordenar, ReactivoOM, Relacionar, VerdaderoFalso,
} from "./tipos";
import { ETIQUETA_TIPO, NOMBRE_TIPO } from "./tipos";

const LETRAS = ["A", "B", "C", "D"];
const VACIA: EstadoActividad = { r: {}, revisada: false };
const MIN_ABIERTA = 40;

type Cambiar = (fn: (e: EstadoActividad) => EstadoActividad) => void;

export interface PropsActividades {
  datos: ActividadesUnidad;
  /** URL del PDF imprimible; sin ella no se muestra el botón. */
  pdfUrl?: string;
  /** false = no recordar respuestas en el navegador (vista previa). */
  recordar?: boolean;
  /** EDVEX: id del alumno en sesión; el avance se guarda por alumno (cuentas compartidas en un mismo equipo). */
  alumno?: string;
}

function nivel(bien: number, total: number) {
  const pct = total ? bien / total : 0;
  return pct >= 0.8 ? "todo" : bien === 0 ? "nada" : "parte";
}

function suave(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "auto";
  }
}

export default function Actividades({ datos, pdfUrl, recordar = true, alumno }: PropsActividades) {
  const uid = datos.unidad.id;
  // EDVEX: la llave del avance en localStorage lleva al alumno («actividades:v1:<alumno>/<unidad>»).
  const llave = alumno ? `${alumno}/${uid}` : uid;
  const [estado, setEstado] = useState<EstadoUnidad>(VACIO);
  const [activo, setActivo] = useState<string>("");
  const listo = useRef(false);
  const tiraRef = useRef<HTMLOListElement>(null);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEstado(recordar ? cargar(llave) : VACIO);
    // Avance de antes de separarlo por alumno: se descarta (no se sabe de quién era).
    if (recordar && alumno) borrar(uid);
    listo.current = true;
  }, [llave, uid, alumno, recordar]);

  useEffect(() => {
    if (listo.current && recordar) guardar(llave, estado);
  }, [estado, llave, recordar]);

  // La tira de avance marca la actividad que se ve y la centra (en el celular no caben todos los chips)
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz || typeof IntersectionObserver === "undefined") return;
    const secciones = Array.from(raiz.querySelectorAll<HTMLElement>("section[data-actividad]"));
    const vis = new Map<string, number>();
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => vis.set((en.target as HTMLElement).dataset.actividad || "", en.isIntersecting ? en.intersectionRect.height : 0));
      let mejor = "", alto = 0;
      vis.forEach((h, id) => { if (h > alto) [mejor, alto] = [id, h]; });
      if (mejor) setActivo(mejor);
    }, { rootMargin: "-38% 0px -58% 0px", threshold: 0 });
    secciones.forEach((x) => io.observe(x));
    return () => io.disconnect();
  }, [datos]);

  useEffect(() => {
    const chip = tiraRef.current?.querySelector<HTMLElement>(`[data-chip="${activo}"]`);
    const tira = tiraRef.current?.parentElement;
    if (chip && tira) tira.scrollTo({ left: chip.offsetLeft - tira.clientWidth / 2 + chip.clientWidth / 2, behavior: suave() });
  }, [activo]);

  const cambiarAct = (id: string): Cambiar => (fn) =>
    setEstado((e) => ({ ...e, act: { ...e.act, [id]: fn(e.act[id] || VACIA) } }));

  const notas = useMemo(
    () => datos.actividades.map((a) => {
      const e = estado.act[a.id] || VACIA;
      return { a, e, cal: calificar(a, e, uid) };
    }),
    [datos, estado, uid],
  );

  const auto = datos.autoevaluacion;
  const autoBien = auto.reactivos.filter((q) => estado.auto.r[q.id] === String(q.correcta)).length;
  const hayAvance = Object.keys(estado.act).length > 0 || Object.keys(estado.auto.r).length > 0;

  function reiniciarTodo() {
    if (recordar) borrar(llave);
    setEstado(VACIO);
  }

  return (
    <div className={s.raiz} lang="es" data-unidad={uid} ref={raizRef}>
      <header className={s.cabecera}>
        <p className={s.rotulo}>{datos.unidad.materia} · {datos.unidad.rotulo}</p>
        <h2 className={s.titulo}>
          <TextoRico texto={datos.unidad.titulo} />
        </h2>
        <p className={s.resumen}>{datos.actividades.length} actividades · autoevaluación de {datos.autoevaluacion.reactivos.length} preguntas</p>
        {pdfUrl && (
          <a className={s.botonSecundario} href={pdfUrl} target="_blank" rel="noopener" download>
            <IconoDescarga /> Descargar PDF
          </a>
        )}
      </header>

      <nav className={s.tira} aria-label="Actividades de esta unidad">
        <ol ref={tiraRef}>
          {notas.map(({ a, e, cal }, i) => (
            <li key={a.id}>
              <a
                href={`#act-${a.id}`} className={s.paso} data-chip={a.id} aria-current={activo === a.id ? "step" : undefined}
                data-estado={e.revisada || (a.tipo === "abierta" && e.modelo) ? "hecho" : "pendiente"}
              >
                <span className={s.pasoNum}>{i + 1}</span>
                <span className={s.pasoTxt}>
                  {a.reto ? "Reto" : ETIQUETA_TIPO[a.tipo]}
                  {e.revisada && cal.total > 0 && <span className={s.pasoNota} data-nivel={nivel(cal.correctas, cal.total)}> {cal.correctas}/{cal.total}</span>}
                </span>
              </a>
            </li>
          ))}
          <li>
            <a
              href="#autoevaluacion" className={s.paso} data-chip="autoevaluacion" aria-current={activo === "autoevaluacion" ? "step" : undefined}
              data-estado={estado.auto.calificada ? "hecho" : "pendiente"}
            >
              <span className={s.pasoNum}>{notas.length + 1}</span>
              <span className={s.pasoTxt}>
                Autoevaluación
                {estado.auto.calificada && <span className={s.pasoNota} data-nivel={nivel(autoBien, auto.reactivos.length)}> {autoBien}/{auto.reactivos.length}</span>}
              </span>
            </a>
          </li>
        </ol>
      </nav>

      <Esencial datos={datos} plegadoInicial={hayAvance} recordar={recordar} />

      {notas.map(({ a, e, cal }, i) => (
        <TarjetaActividad
          key={a.id} a={a} e={e} cal={cal} n={i + 1} de={datos.actividades.length} uid={uid} cambiar={cambiarAct(a.id)}
        />
      ))}

      <Autoevaluacion
        reactivos={auto.reactivos}
        instrucciones={auto.instrucciones}
        estado={estado.auto}
        bien={autoBien}
        cambiar={(fn) => setEstado((e) => ({ ...e, auto: fn(e.auto) }))}
      />

      <footer className={s.pie}>
        <p>Tus respuestas se guardan solo en este dispositivo; nadie más las ve.</p>
        <button type="button" className={s.botonTexto} onClick={reiniciarTodo} data-accion="borrar-todo">
          Borrar mis respuestas de esta unidad
        </button>
      </footer>
    </div>
  );
}

/* ───────────────────────────── Lo esencial ───────────────────────────── */

function Esencial({ datos, plegadoInicial, recordar }: { datos: ActividadesUnidad; plegadoInicial: boolean; recordar: boolean }) {
  const pref = `${datos.unidad.id}:esencial`;
  const [abierto, setAbierto] = useState(true);
  useEffect(() => {
    const p = recordar ? leerPreferencia(pref) : null;
    setAbierto(p !== null ? p === "1" : !plegadoInicial);
  }, [pref, plegadoInicial, recordar]);
  const e = datos.esencial;
  function alternar() {
    const n = !abierto;
    setAbierto(n);
    if (recordar) guardarPreferencia(pref, n ? "1" : "0");
  }
  return (
    <section className={s.esencial} aria-labelledby="esencial-t">
      <button type="button" className={s.esencialCab} aria-expanded={abierto} onClick={alternar}>
        <span id="esencial-t" className={s.esencialTitulo}>Lo esencial</span>
        <span className={s.esencialAyuda}>{abierto ? "Ocultar" : "Repasar"}</span>
        <span className={s.chevron} data-abierto={abierto} aria-hidden="true" />
      </button>
      {abierto && (
        <div className={s.esencialCuerpo}>
          <TextoRico como="p" className={s.esencialIntro} texto={e.intro} />
          <div className={s.puntos}>
            {e.puntos.map((p, i) => (
              <details key={i} className={s.punto} open={i === 0}>
                <summary><TextoRico texto={p.titulo} /></summary>
                <TextoRico como="p" className={s.puntoTxt} texto={p.texto} />
              </details>
            ))}
          </div>
          {e.formulas && e.formulas.length > 0 && (
            <ul className={s.formulas}>
              {e.formulas.map((f, i) => <li key={i}><TextoRico texto={f} /></li>)}
            </ul>
          )}
          {e.recuerda && (
            <p className={s.recuerda}><strong>Recuerda: </strong><TextoRico texto={e.recuerda} /></p>
          )}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── Actividad ───────────────────────────── */

function TarjetaActividad({ a, e, cal, n, de, uid, cambiar }: {
  a: Actividad; e: EstadoActividad; cal: Calificacion; n: number; de: number; uid: string; cambiar: Cambiar;
}) {
  const ref = useRef<HTMLElement>(null);
  const abierta = a.tipo === "abierta";
  function revisar() {
    (document.activeElement as HTMLElement | null)?.blur?.();
    // al revisar se abren solas las soluciones de los ejercicios fallados
    cambiar((x) => {
      const sol = { ...x.soluciones };
      if (a.tipo === "numerico") a.ejercicios.forEach((ej) => { if (!calificar(a, x, uid).porCampo[ej.id]) sol[ej.id] = true; });
      return { ...x, revisada: true, soluciones: sol };
    });
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-puntaje]")?.focus({ preventScroll: true }));
  }
  return (
    <section
      ref={ref} id={`act-${a.id}`} className={s.actividad} data-actividad={a.id} data-tipo={a.tipo}
      data-reto={a.reto ? "si" : undefined} aria-labelledby={`t-${a.id}`} lang={a.idioma === "en" ? "en" : undefined}
    >
      <div className={s.actCab}>
        <p className={s.actMeta} lang="es">
          {a.reto && <span className={s.insigniaReto}>Reto final</span>}
          <span>Actividad {n} de {de}</span>
          {!a.reto && <span className={s.actTipo}>{NOMBRE_TIPO[a.tipo]}</span>}
        </p>
        <h3 id={`t-${a.id}`} className={s.actTitulo}><TextoRico texto={a.titulo} /></h3>
        <TextoRico como="p" className={s.instrucciones} texto={a.instrucciones} />
      </div>

      <div className={s.actCuerpo}>
        {a.tipo === "opcion_multiple" && <CuerpoOM a={a} e={e} cal={cal} cambiar={cambiar} />}
        {a.tipo === "verdadero_falso" && <CuerpoVF a={a} e={e} cal={cal} cambiar={cambiar} />}
        {a.tipo === "relacionar" && <CuerpoRelacionar a={a} e={e} cal={cal} cambiar={cambiar} uid={uid} />}
        {a.tipo === "completar" && <CuerpoCompletar a={a} e={e} cal={cal} cambiar={cambiar} />}
        {a.tipo === "ordenar" && <CuerpoOrdenar a={a} e={e} cal={cal} cambiar={cambiar} uid={uid} />}
        {a.tipo === "numerico" && <CuerpoNumerico a={a} e={e} cal={cal} cambiar={cambiar} />}
        {abierta && <CuerpoAbierta a={a as Abierta} e={e} cambiar={cambiar} />}
      </div>

      {!abierta && (
        <div className={s.acciones} lang="es">
          {e.revisada ? (
            <>
              <Puntaje cal={cal} unaExplicacion={a.tipo === "ordenar" || a.tipo === "relacionar"} />
              {(a.tipo === "relacionar" || a.tipo === "ordenar") && <TextoRico como="p" className={s.explicacion} texto={a.explicacion} />}
              <button
                type="button" className={s.botonSecundario}
                onClick={() => cambiar(() => ({ ...VACIA }))} data-accion="reiniciar"
              >
                Volver a intentar
              </button>
            </>
          ) : (
            <button type="button" className={s.botonPrimario} onClick={revisar} data-accion="revisar">
              Revisar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Puntaje({ cal, unaExplicacion }: { cal: Calificacion; unaExplicacion?: boolean }) {
  const pct = cal.total ? cal.correctas / cal.total : 0;
  const msg = pct === 1 ? "¡Todo correcto!"
    : unaExplicacion ? "Lee la explicación y vuelve a intentarlo."
    : pct >= 0.6 ? "Vas bien. Lee las explicaciones de las que fallaste." : "Lee las explicaciones y vuelve a intentarlo.";
  return (
    <div className={s.puntaje} tabIndex={-1} data-puntaje={`${cal.correctas}/${cal.total}`} role="status" aria-live="polite">
      <span className={s.puntajeCifra}>{cal.correctas}<span className={s.puntajeDe}>/{cal.total}</span></span>
      <span className={s.puntajeTxt}>{msg}</span>
      <span className={s.barra} aria-hidden="true"><span style={{ width: `${pct * 100}%` }} /></span>
    </div>
  );
}

function Veredicto({ ok, correcta, explicacion, nota }: { ok: boolean; correcta?: string; explicacion?: string; nota?: string }) {
  return (
    <div className={s.veredicto} data-ok={ok} lang="es">
      <p className={s.veredictoCab}>
        {ok ? <IconoBien /> : <IconoMal />}
        <strong>{ok ? "Correcto" : "Incorrecto"}</strong>
      </p>
      {nota && <TextoRico como="p" className={s.veredictoNota} texto={nota} />}
      {!ok && correcta && <p className={s.veredictoCorrecta}>Respuesta correcta: <TextoRico texto={correcta} /></p>}
      {explicacion && <TextoRico como="p" className={s.veredictoTxt} texto={explicacion} />}
    </div>
  );
}

/** Marca dentro de una opción ya revisada: no depende del color (✓/✗ y texto). */
function MarcaOpcion({ correcta, marcada }: { correcta: boolean; marcada: boolean }) {
  if (!correcta && !marcada) return null;
  return (
    <span className={s.marcaOp} data-ok={correcta}>
      {correcta ? <IconoBien /> : <IconoMal />}
      <span>{marcada ? "Tu respuesta" : "Correcta"}</span>
    </span>
  );
}

/* Opción múltiple (también la usa la autoevaluación) */
const CABE_EN_SELECT = 28; // caracteres que muestra el desplegable de relacionar a 375 px sin cortar
function ReactivoOpciones({ q, nombre, valor, revisado, onElegir, numero }: {
  q: ReactivoOM; nombre: string; valor?: string; revisado: boolean; onElegir: (v: string) => void; numero?: number;
}) {
  const ok = valor === String(q.correcta);
  return (
    <fieldset
      className={s.reactivo} data-campo={nombre} id={nombre.startsWith("autoevaluacion/") ? `auto-${q.id}` : undefined}
      data-resultado={revisado ? (ok ? "correcto" : "incorrecto") : undefined}
    >
      <legend className={s.enunciado}>
        {numero !== undefined && <span className={s.numReactivo}>{numero}.</span>}
        <TextoRico texto={q.enunciado} />
      </legend>
      <div className={s.opciones}>
        {q.opciones.map((op, i) => {
          const marcada = valor === String(i);
          const marca = revisado ? (i === q.correcta ? "correcta" : marcada ? "incorrecta" : undefined) : undefined;
          return (
            <label key={i} className={s.opcion} data-marcada={marcada} data-marca={marca}>
              <input
                type="radio" name={nombre} value={String(i)} checked={marcada} disabled={revisado}
                onChange={() => onElegir(String(i))} className={s.radio} aria-label={`${LETRAS[i]}) ${textoPlano(op)}`}
              />
              <span className={s.letra} aria-hidden="true">{LETRAS[i]}</span>
              <span className={s.opcionTxt}>
                <TextoRico texto={op} />
                {revisado && <MarcaOpcion correcta={i === q.correcta} marcada={marcada} />}
              </span>
            </label>
          );
        })}
      </div>
      {revisado && <Veredicto ok={ok} explicacion={q.explicacion} />}
    </fieldset>
  );
}

function CuerpoOM({ a, e, cambiar }: { a: OpcionMultiple; e: EstadoActividad; cal: Calificacion; cambiar: Cambiar }) {
  return (
    <div className={s.lista}>
      {a.items.map((q, i) => (
        <ReactivoOpciones
          key={q.id} q={q} numero={a.items.length > 1 ? i + 1 : undefined} nombre={`${a.id}/${q.id}`} valor={e.r[q.id]} revisado={e.revisada}
          onElegir={(v) => cambiar((x) => ({ ...x, r: { ...x.r, [q.id]: v } }))}
        />
      ))}
    </div>
  );
}

function CuerpoVF({ a, e, cal, cambiar }: { a: VerdaderoFalso; e: EstadoActividad; cal: Calificacion; cambiar: Cambiar }) {
  return (
    <div className={s.lista}>
      {a.items.map((it, i) => {
        const v = e.r[it.id];
        const ok = cal.porCampo[it.id];
        return (
          <fieldset key={it.id} className={s.reactivo} data-campo={`${a.id}/${it.id}`} data-resultado={e.revisada ? (ok ? "correcto" : "incorrecto") : undefined}>
            <legend className={s.enunciado}>
              <span className={s.numReactivo}>{i + 1}.</span>
              <TextoRico texto={it.afirmacion} />
            </legend>
            <div className={s.vf}>
              {(["v", "f"] as const).map((op) => {
                const correcta = (it.respuesta ? "v" : "f") === op;
                const marca = e.revisada ? (correcta ? "correcta" : v === op ? "incorrecta" : undefined) : undefined;
                return (
                  <label key={op} className={s.opcionVF} data-marcada={v === op} data-marca={marca}>
                    <input
                      type="radio" name={`${a.id}/${it.id}`} value={op} checked={v === op} disabled={e.revisada} className={s.radio}
                      onChange={() => cambiar((x) => ({ ...x, r: { ...x.r, [it.id]: op } }))}
                    />
                    <span className={s.vfTxt}>
                      <span lang="es">{op === "v" ? "Verdadero" : "Falso"}</span>
                      {e.revisada && (correcta || v === op) && <MarcaOpcion correcta={correcta} marcada={v === op} />}
                    </span>
                  </label>
                );
              })}
            </div>
            {e.revisada && <Veredicto ok={ok} explicacion={it.explicacion} />}
          </fieldset>
        );
      })}
    </div>
  );
}

function CuerpoRelacionar({ a, e, cal, cambiar, uid }: { a: Relacionar; e: EstadoActividad; cal: Calificacion; cambiar: Cambiar; uid: string }) {
  const opciones = useMemo(() => opcionesRelacionar(a, uid), [a, uid]);
  const sobran = (a.distractores || []).length;
  return (
    <>
    {sobran > 0 && !e.revisada && !/sobra/i.test(a.instrucciones) && <p className={s.ayudaArriba}>{sobran === 1 ? "Sobra una descripción." : `Sobran ${sobran} descripciones.`}</p>}
    <ol className={s.lista}>
      {a.pares.map((p, i) => {
        const ok = cal.porCampo[p.id];
        const idSel = `sel-${a.id}-${p.id}`;
        const elegida = e.r[p.id] || "";
        return (
          <li key={p.id} className={s.par} data-campo={`${a.id}/${p.id}`} data-resultado={e.revisada ? (ok ? "correcto" : "incorrecto") : undefined}>
            <label htmlFor={idSel} className={s.parIzq}>
              <span className={s.numReactivo}>{i + 1}.</span>
              <TextoRico texto={p.izquierda} />
            </label>
            <select
              id={idSel} className={s.select} value={elegida} disabled={e.revisada}
              onChange={(ev) => { const v = ev.target.value; cambiar((x) => ({ ...x, r: { ...x.r, [p.id]: v } })); }}
            >
              <option value="">Elige…</option>
              {opciones.map((op) => <option key={op} value={op}>{textoPlano(op)}</option>)}
            </select>
            {elegida && !e.revisada && textoPlano(elegida).length > CABE_EN_SELECT && <p className={s.eleccion}><TextoRico texto={elegida} /></p>}
            {e.revisada && ok && (
              <p className={s.eleccionBien}><IconoBien /><span>Correcto</span></p>
            )}
            {e.revisada && !ok && <Veredicto ok={false} correcta={p.derecha} nota={elegida ? `Elegiste: ${textoPlano(elegida)}` : "Sin responder."} />}
          </li>
        );
      })}
    </ol>
    </>
  );
}

function CuerpoCompletar({ a, e, cal, cambiar }: { a: Completar; e: EstadoActividad; cal: Calificacion; cambiar: Cambiar }) {
  // El campo va DENTRO de la frase, como una raya que se toca (la frase se lee completa y no hay nada duplicado).
  // Al revisar, la respuesta queda en la frase en verde o tachada en rojo. El banco de palabras se queda fijo arriba.
  const [activoCampo, setActivoCampo] = useState<string | null>(null);
  const campos = a.items.flatMap((it) => it.respuestas.map((_, k) => `${it.id}/${k}`));
  function poner(campo: string, v: string) {
    cambiar((x) => ({ ...x, r: { ...x.r, [campo]: v } }));
  }
  function elegirPalabra(p: string) {
    const destino = activoCampo || campos.find((c) => !(e.r[c] || "").trim()) || null;
    if (!destino) return;
    poner(destino, p);
    const sig = campos.slice(campos.indexOf(destino) + 1).find((c) => !(e.r[c] || "").trim());
    setActivoCampo(sig || destino);
  }
  const huecosTot = campos.length;
  const sobran = a.banco ? a.banco.length - huecosTot : 0;
  return (
    <>
      {a.banco && a.banco.length > 0 && !e.revisada && (
        <p className={s.bancoTit}>
          {/toca|escrib/i.test(a.instrucciones) ? "" : "Toca un espacio y luego una palabra, o escríbela."}
          {sobran > 0 && !/sobra/i.test(a.instrucciones) ? ` Sobran ${sobran}.` : ""}
        </p>
      )}
      {a.banco && a.banco.length > 0 && !e.revisada && (
        <div className={s.bancoFijo}>
          <div className={s.banco} role="group" aria-label="Palabras para elegir" data-banco="si">
            {ordenAlfabetico(a.banco).map((p) => (
              <button key={p} type="button" className={s.chip} onMouseDown={(ev) => ev.preventDefault()} onClick={() => elegirPalabra(p)} data-palabra={p}>{p}</button>
            ))}
          </div>
        </div>
      )}
      <ol className={s.lista}>
        {a.items.map((it, i) => {
          const partes = it.texto.split("___");
          const huecos = cuentaHuecos(it.texto);
          const todos = it.respuestas.every((_, k) => cal.porCampo[`${it.id}/${k}`]);
          return (
            <li key={it.id} className={s.completar}>
              <p className={s.completarTxt} data-revisada={e.revisada ? "si" : undefined} data-varios={huecos > 1 ? "si" : undefined}>
                <span className={s.numReactivo}>{i + 1}.</span>
                {partes.map((parte, k) => {
                  const campo = `${it.id}/${k}`;
                  const v = e.r[campo] || "";
                  if (k >= huecos) return <TextoRico key={k} texto={parte} />;
                  // la última palabra antes del hueco y la puntuación después van pegadas al hueco (sin cortes feos)
                  const m = parte.match(/^([\s\S]*?)(\S*)$/) || ["", parte, ""];
                  const despues = (partes[k + 1] || "").match(/^[.,;:)?!»]*/)?.[0] || "";
                  if (despues) partes[k + 1] = partes[k + 1].slice(despues.length);
                  return (
                    <span key={k}>
                      <TextoRico texto={m[1]} />
                      <span className={s.sinCorte}>
                        <TextoRico texto={m[2]} />{m[2] ? " " : ""}
                        {e.revisada ? (
                          <span className={s.huecoVista} data-hueco={campo} data-resultado={cal.porCampo[campo] ? "correcto" : "incorrecto"}>
                            {v.trim() || "—"}
                          </span>
                        ) : (
                          <input
                            type="text" inputMode={/^decimal/i.test(it.ayuda || "") ? "decimal" : "text"} className={s.hueco} value={v}
                            aria-label={huecos > 1 ? `Frase ${i + 1}, espacio ${k + 1}` : `Frase ${i + 1}: lo que falta`}
                            placeholder={it.ayuda || (huecos > 1 ? `(${k + 1})` : "")}
                            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                            data-campo={`${a.id}/${campo}`} data-activo={activoCampo === campo ? "si" : undefined}
                            onFocus={() => setActivoCampo(campo)}
                            onChange={(ev) => poner(campo, ev.target.value)}
                          />
                        )}
                        {despues}
                      </span>
                    </span>
                  );
                })}
              </p>
              {e.revisada && (
                <Veredicto ok={todos} correcta={todos ? undefined : it.respuestas.map((r) => r[0]).join(" · ")} explicacion={it.explicacion} />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function CuerpoOrdenar({ a, e, cal, cambiar, uid }: { a: Ordenar; e: EstadoActividad; cal: Calificacion; cambiar: Cambiar; uid: string }) {
  const orden = e.orden && e.orden.length === a.elementos.length ? e.orden : ordenInicial(a, uid);
  const [movido, setMovido] = useState<number | null>(null);
  function mover(pos: number, d: -1 | 1) {
    const nuevo = orden.slice();
    const j = pos + d;
    if (j < 0 || j >= nuevo.length) return;
    [nuevo[pos], nuevo[j]] = [nuevo[j], nuevo[pos]];
    setMovido(nuevo[j]);
    cambiar((x) => ({ ...x, orden: nuevo }));
  }
  return (
    <>
      <ol className={s.ordenar}>
        {orden.map((original, pos) => {
          const ok = cal.porCampo[`pos-${pos}`];
          return (
            <li
              key={original} className={s.ordenItem} data-original={original} data-movido={movido === original}
              data-campo={`${a.id}/pos-${pos}`} data-resultado={e.revisada ? (ok ? "correcto" : "incorrecto") : undefined}
            >
              <span className={s.ordenPos} aria-hidden="true">{pos + 1}</span>
              <span className={s.ordenTxt}><TextoRico texto={a.elementos[original]} /></span>
              {e.revisada ? (
                <span className={s.ordenMarca} data-ok={ok}>
                  {ok ? <IconoBien /> : <IconoMal />}
                  {ok ? <span className={s.oculto}>En buen orden</span> : <span className={s.lugar}>va {original + 1}.º</span>}
                </span>
              ) : (
                <span className={s.ordenBotones}>
                  <button type="button" className={s.botonIcono} onClick={() => mover(pos, -1)} disabled={pos === 0} data-accion="subir"
                    aria-label={`Subir: ${textoPlano(a.elementos[original])}`}>
                    <IconoFlecha arriba />
                  </button>
                  <button type="button" className={s.botonIcono} onClick={() => mover(pos, 1)} disabled={pos === orden.length - 1} data-accion="bajar"
                    aria-label={`Bajar: ${textoPlano(a.elementos[original])}`}>
                    <IconoFlecha />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {e.revisada && cal.correctas < cal.total && (
        <div className={s.nota} lang="es">
          <p className={s.veredictoNota}>
            Las marcadas con <span className={s.iconoEnTexto}><IconoBien /></span> ya están bien colocadas; las marcadas con{" "}
            <span className={s.iconoEnTexto}><IconoMal /></span> te dicen a qué lugar van.
          </p>
        </div>
      )}
    </>
  );
}

function ayudaNumerica(ejs: EjercicioNumerico[]): string {
  if (ejs.every((x) => x.unidad === "%")) return "Escribe solo el número, sin el signo %.";
  const f = new Set(ejs.map((x) => x.formato || "decimal"));
  if (f.size === 1 && f.has("fraccion")) return "Escribe la fracción simplificada, como 3/4.";
  if (f.size === 1 && f.has("entero")) return "Escribe solo el número entero.";
  if (f.size === 1 && f.has("decimal")) return "Escribe el número con punto decimal, por ejemplo 0.5.";
  return "Escribe solo el número; cada ejercicio indica si va como fracción o como decimal.";
}

function marcador(ej: EjercicioNumerico): string {
  if (ej.unidad === "%") return "Número, sin %";
  if (ej.formato === "fraccion") return "Fracción, ej. 3/4";
  if (ej.formato === "entero") return "Número entero";
  return "Número, ej. 0.5";
}

function CuerpoNumerico({ a, e, cal, cambiar }: { a: Numerico; e: EstadoActividad; cal: Calificacion; cambiar: Cambiar }) {
  const [verEjemplo, setVerEjemplo] = useState(true);
  return (
    <>
      <div className={s.ejemplo}>
        <button type="button" className={s.ejemploCab} aria-expanded={verEjemplo} onClick={() => setVerEjemplo(!verEjemplo)}>
          <span>Ejemplo resuelto</span>
          <span className={s.chevron} data-abierto={verEjemplo} aria-hidden="true" />
        </button>
        {verEjemplo && (
          <div className={s.ejemploCuerpo}>
            <TextoRico como="p" texto={a.ejemplo.enunciado} />
            <ol className={s.pasos}>{a.ejemplo.pasos.map((p, i) => <li key={i}><TextoRico texto={p} /></li>)}</ol>
            <p className={s.resultado}><strong>Resultado: </strong><TextoRico texto={a.ejemplo.resultado} /></p>
          </div>
        )}
      </div>
      {!a.ejercicios.every((x) => x.unidad === "%") && !yaLoDice(a.instrucciones, ayudaNumerica(a.ejercicios)) && (
        <p className={s.ayudaArriba}>{ayudaNumerica(a.ejercicios)}</p>
      )}
      <ol className={s.lista}>
        {a.ejercicios.map((ej, i) => {
          const ok = cal.porCampo[ej.id];
          const idIn = `num-${a.id}-${ej.id}`;
          const sol = !!e.soluciones?.[ej.id];
          const conSigno = ej.respuesta < 0 || ej.formato === "fraccion";
          return (
            <li key={ej.id} className={s.ejercicio} data-campo={`${a.id}/${ej.id}`} data-resultado={e.revisada ? (ok ? "correcto" : "incorrecto") : undefined}>
              <label htmlFor={idIn} className={s.enunciado}>
                <span className={s.numReactivo}>{i + 1}.</span>
                <TextoRico texto={ej.enunciado} />
              </label>
              <div className={s.campoNum}>
                <input
                  id={idIn} type="text" inputMode={conSigno ? "text" : ej.formato === "entero" ? "numeric" : "decimal"} className={s.inputNum}
                  value={e.r[ej.id] || ""} disabled={e.revisada} autoComplete="off" autoCorrect="off" placeholder={marcador(ej)}
                  data-campo={`${a.id}/${ej.id}`}
                  onChange={(ev) => { const v = ev.target.value; cambiar((x) => ({ ...x, r: { ...x.r, [ej.id]: v } })); }}
                />
                {ej.unidad && <span className={s.unidadNum}>{ej.unidad}</span>}
              </div>
              {e.revisada && (
                <>
                  <Veredicto
                    ok={ok} nota={cal.notas[ej.id]} correcta={`${formatoRespuesta(ej.respuesta, ej.formato)}${ej.unidad ? " " + ej.unidad : ""}`}
                    explicacion={ok && !cal.notas[ej.id] ? ej.pasos[ej.pasos.length - 1] : undefined}
                  />
                  <button
                    type="button" className={s.botonTexto} aria-expanded={sol} data-accion="ver-solucion"
                    onClick={() => cambiar((x) => ({ ...x, soluciones: { ...x.soluciones, [ej.id]: !sol } }))}
                  >
                    {sol ? "Ocultar la solución" : "Ver solución paso a paso"}
                  </button>
                  {sol && <ol className={s.pasos}>{ej.pasos.map((p, k) => <li key={k}><TextoRico texto={p} /></li>)}</ol>}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Si hay preguntas y la respuesta modelo viene numerada («1. …\n2. …»), una parte por pregunta. */
function partesModelo(a: Abierta): string[] {
  if (!a.preguntas || a.preguntas.length < 2) return [a.respuesta_modelo];
  const partes = a.respuesta_modelo.split(/\n(?=\d+\.\s)/).map((x) => x.trim()).filter(Boolean);
  return partes.length === a.preguntas.length ? partes : [a.respuesta_modelo];
}

function CuerpoAbierta({ a, e, cambiar }: { a: Abierta; e: EstadoActividad; cambiar: Cambiar }) {
  // Con varias preguntas, una caja por pregunta: así el alumno compara punto por punto con la respuesta modelo.
  const [aviso, setAviso] = useState(false);
  const preguntas = a.preguntas && a.preguntas.length > 0 ? a.preguntas : null;
  const claves = preguntas ? preguntas.map((_, i) => `texto-${i}`) : ["texto"];
  const escrito = claves.reduce((n, k) => n + (e.r[k] || "").trim().length, 0);
  const partes = partesModelo(a);
  const porPregunta = !!preguntas && partes.length === preguntas.length && partes.length > 1;
  function verModelo() {
    if (!e.modelo && escrito < MIN_ABIERTA && !aviso) {
      setAviso(true);
      return;
    }
    setAviso(false);
    cambiar((x) => ({ ...x, modelo: !x.modelo }));
  }
  const caja = (k: string, etiqueta: ReactNode, filas: number) => (
    <div className={s.cajaAbierta} key={k}>
      <label htmlFor={`ab-${a.id}-${k}`} className={s.etiquetaTa} lang="es">{etiqueta}</label>
      <textarea
        id={`ab-${a.id}-${k}`} className={s.textarea} rows={filas} value={e.r[k] || ""} data-campo={`${a.id}/${k}`}
        onChange={(ev) => { const v = ev.target.value; cambiar((x) => ({ ...x, r: { ...x.r, [k]: v } })); }}
      />
    </div>
  );
  return (
    <>
      <div className={s.consigna}><TextoRico como="div" texto={a.consigna} /></div>
      {preguntas
        ? preguntas.map((p, i) => (
            <div key={i}>
              {caja(`texto-${i}`, <><span className={s.numReactivo}>{i + 1}.</span><TextoRico texto={p} /></>, 4)}
              {e.modelo && porPregunta && (
                <div className={s.modelo} data-modelo={a.id}>
                  <p className={s.modeloTit} lang="es">Respuesta modelo</p>
                  <TextoRico como="div" className={s.modeloTxt} texto={partes[i].replace(/^\d+\.\s*/, "")} />
                </div>
              )}
            </div>
          ))
        : caja("texto", "Tu respuesta", 6)}
      {aviso && (
        <p className={s.aviso} role="status" lang="es">
          Escribe primero tu respuesta: así podrás compararla. Si quieres ver la respuesta modelo de todos modos, toca otra vez.
        </p>
      )}
      <div className={s.accionesAbierta} lang="es">
        <button
          type="button" className={e.modelo ? s.botonSecundario : s.botonPrimario} aria-expanded={!!e.modelo} data-accion="ver-modelo"
          onClick={verModelo}
        >
          {e.modelo ? "Ocultar respuesta modelo" : "Ver respuesta modelo"}
        </button>
      </div>
      {e.modelo && (
        <div className={s.modelo} data-modelo={a.id}>
          {!porPregunta && <p className={s.modeloTit} lang="es">Respuesta modelo</p>}
          {!porPregunta && <TextoRico como="div" className={s.modeloTxt} texto={a.respuesta_modelo} />}
          <p className={s.modeloTit} lang="es">Revisa si tu respuesta:</p>
          <ul className={s.criterios}>
            {a.criterios.map((c, i) => (
              <li key={i}>
                <label className={s.criterio}>
                  <input
                    type="checkbox" checked={!!e.criterios?.[i]}
                    onChange={() => cambiar((x) => ({ ...x, criterios: { ...x.criterios, [i]: !x.criterios?.[i] } }))}
                  />
                  <span><TextoRico texto={c.replace(/\.\s*$/, "")} /></span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}


/* ───────────────────────────── Autoevaluación ───────────────────────────── */

function mensajeAuto(pct: number) {
  return pct >= 0.8 ? "Dominas el tema de esta unidad." : pct >= 0.6 ? "Vas bien. Repasa las preguntas que fallaste." : "Vuelve a «Lo esencial» y repite la autoevaluación.";
}

function Autoevaluacion({ reactivos, instrucciones, estado, bien, cambiar }: {
  reactivos: ReactivoOM[]; instrucciones?: string; estado: EstadoUnidad["auto"]; bien: number;
  cambiar: (fn: (a: EstadoUnidad["auto"]) => EstadoUnidad["auto"]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [irAlResultado, setIrAlResultado] = useState(false);
  const [avisoFaltan, setAvisoFaltan] = useState(false);
  const falladas = reactivos.map((q, i) => (estado.r[q.id] === String(q.correcta) ? 0 : i + 1)).filter(Boolean);
  const total = reactivos.length;
  const contestadas = reactivos.filter((q) => estado.r[q.id] !== undefined).length;
  const pct = total ? bien / total : 0;
  useEffect(() => {
    if (irAlResultado && estado.calificada && ref.current) {
      ref.current.scrollIntoView({ block: "center", behavior: suave() });
      ref.current.focus({ preventScroll: true });
      setIrAlResultado(false);
    }
  }, [irAlResultado, estado.calificada]);
  return (
    <section id="autoevaluacion" className={s.auto} data-actividad="autoevaluacion" aria-labelledby="auto-t">
      <div className={s.actCab}>
        <p className={s.actMeta}><span>Para cerrar</span><span className={s.actTipo}>{total} preguntas</span></p>
        <h3 id="auto-t" className={s.actTitulo}>Autoevaluación</h3>
        <TextoRico
          como="p" className={s.instrucciones}
          texto={instrucciones || "Responde como si fuera el examen. Al final verás cuántas acertaste y la explicación de cada pregunta."}
        />
      </div>
      {estado.calificada && (
        <div ref={ref} className={s.calif} tabIndex={-1} role="status" aria-live="polite" data-puntaje={`${bien}/${total}`}>
          <svg className={s.anillo} viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className={s.anilloFondo} />
            <circle cx="60" cy="60" r="52" className={s.anilloValor} style={{ strokeDasharray: `${pct * 326.7} 326.7` }} />
          </svg>
          <div className={s.califTxt}>
            <span className={s.califCifra}>{bien}<span className={s.puntajeDe}>/{total}</span></span>
            <span>{mensajeAuto(pct)}</span>
          </div>
        </div>
      )}
      <div className={s.actCuerpo}>
        <div className={s.lista}>
          {reactivos.map((q, i) => (
            <ReactivoOpciones
              key={q.id} q={q} numero={i + 1} nombre={`autoevaluacion/${q.id}`} valor={estado.r[q.id]} revisado={estado.calificada}
              onElegir={(v) => cambiar((x) => ({ ...x, r: { ...x.r, [q.id]: v } }))}
            />
          ))}
        </div>
      </div>
      <div className={s.acciones}>
        {estado.calificada ? (
          <>
            {falladas.length > 0 && (
              <p className={s.fallaste}>
                <span>Repasa:</span>
                {falladas.map((n) => (
                  <a key={n} className={s.pastilla} href={`#auto-${reactivos[n - 1].id}`}>Pregunta {n}</a>
                ))}
              </p>
            )}
            <button type="button" className={s.botonSecundario} data-accion="reiniciar" onClick={() => cambiar(() => ({ r: {}, calificada: false }))}>
              Volver a intentar
            </button>
          </>
        ) : (
          <>
            <p className={s.ayuda}>Respondidas: {contestadas} de {total}</p>
            {avisoFaltan && (
              <p className={s.aviso} role="status">Te faltan {total - contestadas}. Toca otra vez para ver tu resultado así.</p>
            )}
            <button
              type="button" className={s.botonPrimario} data-accion="calificar"
              onClick={() => {
                if (contestadas < total && !avisoFaltan) { setAvisoFaltan(true); return; }
                setAvisoFaltan(false);
                cambiar((x) => ({ ...x, calificada: true }));
                setIrAlResultado(true);
              }}
            >
              Ver mi resultado
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────────── Íconos ───────────────────────────── */

function IconoBien() {
  return <svg className={s.icono} viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function IconoMal() {
  return <svg className={s.icono} viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>;
}
function IconoFlecha({ arriba }: { arriba?: boolean }) {
  return <svg className={s.icono} viewBox="0 0 20 20" aria-hidden="true"><path d={arriba ? "M5 12.5l5-5 5 5" : "M5 7.5l5 5 5-5"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function IconoDescarga() {
  return <svg className={s.icono} viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
