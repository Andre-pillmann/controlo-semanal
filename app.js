/* Controlo Semanal · Mari & André
   Offline-first: a fonte de verdade é o localStorage.
   A sincronização com o Worker é opcional e faz merge por id/updatedAt. */

const VERSAO = "1.2.0";
const META = 350;
const RITMO = META / 7;
const K_DADOS = "gastos-familia-v1";
const K_URL = "sync-url";
const K_KEY = "sync-key";

const CATS = [
  { id: "mercado",    nome: "Supermercado",      verba: 165, cor: "#4E9FD1" },
  { id: "feira",      nome: "Feira & padaria",   verba: 12,  cor: "#6FB3D6" },
  { id: "fora",       nome: "Refeições fora",    verba: 55,  cor: "#E0A458" },
  { id: "carro",      nome: "Carro (energia)",   verba: 45,  cor: "#9C89C4" },
  { id: "transporte", nome: "Transportes",       verba: 12,  cor: "#B3A6D6" },
  { id: "saude",      nome: "Saúde & farmácia",  verba: 15,  cor: "#D9636B" },
  { id: "criancas",   nome: "Crianças & escola", verba: 15,  cor: "#E88FA0" },
  { id: "lazer",      nome: "Lazer & cultura",   verba: 25,  cor: "#5FC2B0" },
  { id: "outros",     nome: "Outros",            verba: 6,   cor: "#8A9AAB" },
];
// categorias antigas -> atuais, para os lançamentos já feitos não se perderem
const LEGADO = { casa: "mercado" };
const QUEM = ["Casa", "Mari", "André"];
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const $ = (id) => document.getElementById(id);
const eur = (n) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const segunda = (d) => {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const cat = (id) => {
  const alvo = LEGADO[id] || id;
  return CATS.find((c) => c.id === alvo) || CATS[CATS.length - 1];
};

/* Aceita 1,80 · 1.80 · 1 234,56 · "1,80 €" — independente da região do telemóvel */
function lerValor(txt) {
  let s = String(txt).replace(/[^\d.,]/g, "");
  if (!s) return NaN;
  const v = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (v > -1 && p > -1) {
    // o separador que aparece por último é o decimal
    s = v > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (v > -1) {
    s = s.replace(/,/g, ".");
  }
  return parseFloat(s);
}

let entradas = [];
let ref = segunda(new Date());

/* ---------- persistência local ---------- */
function ler() {
  try { entradas = JSON.parse(localStorage.getItem(K_DADOS) || "[]"); }
  catch { entradas = []; }
}
function gravar() {
  localStorage.setItem(K_DADOS, JSON.stringify(entradas));
}

/* ---------- sincronização ---------- */
const cfgSync = () => ({
  url: (localStorage.getItem(K_URL) || "").replace(/\/+$/, ""),
  key: localStorage.getItem(K_KEY) || "",
});

function fundir(a, b) {
  const m = new Map();
  for (const e of [...a, ...b]) {
    const atual = m.get(e.id);
    if (!atual || (e.updatedAt || 0) > (atual.updatedAt || 0)) m.set(e.id, e);
  }
  return [...m.values()];
}

let aSincronizar = false;
async function sincronizar(silencioso = true) {
  const { url, key } = cfgSync();
  if (!url || !key || aSincronizar) return;
  aSincronizar = true;
  estadoSync("A sincronizar…", "var(--muted)");
  try {
    const r = await fetch(url + "/dados", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ entradas }),
    });
    if (!r.ok) throw new Error(r.status === 401 ? "Chave incorreta." : "Erro " + r.status);
    const remoto = await r.json();
    entradas = fundir(entradas, remoto.entradas || []);
    gravar();
    render();
    estadoSync("Sincronizado às " + new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }), "var(--ok)");
  } catch (e) {
    estadoSync(
      navigator.onLine ? "Não sincronizou: " + e.message : "Sem ligação — os dados ficam guardados aqui.",
      "var(--warn)"
    );
  } finally {
    aSincronizar = false;
  }
}
function estadoSync(msg, cor) {
  $("syncMsg").textContent = msg;
  $("syncDot").style.background = cor;
  $("syncLabel").textContent = cfgSync().url ? "Sincronização ativa" : "Sincronização";
}

/* ---------- cálculos ---------- */
function semana() {
  const ini = iso(ref), fim = iso(addDias(ref, 6));
  const lista = entradas
    .filter((e) => !e.deleted && e.date >= ini && e.date <= fim)
    .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
  const total = lista.reduce((s, e) => s + e.amount, 0);
  const porDia = Array(7).fill(0);
  lista.forEach((e) => {
    const i = Math.round((new Date(e.date + "T00:00") - ref) / 86400000);
    if (i >= 0 && i < 7) porDia[i] += e.amount;
  });
  let acc = 0;
  const acumulado = porDia.map((v) => (acc += v));
  const hoje = segunda(new Date()).getTime() === ref.getTime();
  const passada = new Date(fim + "T23:59") < new Date();
  const diaIdx = hoje ? (new Date().getDay() + 6) % 7 : passada ? 6 : 0;
  return { ini, fim, lista, total, porDia, acumulado, hoje, passada, diaIdx };
}

