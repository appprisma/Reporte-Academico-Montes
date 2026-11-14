// ============================================================================
//  Kárdex en PDF · IBIME Plantel 2 Montes
//  Una sola hoja carta por alumno. Este módulo no depende de Firebase ni del
//  DOM: recibe datos ya leídos y la clase jsPDF, y devuelve un documento.
// ============================================================================

export const TITULO = 'REPORTE ACADÉMICO DE ACTIVIDADES';
export const PLANTEL = 'PLANTEL 2 MONTES';

// ---------- Escala de estados (idéntica a la del panel del alumno) ----------
//   5.9 o menos = Crítico · 6.0 a 7.9 = Requiere atención · 8.0 a 8.9 = Satisfactorio · 9.0 a 10 = Excelente
const TOPE_CRITICO = 5.9, TOPE_ATENCION = 7.9, TOPE_SATISFACTORIO = 8.9;
export const ESTADOS = {
  critico:       { etiqueta: 'Crítico',           rango: '5.9 o menos', txt: '#b4570a', bg: '#ffefdd', bd: '#f7c99d', dot: '#f59a4a' },
  atencion:      { etiqueta: 'Requiere atención', rango: '6.0 a 7.9',   txt: '#7d6500', bg: '#fff9d6', bd: '#efdf85', dot: '#f2d12a' },
  satisfactorio: { etiqueta: 'Satisfactorio',     rango: '8.0 a 8.9',   txt: '#1f5f9e', bg: '#e8f2fc', bd: '#bcd8f2', dot: '#76b4ea' },
  excelente:     { etiqueta: 'Excelente',         rango: '9.0 a 10',    txt: '#14805b', bg: '#eaf8f2', bd: '#c8ebdc', dot: '#34b98a' }
};
export const nivel = n => {
  const r = Math.round(Number(n) * 10) / 10;
  return r <= TOPE_CRITICO ? 'critico' : r <= TOPE_ATENCION ? 'atencion' : r <= TOPE_SATISFACTORIO ? 'satisfactorio' : 'excelente';
};
const fmtNota = n => (Math.round(Number(n) * 10) / 10).toFixed(1);

const BRAND = '#07345c', BRAND2 = '#0b5f91', RED = '#ef1b19', TXT = '#16283b', MUTED = '#667789', LINE = '#dfe7ee', SOFT = '#f2f6fa';