/* ---------- render ---------- */
function render() {
  const s = semana();
  const fim = addDias(ref, 6);
  const mesmoMes = ref.getMonth() === fim.getMonth();
  const fmt = (d, m) => d.getDate() + (m ? " " + d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "") : "");
  $("semana").textContent = `${fmt(ref, !mesmoMes)} – ${fmt(fim, true)}`;
  $("next").disabled = ref.getTime() >= segunda(new Date()).getTime();

  const restante = META - s.total;
  const pct = Math.min(100, (s.total / META) * 100);
  $("restLabel").textContent = restante >= 0 ? "Resta" : "Excedido em";
  $("restante").textContent = eur(Math.abs(restante));
  $("restante").style.color = restante >= 0 ? "var(--text)" : "var(--over)";
  $("gasto").textContent = "gasto " + eur(s.total);
  $("pctTxt").textContent = Math.round((s.total / META) * 100) + "% da meta";

  const st =
    pct >= 100 ? { c: "var(--over)", t: "Meta ultrapassada" }
    : pct >= 90 ? { c: "var(--over)", t: "90% da meta consumida" }
    : pct >= 70 ? { c: "var(--warn)", t: "70% da meta consumida" }
    : { c: "var(--accent)", t: "Dentro da meta" };
  $("bar").style.width = pct + "%";
  $("bar").style.background = st.c;

  const diasRestantes = 6 - s.diaIdx;
  let extra = "";
  if (s.hoje && diasRestantes > 0 && restante > 0)
    extra = ` <span>· ${eur(restante / diasRestantes)}/dia nos próximos ${diasRestantes} dia${diasRestantes > 1 ? "s" : ""}</span>`;
  $("estado").innerHTML = st.t + extra;
  $("estado").style.color = st.c;

  const esperado = RITMO * (s.diaIdx + 1);
  const desvio = s.total - esperado;
  $("ritmo").textContent = `ritmo ideal ${eur(esperado)} · ${desvio > 0 ? eur(desvio) + " acima" : eur(-desvio) + " abaixo"}`;

  grafico(s, desvio);
  categorias(s.lista);
  lancamentos(s.lista);
}

function grafico(s, desvio) {
  const W = 340, H = 130, padL = 10, padR = 10, padT = 12, padB = 22;
  const pw = W - padL - padR, ph = H - padT - padB;
  const yMax = Math.max(META, s.total * 1.08);
  const px = (i) => padL + ((i + 1) / 7) * pw;
  const py = (v) => padT + ph - (v / yMax) * ph;
  const cor = desvio > 0 ? "var(--warn)" : "var(--ok)";
  const ate = s.diaIdx;
  const pts = [`${padL},${py(0)}`].concat(s.acumulado.slice(0, ate + 1).map((v, i) => `${px(i)},${py(v)}`));
  const bolas = s.acumulado.slice(0, ate + 1)
    .map((v, i) => `<circle cx="${px(i)}" cy="${py(v)}" r="${i === ate ? 3.6 : 2.2}" fill="${cor}"/>`).join("");
  const labels = DIAS.map((d, i) =>
    `<text x="${px(i)}" y="${H - 6}" font-size="9" fill="var(--muted)" text-anchor="middle">${d}</text>`).join("");
  $("grafico").innerHTML = `
    <line x1="${padL}" y1="${py(META)}" x2="${W - padR}" y2="${py(META)}" stroke="var(--line)"/>
    <line x1="${padL}" y1="${py(0)}" x2="${W - padR}" y2="${py(META)}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".55"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linejoin="round"/>
    ${bolas}${labels}
    <text x="${W - padR}" y="${py(META) - 5}" font-size="9" fill="var(--muted)" text-anchor="end">350</text>`;
}

function categorias(lista) {
  $("cats").innerHTML = CATS.map((c) => {
    const g = lista.filter((e) => cat(e.cat).id === c.id).reduce((s, e) => s + e.amount, 0);
    const p = Math.min(100, (g / c.verba) * 100);
    const over = g > c.verba;
    return `<div class="catrow">
      <div class="catlab">
        <span style="color:${g ? "var(--text)" : "var(--muted)"}">${c.nome}</span>
        <b style="color:${over ? "var(--over)" : "var(--muted)"}">${eur(g)} <span style="opacity:.5">/ ${eur(c.verba)}</span></b>
      </div>
      <div class="catbar"><div style="width:${p}%;background:${over ? "var(--over)" : c.cor}"></div></div>
    </div>`;
  }).join("");
}