// ---------- Utilidades de texto ----------
const normEmail = v => String(v || '').trim().toLowerCase();
const normTxt = v => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
export const sortText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' });
const SMALL = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'al', 'o', 'u', 'con', 'para', 'por', 'un', 'una']);
const ROMAN = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/i;
export function titleCase(s, { roman = true } = {}) {
  const str = String(s ?? '').trim(); if (!str) return '';
  if (str !== str.toUpperCase() && str !== str.toLowerCase()) return str;
  let first = true;
  return str.toLowerCase().split(/(\s+|-)/).map(w => {
    if (!w || /^\s+$|^-$/.test(w)) return w;
    const isFirst = first; first = false;
    if (roman && ROMAN.test(w)) return w.toUpperCase();
    if (!isFirst && SMALL.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
}

const MESES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, jan: 0, apr: 3, aug: 7, dec: 11 };
function parseFecha(txt) {
  const s = String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1]); }
  const mes = (s.match(/[a-z]{3,}/g) || []).map(w => MESES[w.slice(0, 3)]).find(v => v !== undefined);
  const dia = s.match(/\b(\d{1,2})\b/), anio = s.match(/\b(20\d{2})\b/);
  if (mes !== undefined && dia) {
    let y = anio ? +anio[1] : new Date().getFullYear();
    if (!anio && Date.UTC(y, mes, +dia[1]) > Date.now() + 60 * 864e5) y--;
    return Date.UTC(y, mes, +dia[1]);
  }
  return null;
}
const fmtFecha = (txt, ts) => ts != null
  ? new Date(ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('.', '')
  : titleCase(txt, { roman: false });

// ============================================================================
//  1) DATOS: de documentos de Firestore a la estructura del kárdex
// ============================================================================
// alumno: documento de /alumnos · filas: documentos de /calificaciones del alumno
// docentes: Map(correo → { nombre })
export function armarKardex(alumno, filas, docentes = new Map()) {
  const correo = normEmail(alumno.correo || alumno.id);
  const perfil = {
    nombre: titleCase(alumno.nombre || filas.find(r => r.alumno)?.alumno || correo.split('@')[0], { roman: false }),
    correo,
    matricula: String(alumno.matricula || '').trim(),
    grupoEs: String(alumno.grupoEspanol || '').trim(),
    grupoEn: String(alumno.grupoIngles || '').trim(),
    tutor: titleCase(alumno.tutor || '', { roman: false })
  };

  const mapa = new Map();
  for (const r of filas) {
    const materia = String(r.asignatura || r.materia || '').trim();
    if (!materia) continue;
    const grupo = String(r.grupo || '').trim(), dc = normEmail(r.docente);
    const key = [normTxt(materia), normTxt(grupo), dc].join('|');
    if (!mapa.has(key)) mapa.set(key, { materia, grupo, docente: dc, profesor: r.profesor, filas: [] });
    const n = Number(r.calif);
    const calif = Number.isFinite(n) ? n : 0;
    // Mismo criterio que el panel del alumno: sin calificación = no hecha.
    const hecha = typeof r.hecha === 'boolean' ? r.hecha : (Number.isFinite(n) && n > 0);
    mapa.get(key).filas.push({ actividad: r.actividad, fecha: r.fecha, ts: parseFecha(r.fecha), calif, hecha });
  }

  const gEs = normTxt(perfil.grupoEs), gEn = normTxt(perfil.grupoEn);
  const orden = { ES: 0, EN: 1, '': 2 };
  const materias = [...mapa.values()].map(m => {
    const info = docentes.get(m.docente) || {};
    m.nombre = titleCase(m.materia);
    m.tipo = normTxt(m.grupo) && normTxt(m.grupo) === gEs ? 'ES' : normTxt(m.grupo) && normTxt(m.grupo) === gEn ? 'EN' : '';
    m.docNombre = titleCase(info.nombre || m.profesor || m.docente || 'Docente', { roman: false });
    m.total = m.filas.length;
    m.hechas = m.filas.filter(f => f.hecha).length;
    m.pct = m.total ? m.hechas / m.total : 0;
    m.prom = m.total ? m.filas.reduce((s, f) => s + (f.hecha ? f.calif : 0), 0) / m.total : 0; // no hechas = 0
    m.estado = nivel(m.prom);
    m.criticas = m.filas.filter(f => f.hecha && nivel(f.calif) === 'critico').length;
    m.atencion = m.filas.filter(f => f.hecha && nivel(f.calif) === 'atencion').length;
    return m;
  }).sort((a, b) => orden[a.tipo] - orden[b.tipo] || sortText(a.nombre, b.nombre));

  const totalAct = materias.reduce((s, m) => s + m.total, 0);
  const hechasAct = materias.reduce((s, m) => s + m.hechas, 0);
  const promGeneral = materias.length ? materias.reduce((s, m) => s + m.prom, 0) / materias.length : 0;

  // Actividades calificadas en rango crítico o por mejorar (las más bajas primero).
  const alertas = [];
  for (const m of materias) for (const f of m.filas) {
    if (!f.hecha) continue;
    const nv = nivel(f.calif);
    if (nv === 'critico' || nv === 'atencion') alertas.push({ materia: m.nombre, actividad: titleCase(f.actividad, { roman: false }) || 'Actividad', fecha: fmtFecha(f.fecha, f.ts), calif: f.calif, estado: nv });
  }
  alertas.sort((a, b) => a.calif - b.calif);

  return {
    perfil, materias, alertas,
    resumen: {
      materias: materias.length,
      totalAct, hechasAct, sinCalificar: totalAct - hechasAct,
      pct: totalAct ? hechasAct / totalAct : 0,
      promGeneral, estadoGeneral: nivel(promGeneral),
      criticas: materias.reduce((s, m) => s + m.criticas, 0),
      atencion: materias.reduce((s, m) => s + m.atencion, 0)
    }
  };
}

// ============================================================================
//  2) DIBUJO (jsPDF): una hoja carta, nunca se desborda
// ============================================================================
const W = 612, H = 792, M = 36, CW = W - 2 * M;

function t(doc, s, x, y, { size = 9, bold = false, color = TXT, align = 'left', max = 0, base = 'alphabetic' } = {}) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
  let str = String(s ?? '');
  if (max && doc.getTextWidth(str) > max) {
    while (str.length > 1 && doc.getTextWidth(str + '...') > max) str = str.slice(0, -1);
    str = str.trimEnd() + '...';
  }
  doc.text(str, x, y, { align, baseline: base });
}
const rect = (doc, x, y, w, h, fill, { r = 0, stroke = null, lw = 0.6 } = {}) => {
  if (fill) doc.setFillColor(fill);
  if (stroke) { doc.setDrawColor(stroke); doc.setLineWidth(lw); }
  const mode = fill && stroke ? 'FD' : fill ? 'F' : 'S';
  r ? doc.roundedRect(x, y, w, h, r, r, mode) : doc.rect(x, y, w, h, mode);
};
const circle = (doc, x, y, r, fill) => { doc.setFillColor(fill); doc.circle(x, y, r, 'F'); };
const hline = (doc, x1, x2, y, color = LINE, lw = 0.6) => { doc.setDrawColor(color); doc.setLineWidth(lw); doc.line(x1, y, x2, y); };

function pill(doc, texto, cx, cy, w, h, est, size = 6.6) {
  rect(doc, cx - w / 2, cy - h / 2, w, h, est.bg, { r: h / 2, stroke: est.bd, lw: 0.5 });
  t(doc, texto, cx, cy, { size, bold: true, color: est.txt, align: 'center', base: 'middle', max: w - 4 });
}

export function dibujarKardex(doc, k, opts = {}) {
  const { logo = null, periodo = '', mostrarPromedio = false, firmas = true, emision = new Date() } = opts;
  const { perfil, materias, alertas, resumen } = k;
  const fechaEmision = emision.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  // ---------- Encabezado ----------
  rect(doc, 0, 0, W, 7, BRAND);
  rect(doc, W - 170, 0, 170, 7, RED);
  if (logo) {
    const lh = 50, lw = lh * logo.w / logo.h;
    doc.addImage(logo.dataUrl, 'PNG', M, 20, lw, lh);
  } else t(doc, 'IBIME', M, 52, { size: 28, bold: true, color: BRAND });
  t(doc, TITULO, W - M, 40, { size: 15, bold: true, color: BRAND, align: 'right' });
  t(doc, PLANTEL, W - M, 57, { size: 13, bold: true, color: RED, align: 'right' });
  t(doc, `Kárdex del alumno${periodo ? '  ·  ' + periodo : ''}`, W - M, 71, { size: 8.5, color: MUTED, align: 'right', max: 360 });
  hline(doc, M, W - M, 82, BRAND, 1.2);

  // ---------- Datos del alumno ----------
  const cy = 92, ch = 72;
  rect(doc, M, cy, CW, ch, SOFT, { r: 6, stroke: LINE });
  rect(doc, M, cy, 4, ch, BRAND2);
  t(doc, perfil.nombre, M + 16, cy + 22, { size: 15, bold: true, color: BRAND, max: CW - 190 });
  t(doc, perfil.correo, M + 16, cy + 35, { size: 8.5, color: MUTED, max: CW - 190 });
  t(doc, 'FECHA DE EMISIÓN', W - M - 12, cy + 17, { size: 6.5, color: MUTED, align: 'right', bold: true });
  t(doc, fechaEmision, W - M - 12, cy + 29, { size: 9, bold: true, align: 'right' });
  const campos = [['MATRÍCULA', perfil.matricula || 'Sin registrar', 92], ['GRUPO ESPAÑOL', perfil.grupoEs || 'Sin registrar', 128], ['GRUPO INGLÉS', perfil.grupoEn || 'Sin registrar', 128], ['TUTOR', perfil.tutor || 'Sin registrar', 164]];
  let fx = M + 16;
  for (const [et, val, w] of campos) {
    t(doc, et, fx, cy + 52, { size: 6.5, color: MUTED, bold: true });
    t(doc, val, fx, cy + 63, { size: 9, bold: true, max: w - 8 });
    fx += w;
  }

  // ---------- Indicadores ----------
  const ky = 174, kh = 46, kg = 10, kw = (CW - 3 * kg) / 4;
  const eg = ESTADOS[resumen.estadoGeneral];
  const kpis = [
    { v: String(resumen.materias), l: 'MATERIAS', c: BRAND },
    { v: `${resumen.hechasAct} de ${resumen.totalAct}`, l: 'ACTIVIDADES REALIZADAS', c: BRAND },
    { v: `${Math.round(resumen.pct * 100)}%`, l: 'CUMPLIMIENTO DE ACTIVIDADES', c: BRAND },
    { v: resumen.materias ? eg.etiqueta : 'Sin datos', l: mostrarPromedio && resumen.materias ? `ESTADO GENERAL · PROM. ${fmtNota(resumen.promGeneral)}` : 'ESTADO GENERAL', c: resumen.materias ? eg.txt : MUTED }
  ];
  kpis.forEach((p, i) => {
    const x = M + i * (kw + kg);
    rect(doc, x, ky, kw, kh, '#ffffff', { r: 6, stroke: LINE });
    if (i === 3 && resumen.materias) rect(doc, x, ky, kw, 3.5, eg.dot, { r: 1.5 });
    t(doc, p.v, x + kw / 2, ky + 22, { size: i === 3 ? 11.5 : 16, bold: true, color: p.c, align: 'center', max: kw - 10 });
    t(doc, p.l, x + kw / 2, ky + 37, { size: 6.2, color: MUTED, align: 'center', bold: true });
  });

  // ---------- Zona inferior (se calcula de abajo hacia arriba) ----------
  const bottom = H - 28;
  const notaH = 17, legH = 14, gap = 8, firmasH = firmas ? 46 : 0;
  const footTop = bottom - notaH - gap - legH - gap - firmasH;

  // ---------- Tabla de materias ----------
  const ty = 232;
  t(doc, 'Detalle por materia', M, ty + 8, { size: 10, bold: true, color: BRAND });
  const cols = mostrarPromedio
    ? [['Materia', 142], ['Docente', 112], ['Grupo', 50], ['Hechas', 42], ['Cumplimiento', 82], ['Prom.', 34], ['Estado', 78]]
    : [['Materia', 156], ['Docente', 122], ['Grupo', 54], ['Hechas', 46], ['Cumplimiento', 90], ['Estado', 72]];
  const xs = []; { let a = M; for (const [, w] of cols) { xs.push(a); a += w; } }
  const hy = ty + 15, hh = 16;
  rect(doc, M, hy, CW, hh, BRAND, { r: 3 });
  cols.forEach(([n, w], i) => t(doc, n.toUpperCase(), xs[i] + (i >= 3 ? w / 2 : 8), hy + hh / 2, { size: 6.6, bold: true, color: '#ffffff', base: 'middle', align: i >= 3 ? 'center' : 'left' }));

  const rowsTop = hy + hh + 2;
  const n = Math.max(1, materias.length);
  const avail = footTop - 10 - rowsTop;
  const unaLinea = 16;
  const attnWant = alertas.length ? 26 + Math.min(alertas.length, 8) * 12.5 + (alertas.length > 8 ? 11 : 0) : 28;
  let rowH = Math.min(22, Math.max(11, (avail - attnWant - 12) / n));
  if (!materias.length) rowH = 30;
  const fs = Math.min(8.4, Math.max(6.2, rowH - 6));

  if (!materias.length) {
    rect(doc, M, rowsTop, CW, rowH, '#ffffff', { stroke: LINE });
    t(doc, 'Aún no hay calificaciones registradas para este alumno.', W / 2, rowsTop + rowH / 2, { size: 9, color: MUTED, align: 'center', base: 'middle' });
  }
  materias.forEach((m, i) => {
    const y = rowsTop + i * rowH, mid = y + rowH / 2, est = ESTADOS[m.estado];
    if (i % 2 === 0) rect(doc, M, y, CW, rowH, '#f8fafc');
    rect(doc, M, y + 1, 2.4, rowH - 2, est.dot);
    let nx = xs[0] + 8;
    if (m.tipo) {
      const tw = 13;
      rect(doc, nx, mid - 4.2, tw, 8.4, m.tipo === 'ES' ? BRAND : RED, { r: 2 });
      t(doc, m.tipo, nx + tw / 2, mid, { size: 5.4, bold: true, color: '#ffffff', align: 'center', base: 'middle' });
      nx += tw + 4;
    }
    t(doc, m.nombre, nx, mid, { size: fs, bold: true, base: 'middle', max: cols[0][1] - (nx - xs[0]) - 4 });
    t(doc, m.docNombre, xs[1] + 8, mid, { size: fs - 0.4, color: MUTED, base: 'middle', max: cols[1][1] - 12 });
    t(doc, m.grupo || '—', xs[2] + 8, mid, { size: fs - 0.4, color: MUTED, base: 'middle', max: cols[2][1] - 10 });
    t(doc, `${m.hechas}/${m.total}`, xs[3] + cols[3][1] / 2, mid, { size: fs, bold: true, align: 'center', base: 'middle' });
    // barra de cumplimiento
    const bw = cols[4][1] - 44, bx = xs[4] + 8, bh = Math.min(5, rowH - 7);
    rect(doc, bx, mid - bh / 2, bw, bh, '#e6edf3', { r: bh / 2 });
    if (m.pct > 0) rect(doc, bx, mid - bh / 2, Math.max(bh, bw * m.pct), bh, est.dot, { r: bh / 2 });
    t(doc, `${Math.round(m.pct * 100)}%`, bx + bw + 5, mid, { size: fs - 0.4, bold: true, base: 'middle' });
    let ci = 5;
    if (mostrarPromedio) { t(doc, fmtNota(m.prom), xs[5] + cols[5][1] / 2, mid, { size: fs, bold: true, align: 'center', base: 'middle', color: est.txt }); ci = 6; }
    pill(doc, est.etiqueta, xs[ci] + cols[ci][1] / 2, mid, cols[ci][1] - 8, Math.min(11, rowH - 3), est, Math.min(6.6, fs - 1.2));
  });
  const tableBottom = rowsTop + (materias.length ? materias.length * rowH : rowH);
  hline(doc, M, W - M, tableBottom + 1);

  // ---------- Actividades por atender ----------
  let ay = tableBottom + 14;
  const restante = footTop - 6 - ay;
  t(doc, 'Actividades por atender', M, ay + 6, { size: 10, bold: true, color: BRAND });
  const sinTxt = resumen.sinCalificar ? `Sin calificar o no entregadas: ${resumen.sinCalificar}` : 'Sin actividades pendientes';
  t(doc, sinTxt, W - M, ay + 6, { size: 7.5, bold: true, color: resumen.sinCalificar ? ESTADOS.critico.txt : ESTADOS.excelente.txt, align: 'right' });
  ay += 13;
  let finLista = ay + 14;
  if (!alertas.length) {
    t(doc, resumen.materias ? 'No hay actividades calificadas en rango crítico ni por mejorar.' : 'Sin información que mostrar.', M, ay + 8, { size: 8, color: MUTED });
  } else {
    const cap = Math.max(0, Math.floor((restante - 22) / 12.5));
    const mostrar = alertas.slice(0, Math.min(cap, 10));
    if (!mostrar.length) {
      t(doc, `${alertas.length} actividad(es) calificadas por mejorar o críticas. Consulta el detalle en el portal del alumno.`, M, ay + 8, { size: 8, color: MUTED, max: CW });
    } else {
      mostrar.forEach((a, i) => {
        const y = ay + i * 12.5, e = ESTADOS[a.estado];
        if (i % 2 === 0) rect(doc, M, y - 1, CW, 12.5, '#f8fafc');
        circle(doc, M + 8, y + 5.2, 2.6, e.dot);
        t(doc, a.materia, M + 16, y + 5.2, { size: 7.4, bold: true, base: 'middle', max: 150 });
        t(doc, a.actividad, M + 172, y + 5.2, { size: 7.4, color: TXT, base: 'middle', max: 228 });
        t(doc, a.fecha || '', M + 410, y + 5.2, { size: 7, color: MUTED, base: 'middle', max: 70 });
        pill(doc, fmtNota(a.calif), W - M - 24, y + 5.2, 34, 9.6, e, 6.6);
      });
      finLista = ay + mostrar.length * 12.5 + (alertas.length > mostrar.length ? 12 : 2);
      if (alertas.length > mostrar.length) t(doc, `... y ${alertas.length - mostrar.length} actividad(es) más en el portal del alumno.`, M + 16, ay + mostrar.length * 12.5 + 8, { size: 7, color: MUTED });
    }
  }

  // ---------- Observaciones (si sobra espacio) y firmas ----------
  if (firmas) {
    const oy = finLista + 8, oh = (footTop + firmasH - 22) - oy;
    if (oh >= 46) {
      t(doc, 'Observaciones', M, oy + 6, { size: 10, bold: true, color: BRAND });
      const lineas = Math.min(6, Math.floor((oh - 18) / 16));
      for (let i = 1; i <= lineas; i++) hline(doc, M, W - M, oy + 12 + i * 16, '#c9d5df', 0.5);
    }
  }
  if (firmas) {
    const fy = bottom - notaH - gap - legH - gap - 12, fw = 190;
    hline(doc, M + 10, M + 10 + fw, fy, TXT, 0.7);
    t(doc, 'Enterado(a): padre, madre o tutor', M + 10 + fw / 2, fy + 9, { size: 7, color: MUTED, align: 'center' });
    hline(doc, W - M - 10 - fw, W - M - 10, fy, TXT, 0.7);
    t(doc, 'Dirección · Plantel 2 Montes', W - M - 10 - fw / 2, fy + 9, { size: 7, color: MUTED, align: 'center' });
  }

  // ---------- Leyenda y nota ----------
  const ly = bottom - notaH - gap - legH / 2;
  t(doc, 'ESCALA:', M, ly, { size: 6.6, bold: true, color: MUTED, base: 'middle' });
  let lx = M + 36;
  for (const e of Object.values(ESTADOS)) {
    circle(doc, lx + 3, ly, 3, e.dot);
    const s = `${e.etiqueta} (${e.rango})`;
    t(doc, s, lx + 10, ly, { size: 6.8, color: TXT, base: 'middle' });
    lx += 10 + doc.getTextWidth(s) + 16;
  }
  hline(doc, M, W - M, bottom - notaH - 3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); doc.setTextColor(MUTED);
  const nota = 'Este reporte refleja las actividades registradas por los docentes en el Portal de Calificaciones IBIME a la fecha de emisión. Una actividad sin calificación se considera no entregada y cuenta como 0 para definir el estado de la materia. Ante cualquier duda, acércate con el docente o con tu tutor.';
  doc.text(doc.splitTextToSize(nota, CW).slice(0, 3), M, bottom - notaH + 5, { baseline: 'alphabetic' });
}

// ---------- Documento completo: una hoja por alumno ----------
export function crearPDF(JsPDF, kardexes, opts = {}) {
  if (!kardexes.length) throw new Error('No hay alumnos para generar.');
  const doc = new JsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${TITULO} ${PLANTEL}`, author: 'IBIME · Plantel 2 Montes', subject: 'Kárdex del alumno', creator: 'Portal de Calificaciones IBIME' });
  kardexes.forEach((k, i) => {
    if (i > 0) doc.addPage('letter', 'portrait');
    dibujarKardex(doc, k, opts);
  });
  return doc;
}

// Nombre de archivo seguro: "Kardex_1A_Perez-Lopez-Juan.pdf"
export const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sin-nombre';
export const nombreArchivo = (k, grupo = '') => `Kardex_${grupo ? slug(grupo) + '_' : ''}${slug(k.perfil.nombre)}.pdf`;