function lancamentos(lista) {
  $("lancLabel").textContent = `Lançamentos · ${lista.length}`;
  if (!lista.length) {
    $("lista").innerHTML = `<div class="empty">Sem gastos nesta semana. Lança o primeiro acima.</div>`;
    return;
  }
  const hoje = iso(new Date());
  $("lista").innerHTML = lista.map((e) => {
    const c = cat(e.cat);
    const d = new Date(e.date + "T00:00");
    return `<div class="item">
      <span class="chip" style="background:${c.cor}"></span>
      <div class="m">
        <div class="d"></div>
        <div class="s">${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()} · ${c.nome} · ${e.who}${
          e.date === hoje ? ' · <span style="color:var(--accent)">hoje</span>' : ""}</div>
      </div>
      <span class="v">${eur(e.amount)}</span>
      <button class="del" data-id="${e.id}" aria-label="Remover lançamento">×</button>
    </div>`;
  }).join("");
  // descrição via textContent, para não interpretar o que foi escrito
  [...$("lista").querySelectorAll(".d")].forEach((el, i) => (el.textContent = lista[i].desc));
  [...$("lista").querySelectorAll(".del")].forEach((b) =>
    b.addEventListener("click", () => remover(Number(b.dataset.id))));
}

/* ---------- ações ---------- */
function adicionar() {
  const v = lerValor($("valor").value);
  if (!v || v <= 0) { $("valor").focus(); return; }
  const dia = $("dia").value || iso(new Date());
  entradas.push({
    id: Date.now(),
    date: dia,
    desc: $("desc").value.trim() || "—",
    amount: Math.round(v * 100) / 100,
    cat: $("cat").value,
    who: $("quem").value,
    updatedAt: Date.now(),
  });
  gravar();
  $("valor").value = ""; $("desc").value = ""; $("valor").focus();
  ref = segunda(new Date(dia + "T00:00"));
  render();
  sincronizar();
}

function remover(id) {
  const e = entradas.find((x) => x.id === id);
  if (!e) return;
  e.deleted = true;
  e.updatedAt = Date.now();
  gravar(); render(); sincronizar();
}

/* ---------- exportação ---------- */
// Excel em português usa ; como separador de colunas e , como decimal
function csvCampo(s) {
  s = String(s ?? "");
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarCSV() {
  const linhas = entradas
    .filter((e) => !e.deleted)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  if (!linhas.length) {
    $("expMsg").textContent = "Ainda não há lançamentos para exportar.";
    return;
  }

  const cab = ["Data", "Semana", "Dia", "Descrição", "Categoria", "Quem", "Valor"];
  const corpo = linhas.map((e) => {
    const d = new Date(e.date + "T00:00");
    return [
      e.date,
      iso(segunda(d)),
      DIAS[(d.getDay() + 6) % 7],
      e.desc,
      cat(e.cat).nome,
      e.who,
      e.amount.toFixed(2).replace(".", ","),
    ].map(csvCampo).join(";");
  });

  // BOM à cabeça para o Excel reconhecer os acentos
  const txt = "\uFEFF" + [cab.join(";"), ...corpo].join("\r\n");
  const nome = `controlo-semanal-${iso(new Date())}.csv`;
  const blob = new Blob([txt], { type: "text/csv;charset=utf-8" });

  // no telemóvel abre a folha de partilha; no computador descarrega
  try {
    const ficheiro = new File([blob], nome, { type: "text/csv" });
    if (navigator.canShare && navigator.canShare({ files: [ficheiro] })) {
      navigator.share({ files: [ficheiro], title: "Controlo semanal" }).catch(() => {});
      $("expMsg").textContent = `${linhas.length} lançamentos prontos a enviar.`;
      return;
    }
  } catch {}

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  $("expMsg").textContent = `${linhas.length} lançamentos exportados.`;
}

/* ---------- arranque ---------- */
function iniciar() {
  $("cat").innerHTML = CATS.map((c) => `<option value="${c.id}">${c.nome}</option>`).join("");
  $("quem").innerHTML = QUEM.map((q) => `<option value="${q}">${q}</option>`).join("");
  $("dia").value = iso(new Date());
  $("ver").textContent = "versão " + VERSAO;
  $("syncUrl").value = cfgSync().url;
  $("syncKey").value = cfgSync().key;
  estadoSync(cfgSync().url ? "Configurada." : "Só neste aparelho.", cfgSync().url ? "var(--ok)" : "var(--muted)");

  $("add").addEventListener("click", adicionar);
  ["valor", "desc"].forEach((id) =>
    $(id).addEventListener("keydown", (ev) => ev.key === "Enter" && adicionar()));
  $("prev").addEventListener("click", () => { ref = addDias(ref, -7); render(); });
  $("next").addEventListener("click", () => { ref = addDias(ref, 7); render(); });
  $("salvarCfg").addEventListener("click", () => {
    localStorage.setItem(K_URL, $("syncUrl").value.trim());
    localStorage.setItem(K_KEY, $("syncKey").value.trim());
    estadoSync("Guardado.", "var(--ok)");
    sincronizar();
  });
  $("exportar").addEventListener("click", exportarCSV);
  $("sincronizar").addEventListener("click", () => sincronizar(false));
  window.addEventListener("online", () => sincronizar());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sincronizar(); });

  ler(); render(); sincronizar();

  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}

iniciar();
