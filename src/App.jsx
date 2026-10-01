import React, { useState, useMemo, useEffect } from "react";
import {
  ClipboardList, CalendarDays, Boxes, Truck, Calendar, Plus, Archive,
  Search, ScanLine, ChevronDown, ChevronRight, X, FileText, QrCode,
  Shield, Check, Pencil, MapPin, Upload, CircleUser, Menu,
  ArrowRight, Package, Users, Warehouse, Filter, RotateCcw, Building2,
  Eye, ChevronLeft, KeyRound, Smartphone, Unlock, LogOut, Link2, LayoutGrid, List as ListIcon, Wrench, AlertTriangle, BarChart3,
} from "lucide-react";
import * as db from "./db.js";

/* ------------------------------------------------------------------ *
 *  Logiciel de gestion de parc — location de matériel médical
 *  Prototype interactif (données en mémoire)
 * ------------------------------------------------------------------ */

const TODAY = "2026-06-16";

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtFR = (s) => { const d = parseISO(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const dayBefore = (s) => { const d = parseISO(s); d.setDate(d.getDate() - 1); return toISO(d); };
const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const WD = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

let _seq = 9000;
const newId = (prefix) => `${prefix}-${++_seq}`;

function resStatus(r) {
  if (r.archived) return "archivée";
  if (r.start > TODAY) return "à venir";
  if (r.end < TODAY) return "en retard";
  return "en cours";
}
function trStatus(t) {
  if (t.archived) return "terminé";
  if (t.date > TODAY) return "à venir";
  return "en cours";
}
// true when the product is already in the warehouse where the reservation picks it up
function transportDone(res, products) {
  const prod = products.find((p) => p.id === res.product);
  return prod ? prod.warehouse === res.warehouse : true;
}

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // lundi = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/* ---------- seed data ---------- */
const seedWarehouses = [
  { id: "LIE-01", name: "Entrepôt Nord", address: "12 rue des Lilas, 59000 Lille", archived: false , etb: "ETB-01" },
  { id: "LIE-02", name: "Entrepôt Sud", address: "8 av. de la Gare, 69003 Lyon", archived: false , etb: "ETB-01" },
  { id: "LIE-03", name: "Dépôt Central", address: "24 bd Haussmann, 75009 Paris", archived: false , etb: "ETB-01" },
];
const seedPartenaires = [
  { id: "PAR-1", name: "Pharmacie du Centre", address: "3 place du Marché, Lille", archived: false, etb: "ETB-01" },
  { id: "PAR-2", name: "Réseau de soins Nord", address: "18 rue Nationale, Lille", archived: false, etb: "ETB-01" },
];
const seedPatients = [
  { id: "PAT-1001", name: "Marguerite Lefèvre", address: "14 rue Victor Hugo, Lille", partenaire: "PAR-1", archived: false , etb: "ETB-01" },
  { id: "PAT-1002", name: "Henri Dubois", address: "Lyon", archived: false , etb: "ETB-01" },
  { id: "PAT-1003", name: "Camille Roux", address: "", archived: false , etb: "ETB-01" },
  { id: "PAT-1004", name: "Joseph Marchand", address: "Paris", archived: false , etb: "ETB-01" },
];
const seedProducts = [
  { id: "PRD-2001", name: "Fauteuil roulant Invacare", numParc: "P-0428", numSerie: "SN-99A21", prix: "1250", revision: { mode: "temps", every: 6, lastDate: "2025-11-01" }, category: "Fauteuil roulant", sub: "Manuel 4 roues", parts: ["Accoudoirs", "Repose-pieds"], warehouse: "LIE-01", archived: false , etb: "ETB-01" },
  { id: "PRD-2002", name: "Fauteuil électrique", numParc: "P-0512", numSerie: "SN-77C08", prix: "4300", revision: { mode: "usages", every: 5, lastCount: 0 }, category: "Fauteuil roulant", sub: "Électrique", parts: ["Joystick", "Batterie"], warehouse: "LIE-02", archived: false , etb: "ETB-01" },
  { id: "PRD-2003", name: "Lit médicalisé Volker", numParc: "P-0733", numSerie: "SN-11F45", prix: "2100", category: "Lit médicalisé", sub: "Électrique 3 fonctions", parts: ["Barrières", "Télécommande"], linked: ["PRD-2007"], warehouse: "LIE-02", archived: false , etb: "ETB-01" },
  { id: "PRD-2004", name: "Déambulateur Drive", category: "Aide à la marche", sub: "Déambulateur", parts: ["Panier", "Siège"], maintStatus: "reparation", warehouse: "LIE-03", archived: false , etb: "ETB-01" },
  { id: "PRD-2005", name: "Lève-personne", category: "Aide au transfert", sub: "Lève-personne mobile", parts: ["Sangle", "Vérin"], warehouse: "LIE-03", archived: false , etb: "ETB-01" },
  { id: "PRD-2006", name: "Concentrateur d'oxygène", category: "Assistance respiratoire", sub: "Concentrateur d'oxygène", parts: ["Lunettes O₂", "Humidificateur"], warehouse: "LIE-01", archived: false , etb: "ETB-01" },
  { id: "PRD-2007", name: "Matelas anti-escarres", category: "Prévention anti-escarres", sub: "Matelas à air", parts: ["Compresseur", "Housse"], warehouse: "LIE-02", archived: false , etb: "ETB-01" },
];
const seedReservations = [
  { id: "RES-3001", product: "PRD-2001", patient: "PAT-1001", warehouse: "LIE-01", start: "2026-06-10", end: "2026-06-22", note: "Sortie d'hospitalisation, livraison prioritaire.", pdf: "fiche_mesures_lefevre.pdf", archived: false , etb: "ETB-01" },
  { id: "RES-3002", product: "PRD-2003", patient: "PAT-1002", warehouse: "LIE-03", start: "2026-06-18", end: "2026-07-05", note: "Matériel à acheminer au Dépôt Central avant le début.", pdf: null, archived: false , etb: "ETB-01" },
  { id: "RES-3003", product: "PRD-2004", patient: "PAT-1003", warehouse: "LIE-03", start: "2026-06-14", end: "2026-06-20", note: "Rééducation domicile.", pdf: null, archived: false , etb: "ETB-01" },
  { id: "RES-3004", product: "PRD-2005", patient: "PAT-1004", warehouse: "LIE-03", start: "2026-06-02", end: "2026-06-12", note: "Retour non confirmé — à relancer.", pdf: null, archived: false , etb: "ETB-01" },
  { id: "RES-2980", product: "PRD-2002", patient: "PAT-1004", warehouse: "LIE-01", start: "2026-05-02", end: "2026-05-20", note: "", pdf: null, archived: true, returnWarehouse: "LIE-01" , etb: "ETB-01" },
];
const seedTransfers = [
  { id: "TRF-4001", product: "PRD-2002", from: "LIE-02", to: "LIE-01", date: "2026-06-19", archived: false , etb: "ETB-01" },
  { id: "TRF-4002", product: "PRD-2005", from: "LIE-03", to: "LIE-02", date: "2026-06-16", archived: false , etb: "ETB-01" },
  { id: "TRF-3990", product: "PRD-2001", from: "LIE-01", to: "LIE-03", date: "2026-05-30", archived: true , etb: "ETB-01" },
];
const SECTIONS = [
  { id: "reservations", label: "Réservations" },
  { id: "agenda", label: "Agenda" },
  { id: "tiers", label: "Ajout de tiers" },
  { id: "inventaire", label: "Inventaire" },
  { id: "maintenance", label: "Maintenance" },
  { id: "stats", label: "Statistiques" },
  { id: "transport", label: "Transfert" },
];
const seedEstablishments = [
  { id: "ETB-01", name: "CHU de Paris", identifiant: "chu-paris", code: "CHP-4821", archived: false },
  { id: "ETB-02", name: "Clinique du Parc — Lyon", identifiant: "clinique-parc-lyon", code: "CPL-3308", archived: false },
  { id: "ETB-03", name: "Domicile Santé Lille", identifiant: "domicile-sante-lille", code: "DSL-9156", archived: false },
];
const seedAccesses = [
  { id: "ACC-01", establishmentId: "ETB-01", label: "Service logistique", identifiant: "logistique", code: "LOG-2207", sections: ["reservations","agenda","tiers","inventaire","maintenance","stats","transport"], singleDevice: true, activeDevice: "Poste-2F9A", archived: false },
  { id: "ACC-02", establishmentId: "ETB-01", label: "Accueil réservations", identifiant: "accueil", code: "ACR-5530", sections: ["reservations"], singleDevice: true, activeDevice: null, archived: false },
  { id: "ACC-03", establishmentId: "ETB-02", label: "Coordination soins", identifiant: "coordination", code: "COO-8841", sections: ["reservations","agenda"], singleDevice: false, activeDevice: null, archived: false },
  { id: "ACC-04", establishmentId: "ETB-03", label: "Direction", identifiant: "direction", code: "DIR-1190", sections: ["reservations","agenda","tiers","inventaire","maintenance","stats","transport"], singleDevice: true, activeDevice: null, archived: false },
];

/* ---------- visual primitives ---------- */
const STATUS_STYLE = {
  "en cours":  "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  "à venir":   "bg-sky-50 text-sky-700 ring-sky-600/20",
  "en retard": "bg-rose-50 text-rose-700 ring-rose-600/20",
  "archivée":  "bg-slate-100 text-slate-500 ring-slate-400/20",
  "terminé":   "bg-slate-100 text-slate-500 ring-slate-400/20",
};
function Status({ s }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[s] || STATUS_STYLE["archivée"]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {s}
    </span>
  );
}

function Barcode({ code }) {
  const bars = [];
  let x = 0;
  const src = (code + code).slice(0, 22);
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    const w = (c % 4) + 1;
    bars.push(<rect key={i} x={x} y={0} width={w} height={34} />);
    x += w + ((c % 3) + 1);
  }
  return (
    <svg viewBox={`0 0 ${x} 34`} className="h-9 w-full text-slate-800" preserveAspectRatio="none" fill="currentColor">
      {bars}
    </svg>
  );
}
function QrFake({ code, px = 88 }) {
  const size = 21;
  let h = 2166136261;
  for (const ch of code) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let state = h >>> 0 || 123456789;
  const rng = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  const rects = [];
  const finder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      let on;
      if (finder(r, c)) {
        const lr = r < 7 ? r : r - (size - 7);
        const lc = c < 7 ? c : c - (size - 7);
        on = lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
      } else on = rng() > 0.52;
      if (on) rects.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} />);
    }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={px} height={px} className="text-slate-900" fill="currentColor" shapeRendering="crispEdges">
      <rect x={0} y={0} width={size} height={size} fill="white" />
      {rects}
    </svg>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className={`mt-10 w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white shadow-xl ring-1 ring-slate-200`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";

/* ---------- reusable month calendar ---------- */
function MiniCalendar({ year, month, occupied = new Set(), onPrev, onNext }) {
  const cells = monthMatrix(year, month);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <button onClick={onPrev} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><ChevronRight className="rotate-180" size={16} /></button>
        <span className="text-sm font-semibold text-slate-700">{MONTHS[month]} {year}</span>
        <button onClick={onNext} className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WD.map((w) => <div key={w} className="py-1 text-[10px] font-medium uppercase text-slate-400">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = toISO(d);
          const busy = occupied.has(iso);
          const isToday = iso === TODAY;
          return (
            <div key={i} className={`flex h-8 items-center justify-center rounded-md text-xs
              ${busy ? "bg-rose-100 font-semibold text-rose-700" : "text-slate-600 hover:bg-slate-50"}
              ${isToday ? "ring-2 ring-teal-500" : ""}`}>
              {d.getDate()}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 px-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-200" /> occupé</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded ring-2 ring-teal-500" /> aujourd'hui</span>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  MAIN APP
 * ================================================================== */
function MainApp({ store, setStore, access, mode, onExit }) {
  const sections = access.sections;
  const NAV = [
    { id: "reservations", label: "Réservations", icon: ClipboardList, subs: [
      { id: "res-list", label: "Voir les réservations" },
      { id: "res-new", label: "Nouvelle réservation" },
      { id: "res-archive", label: "Archivé / Passé" },
    ]},
    { id: "agenda", label: "Agenda", icon: CalendarDays, subs: [
      { id: "agenda-current", label: "En cours / à venir" },
      { id: "agenda-archive", label: "Archivé / Passé" },
    ]},
    { id: "tiers", label: "Ajout de tiers", icon: Boxes, subs: [
      { id: "tiers-materiel", label: "Fauteuils / Matériels" },
      { id: "tiers-patients", label: "Patients / Clients" },
      { id: "tiers-partenaires", label: "Partenaires" },
      { id: "tiers-lieux", label: "Lieux de stockage" },
      { id: "tiers-archive", label: "Archivé / Passé" },
    ]},
    { id: "inventaire", label: "Inventaire", icon: Warehouse, subs: [
      { id: "inventaire-stock", label: "Stock par entrepôt" },
    ]},
    { id: "maintenance", label: "Maintenance", icon: Wrench, subs: [
      { id: "maintenance-parc", label: "État du parc" },
      { id: "maintenance-revisions", label: "À réviser / réparer" },
    ]},
    { id: "stats", label: "Statistiques", icon: BarChart3, subs: [
      { id: "stats-vue", label: "Vue d'ensemble" },
    ]},
    { id: "transport", label: "Transfert", icon: Truck, subs: [
      { id: "transport-magasinier", label: "Vue magasinier" },
      { id: "transport-current", label: "Transferts en cours / à venir" },
      { id: "transport-archive", label: "Archivé / Passé" },
    ]},
  ].filter((s) => sections.includes(s.id));

  const [open, setOpen] = useState(() => Object.fromEntries(NAV.map((s) => [s.id, true])));
  const [view, setView] = useState(NAV[0]?.subs[0]?.id || "res-list");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAcces, setShowAcces] = useState(false);
  const [toast, setToast] = useState(null);

  // Data is scoped to the current establishment: all accesses of the same
  // establishment share these records; other establishments don't see them.
  const etbId = access.establishmentId;
  const scoped = useMemo(() => ({
    ...store,
    products: store.products.filter((p) => p.etb === etbId),
    patients: store.patients.filter((p) => p.etb === etbId),
    partenaires: (store.partenaires || []).filter((p) => p.etb === etbId),
    warehouses: store.warehouses.filter((w) => w.etb === etbId),
    reservations: store.reservations.filter((r) => r.etb === etbId),
    transfers: store.transfers.filter((t) => t.etb === etbId),
  }), [store, etbId]);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };
  const productName = (id) => scoped.products.find((p) => p.id === id)?.name || id;
  const patientName = (id) => scoped.patients.find((p) => p.id === id)?.name || id;
  const whName = (id) => scoped.warehouses.find((w) => w.id === id)?.name || id;

  if (showAcces) {
    return (
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-slate-50">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-4">
            <button onClick={() => setShowAcces(false)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"><ChevronLeft size={17} /> Retour</button>
          </div>
          <div className="px-4 py-4">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 text-white"><KeyRound size={17} /></div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">Espace accès</div>
                <div className="truncate text-[11px] text-teal-700">{access.establishmentName}</div>
              </div>
            </div>
            <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">Accès de l'établissement</div>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-400 backdrop-blur md:px-6">Gestion des accès</header>
          <div className="px-4 py-6 md:px-8">
            <GestionAcces store={store} setStore={setStore} notify={notify} etbId={etbId} />
          </div>
        </main>
        {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "flex" : "hidden"} w-64 shrink-0 flex-col border-r border-slate-200 bg-white`}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 text-white">
            <Package size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-slate-800">MedPark</div>
            <div className="truncate text-[11px] font-medium text-teal-700">{access.establishmentName}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV.map((sec) => {
            const Icon = sec.icon;
            const isOpen = open[sec.id];
            const activeSec = sec.subs.some((s) => s.id === view);
            return (
              <div key={sec.id}>
                <div className={`flex items-center rounded-lg ${activeSec ? "bg-teal-50" : "hover:bg-slate-50"}`}>
                  <button
                    onClick={() => { setOpen((o) => ({ ...o, [sec.id]: true })); setView(sec.subs[0].id); }}
                    className={`flex flex-1 items-center gap-3 rounded-l-lg px-3 py-2 text-left text-sm font-medium ${activeSec ? "text-teal-800" : "text-slate-700"}`}>
                    <Icon size={17} className={activeSec ? "text-teal-600" : "text-slate-400"} />
                    <span className="flex-1">{sec.label}</span>
                  </button>
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [sec.id]: !o[sec.id] }))}
                    aria-label={isOpen ? "Replier" : "Déplier"}
                    className="rounded-r-lg px-2.5 py-2 text-slate-400 hover:text-slate-600">
                    <ChevronDown size={15} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  </button>
                </div>
                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-100 pl-3">
                    {sec.subs.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => { setView(sub.id); }}
                        className={`block w-full rounded-md px-3 py-1.5 text-left text-[13px] ${view === sub.id ? "bg-teal-50 font-medium text-teal-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <button onClick={() => setShowAcces(true)} title="Gérer les accès" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left hover:bg-slate-50">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><CircleUser size={18} /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-slate-700">{access.accessLabel}</div>
                <div className="plex-mono truncate text-[11px] text-slate-400">{access.establishmentName}</div>
              </div>
              <ChevronRight size={14} className="shrink-0 text-slate-300" />
            </button>
            {mode === "session" && (
              <button onClick={onExit} title="Se déconnecter" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={16} /></button>
            )}
          </div>
        </div>
      </aside>
      {/* Content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {mode === "preview" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 md:px-6">
            <span className="flex items-center gap-2"><Eye size={15} /> Aperçu de l'accès — <strong className="font-semibold">{access.establishmentName}</strong> · {access.accessLabel}</span>
            <button onClick={onExit} className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium hover:bg-amber-200">Quitter l'aperçu</button>
          </div>
        )}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setSidebarOpen((v) => !v)} aria-label="Afficher/masquer le menu"><Menu size={20} /></button>
          <div className="text-sm text-slate-400">
            {view.startsWith("res") ? "Réservations" : view.startsWith("agenda") ? "Agenda" : view.startsWith("tiers") ? "Ajout de tiers" : view.startsWith("inventaire") ? "Inventaire" : view.startsWith("maintenance") ? "Maintenance" : view.startsWith("stats") ? "Statistiques" : view.startsWith("acces") ? "Gestion des accès" : "Transfert"}
          </div>
          {mode === "session" && (
            <button onClick={onExit} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <LogOut size={15} /> Se déconnecter
            </button>
          )}
        </header>

        <div className="flex-1 px-4 py-6 md:px-8">
          {view === "res-list" && <ResList store={scoped} setStore={setStore} notify={notify} go={setView} helpers={{ productName, patientName, whName }} />}
          {view === "res-new" && <ResNew store={scoped} setStore={setStore} notify={notify} go={setView} etbId={etbId} />}
          {view === "res-archive" && <ResArchive store={scoped} setStore={setStore} notify={notify} helpers={{ productName, patientName, whName }} />}
          {view === "agenda-current" && <Agenda store={scoped} archived={false} helpers={{ productName }} />}
          {view === "agenda-archive" && <Agenda store={scoped} archived={true} helpers={{ productName }} />}
          {view === "tiers-materiel" && <TiersMateriel store={scoped} setStore={setStore} notify={notify} helpers={{ whName }} etbId={etbId} />}
          {view === "tiers-patients" && <TiersSimple store={scoped} setStore={setStore} notify={notify} kind="patients" etbId={etbId} />}
          {view === "tiers-partenaires" && <TiersSimple store={scoped} setStore={setStore} notify={notify} kind="partenaires" etbId={etbId} />}
          {view === "tiers-lieux" && <TiersSimple store={scoped} setStore={setStore} notify={notify} kind="warehouses" etbId={etbId} />}
          {view === "tiers-archive" && <TiersArchive store={scoped} setStore={setStore} notify={notify} />}
          {view === "inventaire-stock" && <Inventaire store={scoped} setStore={setStore} notify={notify} helpers={{ whName }} />}
          {view === "maintenance-parc" && <Maintenance store={scoped} setStore={setStore} notify={notify} mode="parc" />}
          {view === "maintenance-revisions" && <Maintenance store={scoped} setStore={setStore} notify={notify} mode="revisions" />}
          {view === "stats-vue" && <Stats store={scoped} helpers={{ productName }} />}
          {view === "transport-current" && <Transport store={scoped} setStore={setStore} notify={notify} archived={false} helpers={{ productName, whName }} etbId={etbId} />}
          {view === "transport-magasinier" && <Magasinier store={scoped} helpers={{ productName, patientName, whName }} />}
          {view === "transport-archive" && <Transport store={scoped} setStore={setStore} notify={notify} archived={true} helpers={{ productName, whName }} etbId={etbId} />}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- header bits ---------- */
function PageTitle({ title, sub, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-400">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ================== Réservations : liste ================== */
function ResList({ store, setStore, notify, helpers }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("date");
  const [viewMode, setViewMode] = useState("list");
  const [scanOpen, setScanOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const { productName, patientName, whName } = helpers;

  let rows = store.reservations.filter((r) => !r.archived);
  if (q.trim()) {
    const t = q.toLowerCase();
    rows = rows.filter((r) =>
      [r.id, productName(r.product), patientName(r.patient), whName(r.warehouse)]
        .join(" ").toLowerCase().includes(t));
  }
  rows = [...rows].sort((a, b) =>
    sort === "date" ? a.start.localeCompare(b.start)
    : sort === "produit" ? productName(a.product).localeCompare(productName(b.product))
    : resStatus(a).localeCompare(resStatus(b)));

  const endReservation = (res, returnWh) => {
    setStore((s) => ({
      ...s,
      reservations: s.reservations.map((r) =>
        r.id === res.id ? { ...r, archived: true, returnWarehouse: returnWh, end: TODAY } : r),
      products: s.products.map((p) => p.id === res.product ? { ...p, warehouse: returnWh } : p),
    }));
    setDetail(null);
    notify("Réservation clôturée et archivée.");
  };
  const archiveReservation = (res) => {
    setStore((s) => ({ ...s, reservations: s.reservations.map((r) => r.id === res.id ? { ...r, archived: true } : r) }));
    setDetail(null);
    notify("Réservation archivée. Vous pouvez en créer une nouvelle.");
  };

  return (
    <div>
      <PageTitle title="Voir les réservations" sub={`${rows.length} réservation(s) active(s)`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (produit, patient, code…)" className={`${inputCls} pl-9`} />
        </div>
        <button onClick={() => setScanOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <ScanLine size={16} /> Scanner
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="date">Trier par date</option>
          <option value="produit">Trier par produit</option>
          <option value="statut">Trier par statut</option>
        </select>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button onClick={() => setViewMode("list")} title="Vue liste" className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-teal-50 text-teal-700" : "text-slate-400 hover:text-slate-600"}`}><ListIcon size={16} /></button>
          <button onClick={() => setViewMode("cards")} title="Vue cartes" className={`rounded-md p-1.5 ${viewMode === "cards" ? "bg-teal-50 text-teal-700" : "text-slate-400 hover:text-slate-600"}`}><LayoutGrid size={16} /></button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon={ClipboardList} msg="Aucune réservation ne correspond." />
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setDetail(r)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <span className="plex-mono text-[11px] text-slate-400">{r.id}</span>
                <Status s={resStatus(r)} />
              </div>
              <div className="mb-3 text-base font-semibold text-slate-800">{productName(r.product)}</div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-slate-600"><Users size={14} className="text-slate-400" />{patientName(r.patient)}</div>
                <div className="flex items-center gap-2 text-slate-600"><Warehouse size={14} className="text-slate-400" />{whName(r.warehouse)}</div>
                <div className="flex items-center gap-2 text-slate-500"><Calendar size={14} className="text-slate-400" />{fmtFR(r.start)} → {fmtFR(r.end)}</div>
              </dl>
              <div className="mt-3 border-t border-slate-100 pt-3">
                {transportDone(r, store.products) ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"><Check size={12} /> Transport effectué</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"><Truck size={12} /> Transport non effectué</span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Produit</th>
                <th className="px-4 py-3 font-medium">Patient / Client</th>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Période</th>
                <th className="px-4 py-3 font-medium">Transport</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3"><Status s={resStatus(r)} /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{productName(r.product)}</div>
                    <div className="plex-mono text-[11px] text-slate-400">{r.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{patientName(r.patient)}</td>
                  <td className="px-4 py-3 text-slate-500">{whName(r.warehouse)}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtFR(r.start)} → {fmtFR(r.end)}</td>
                  <td className="px-4 py-3">
                    {transportDone(r, store.products) ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"><Check size={12} /> Effectué</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"><Truck size={12} /> Non effectué</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* scan modal */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="Scanner un code-barres">
        <p className="mb-4 text-sm text-slate-500">Simulez un scan : sélectionnez le matériel pour ouvrir sa réservation en cours.</p>
        <div className="grid grid-cols-2 gap-2">
          {store.products.filter((p) => !p.archived).map((p) => (
            <button key={p.id} onClick={() => {
              const res = store.reservations.find((r) => !r.archived && r.product === p.id);
              setScanOpen(false);
              if (res) setDetail(res); else notify(`Aucune réservation en cours pour ${p.name}.`);
            }} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-teal-300 hover:bg-teal-50">
              <ScanLine size={15} className="text-teal-600" />
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-700">{p.name}</span>
                <span className="plex-mono block text-[11px] text-slate-400">{p.id}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* detail */}
      <ResDetail res={detail} onClose={() => setDetail(null)} onEnd={endReservation} onArchive={archiveReservation} store={store} helpers={helpers} />
      {/* end detail */}
    </div>
  );
}

function ResDetail({ res, onClose, onEnd, onArchive, store, helpers }) {
  const [closing, setClosing] = useState(false);
  const [returnWh, setReturnWh] = useState("");
  const [bon, setBon] = useState(false);
  useEffect(() => { setClosing(false); setBon(false); setReturnWh(res?.returnWh || ""); }, [res]);
  if (!res) return null;
  const { productName, patientName, whName } = helpers;
  const prod = store.products.find((p) => p.id === res.product);
  const pat = store.patients.find((p) => p.id === res.patient);
  return (
    <Modal open={!!res} onClose={onClose} title={`Réservation ${res.id}`} wide>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-slate-800">{productName(res.product)}</h4>
            <Status s={resStatus(res)} />
          </div>
          <Row label="Patient / Client" value={patientName(res.patient)} />
          <Row label="Lieu de retrait" value={whName(res.warehouse)} />
          <Row label="Lieu de retour prévu" value={res.returnWh ? whName(res.returnWh) : "Même lieu que le retrait"} />
          <Row label="Période" value={`${fmtFR(res.start)} → ${fmtFR(res.end)}`} />
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Transport</div>
            <div className="mt-1">
              {transportDone(res, store.products) ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"><Check size={12} /> Transport effectué — matériel sur place</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"><Truck size={12} /> Transport non effectué — à acheminer vers {whName(res.warehouse)}</span>
              )}
            </div>
          </div>
          {res.note && <Row label="Note" value={res.note} />}
          {res.pdf && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <FileText size={15} className="text-rose-500" /><span className="plex-mono truncate">{res.pdf}</span>
            </div>
          )}
          <button onClick={() => setBon(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FileText size={15} /> Générer le bon de livraison
          </button>
        </div>

        <div className="rounded-xl bg-slate-50 p-4">
          {!closing ? (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Une réservation en cours n'est pas modifiable. Clôturez-la pour la renvoyer en entrepôt — elle sera archivée et restera consultable.
              </p>
              <button onClick={() => setClosing(true)} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800">
                Fin de réservation
              </button>
              <div className="my-3 border-t border-slate-200" />
              <p className="mb-2 text-xs text-slate-400">Erreur de saisie (mauvaise période, doublon…) ? Archivez la réservation, puis créez-en une nouvelle. Le stock n'est pas modifié.</p>
              <button onClick={() => onArchive(res)} className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Archiver la réservation
              </button>
            </>
          ) : (
            <>
              <Field label="Entrepôt de dépôt au retour">
                <select value={returnWh} onChange={(e) => setReturnWh(e.target.value)} className={inputCls}>
                  <option value="">Sélectionner…</option>
                  {store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setClosing(false)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-white">Annuler</button>
                <button disabled={!returnWh} onClick={() => onEnd(res, returnWh)} className="flex-1 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">
                  Confirmer le retour
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal open={bon} onClose={() => setBon(false)} title="Bon de livraison" wide>
        <div id="bon-livraison" className="rounded-lg border border-slate-200 p-5">
          <div className="mb-4 flex items-start justify-between border-b border-slate-100 pb-4">
            <div>
              <div className="text-lg font-semibold text-slate-800">Bon de livraison</div>
              <div className="plex-mono text-xs text-slate-400">Réf. {res.id}</div>
            </div>
            <div className="text-right text-xs text-slate-400">Émis le {fmtFR(TODAY)}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-xs uppercase tracking-wide text-slate-400">Matériel</div><div className="font-medium text-slate-800">{productName(res.product)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-slate-400">N° de parc</div><div className="plex-mono text-slate-700">{prod?.numParc || "—"} · série {prod?.numSerie || "—"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-slate-400">Livré à</div><div className="font-medium text-slate-800">{patientName(res.patient)}</div><div className="text-slate-500">{pat?.address || "Adresse non renseignée"}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-slate-400">Lieu de retrait</div><div className="text-slate-700">{whName(res.warehouse)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-slate-400">Période de location</div><div className="text-slate-700">{fmtFR(res.start)} → {fmtFR(res.end)}</div></div>
            <div><div className="text-xs uppercase tracking-wide text-slate-400">Retour prévu</div><div className="text-slate-700">{res.returnWh ? whName(res.returnWh) : whName(res.warehouse)}</div></div>
          </div>
          {res.note && <div className="mt-4 border-t border-slate-100 pt-3 text-sm"><span className="text-xs uppercase tracking-wide text-slate-400">Note </span><span className="text-slate-600">{res.note}</span></div>}
          <div className="mt-6 grid grid-cols-2 gap-8 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <div>Signature livreur<div className="mt-8 border-t border-slate-300" /></div>
            <div>Signature client<div className="mt-8 border-t border-slate-300" /></div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"><FileText size={15} /> Imprimer / Enregistrer en PDF</button>
        </div>
      </Modal>
    </Modal>
  );
}
function Row({ label, value }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-700">{value}</div>
    </div>
  );
}

/* ================== Réservations : nouvelle ================== */
function ResNew({ store, setStore, notify, go, etbId }) {
  const [f, setF] = useState({ product: "", patient: "", warehouse: "", returnWh: "", start: "", end: "", note: "", pdf: null });
  const [cal, setCal] = useState({ y: 2026, m: 5 });
  const [qpOpen, setQpOpen] = useState(false);
  const [qp, setQp] = useState({ name: "", address: "" });

  const occupied = useMemo(() => {
    const set = new Set();
    if (!f.product) return set;
    store.reservations.filter((r) => r.product === f.product && !r.archived).forEach((r) => {
      let d = parseISO(r.start); const end = parseISO(r.end);
      while (d <= end) { set.add(toISO(d)); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
    });
    return set;
  }, [f.product, store.reservations]);

  // Blocage des doublons : conflit si le même produit est déjà réservé sur une période qui chevauche
  const conflict = useMemo(() => {
    if (!f.product || !f.start || !f.end || f.start > f.end) return null;
    return store.reservations.find((r) => r.product === f.product && !r.archived && f.start <= r.end && r.start <= f.end) || null;
  }, [f.product, f.start, f.end, store.reservations]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const whName = (id) => store.warehouses.find((w) => w.id === id)?.name || id;
  const valid = f.product && f.patient && f.warehouse && f.start && f.end && f.start <= f.end && !conflict;

  const createQuickPatient = () => {
    const id = newId("PAT");
    setStore((s) => ({ ...s, patients: [{ id, name: qp.name, address: qp.address, etb: etbId, archived: false }, ...s.patients] }));
    set("patient", id);
    setQpOpen(false); setQp({ name: "", address: "" });
    notify("Patient créé et sélectionné.");
  };

  const linkedProducts = useMemo(() => {
    const prod = store.products.find((p) => p.id === f.product);
    return (prod?.linked || []).map((id) => store.products.find((x) => x.id === id)).filter((x) => x && !x.archived);
  }, [f.product, store.products]);

  const submit = () => {
    if (conflict) { notify("Réservation bloquée : le matériel est déjà réservé sur cette période."); return; }
    const mainId = newId("RES");
    const toAdd = [{ ...f, id: mainId, etb: etbId, archived: false }];
    let skipped = 0;
    linkedProducts.forEach((lp) => {
      const c = store.reservations.find((r) => r.product === lp.id && !r.archived && f.start <= r.end && r.start <= f.end);
      if (c) { skipped++; return; }
      toAdd.push({ ...f, product: lp.id, id: newId("RES"), linkedFrom: mainId, etb: etbId, archived: false });
    });
    setStore((s) => ({ ...s, reservations: [...toAdd, ...s.reservations] }));
    const added = toAdd.length - 1;
    notify(added > 0
      ? `Réservation créée avec ${added} matériel(s) associé(s)${skipped ? ` (${skipped} indisponible(s) ignoré(s))` : ""}.`
      : `Réservation ${mainId} créée.`);
    go("res-list");
  };

  return (
    <div>
      <PageTitle title="Nouvelle réservation" sub="Tout est connecté : la réservation alimente l'agenda et le stock." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <Field label="Produit">
            <select value={f.product} onChange={(e) => set("product", e.target.value)} className={inputCls}>
              <option value="">Choisir un matériel…</option>
              {store.products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} — {p.sub}</option>)}
            </select>
          </Field>
          {linkedProducts.length > 0 && (
            <div className="rounded-lg bg-teal-50 px-3 py-2.5 text-xs text-teal-800">
              <div className="mb-1 flex items-center gap-1.5 font-medium"><Link2 size={13} /> Réservés ensemble (même patient, mêmes dates) :</div>
              <ul className="space-y-1">
                <li className="flex items-center gap-2"><span className="font-medium">{store.products.find((p) => p.id === f.product)?.name}</span><span className="text-teal-600">— {whName(store.products.find((p) => p.id === f.product)?.warehouse)}</span></li>
                {linkedProducts.map((lp) => (
                  <li key={lp.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{lp.name}</span>
                    <span className="text-teal-600">— {whName(lp.warehouse)}</span>
                    {f.warehouse && lp.warehouse !== f.warehouse && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"><Truck size={10} /> entrepôt différent — transfert à prévoir</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date de début"><input type="date" value={f.start} onChange={(e) => set("start", e.target.value)} className={inputCls} /></Field>
            <Field label="Date de fin"><input type="date" value={f.end} onChange={(e) => set("end", e.target.value)} className={inputCls} /></Field>
          </div>
          {f.start && f.end && f.start > f.end && <p className="text-xs text-rose-600">La date de fin doit suivre la date de début.</p>}
          {conflict && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">Ce matériel est déjà réservé sur une période qui chevauche ({fmtFR(conflict.start)} → {fmtFR(conflict.end)}). Choisissez une autre période ou un autre matériel.</p>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Patient / Client">
              <div className="flex gap-2">
                <select value={f.patient} onChange={(e) => set("patient", e.target.value)} className={inputCls}>
                  <option value="">Sélectionner…</option>
                  {store.patients.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" onClick={() => setQpOpen(true)} title="Créer un patient" className="shrink-0 rounded-lg border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50"><Plus size={16} /></button>
              </div>
            </Field>
            <Field label="Lieu de retrait">
              <select value={f.warehouse} onChange={(e) => set("warehouse", e.target.value)} className={inputCls}>
                <option value="">Sélectionner…</option>
                {store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Lieu de retour prévu" hint="Modifiable en cours de réservation. Sert à anticiper les transferts.">
            <select value={f.returnWh} onChange={(e) => set("returnWh", e.target.value)} className={inputCls}>
              <option value="">Même lieu que le retrait</option>
              {store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
          <Field label="Note libre">
            <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={3} className={inputCls} placeholder="Informations complémentaires…" />
          </Field>
          <Field label="Document PDF (ex : fiche de mesures)">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-teal-400 hover:bg-teal-50/40">
              <Upload size={16} className="text-slate-400" />
              {f.pdf ? <span className="plex-mono text-slate-700">{f.pdf}</span> : "Importer un PDF"}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => set("pdf", e.target.files?.[0]?.name || null)} />
            </label>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => go("res-list")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
            <button disabled={!valid} onClick={submit} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Créer la réservation</button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">Disponibilité du produit</div>
          {f.product ? (
            <MiniCalendar year={cal.y} month={cal.m} occupied={occupied}
              onPrev={() => setCal((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 })}
              onNext={() => setCal((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 })} />
          ) : (
            <div className="grid h-48 place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
              Sélectionnez un produit
            </div>
          )}
        </div>
      </div>

      <Modal open={qpOpen} onClose={() => setQpOpen(false)} title="Nouveau patient / partenaire">
        <div className="space-y-3">
          <Field label="Nom"><input autoFocus value={qp.name} onChange={(e) => setQp((s) => ({ ...s, name: e.target.value }))} className={inputCls} /></Field>
          <Field label="Adresse (optionnel)"><input value={qp.address} onChange={(e) => setQp((s) => ({ ...s, address: e.target.value }))} className={inputCls} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setQpOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!qp.name.trim()} onClick={createQuickPatient} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Créer et sélectionner</button>
        </div>
      </Modal>
    </div>
  );
}
function ResArchive({ store, setStore, notify, helpers }) {
  const { productName, patientName, whName } = helpers;
  const rows = store.reservations.filter((r) => r.archived);
  const restore = (id) => {
    setStore((s) => ({ ...s, reservations: s.reservations.map((r) => r.id === id ? { ...r, archived: false } : r) }));
    notify("Réservation désarchivée — de nouveau active.");
  };
  return (
    <div>
      <PageTitle title="Réservations archivées" sub="Jamais supprimées — toujours consultables." />
      {rows.length === 0 ? <Empty icon={Archive} msg="Aucune réservation archivée." /> : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>{["Code", "Produit", "Patient", "Période", "Retour", ""].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="plex-mono px-4 py-3 text-slate-400">{r.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{productName(r.product)}</td>
                  <td className="px-4 py-3 text-slate-600">{patientName(r.patient)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtFR(r.start)} → {fmtFR(r.end)}</td>
                  <td className="px-4 py-3 text-slate-500">{r.returnWarehouse ? whName(r.returnWarehouse) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => restore(r.id)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><RotateCcw size={13} /> Désarchiver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================== Agenda ================== */
function Agenda({ store, archived, helpers }) {
  const { productName } = helpers;
  const [cal, setCal] = useState({ y: 2026, m: 5 });
  const [filterProducts, setFilterProducts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("tous");

  const events = store.reservations.filter((r) => r.archived === archived);
  const cells = monthMatrix(cal.y, cal.m);

  const visible = (r) => {
    if (filterProducts.length && !filterProducts.includes(r.product)) return false;
    if (!archived && statusFilter !== "tous" && resStatus(r) !== statusFilter) return false;
    return true;
  };
  const dayEvents = (iso) => events.filter((r) => visible(r) && r.start <= iso && iso <= r.end);
  const COLORS = ["bg-teal-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-sky-500"];
  const colorFor = (pid) => COLORS[store.products.findIndex((p) => p.id === pid) % COLORS.length];

  const toggleProduct = (id) => setFilterProducts((f) => f.includes(id) ? f.filter((x) => x !== id) : [...f, id]);

  return (
    <div>
      <PageTitle title={archived ? "Agenda — archivé / passé" : "Agenda — en cours / à venir"}
        sub="Vue d'ensemble des disponibilités du parc." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter size={15} className="text-slate-400" />
        {store.products.filter((p) => !p.archived).map((p) => (
          <button key={p.id} onClick={() => toggleProduct(p.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${filterProducts.includes(p.id) ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
            <span className={`h-2 w-2 rounded-full ${colorFor(p.id)}`} />{p.name}
          </button>
        ))}
        {filterProducts.length > 0 && (
          <button onClick={() => setFilterProducts([])} className="text-xs text-slate-400 underline hover:text-slate-600">réinitialiser</button>
        )}
        {!archived && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} ml-auto w-auto`}>
            <option value="tous">Tous les statuts</option>
            <option value="en cours">En cours</option>
            <option value="à venir">À venir</option>
            <option value="en retard">En retard</option>
          </select>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setCal((c) => c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><ChevronRight className="rotate-180" size={18} /></button>
          <span className="text-base font-semibold text-slate-700">{MONTHS[cal.m]} {cal.y}</span>
          <button onClick={() => setCal((c) => c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-100">
          {WD.map((w) => <div key={w} className="bg-slate-50 py-2 text-center text-[11px] font-medium uppercase text-slate-400">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="bg-white" />;
            const iso = toISO(d);
            const evs = dayEvents(iso);
            const isToday = iso === TODAY;
            return (
              <div key={i} className="min-h-[84px] bg-white p-1.5">
                <div className={`mb-1 text-xs ${isToday ? "inline-grid h-5 w-5 place-items-center rounded-full bg-teal-700 font-semibold text-white" : "text-slate-400"}`}>{d.getDate()}</div>
                <div className="space-y-1">
                  {evs.slice(0, 2).map((r) => (
                    <div key={r.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${colorFor(r.product)}`}>
                      {productName(r.product)}
                    </div>
                  ))}
                  {evs.length > 2 && <div className="text-[10px] text-slate-400">+{evs.length - 2}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================== Ajout de tiers : matériel ================== */
function TiersMateriel({ notify }) {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [etbId, setEtbId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [codeFor, setCodeFor] = useState(null);
  const emptyForm = { name: "", numParc: "", numSerie: "", prix: "", category: "Fauteuil roulant", sub: "", parts: "", linked: [], warehouse: "", photo: null, pdf: null };
  const [f, setF] = useState(emptyForm);
  const whName = (id) => warehouses.find((w) => w.id === id)?.name || "—";

  // Charge les matériels + entrepôts depuis la base de données.
  const reload = async () => {
    setLoading(true);
    try {
      const [prods, whs, eid] = await Promise.all([
        db.listProduits(), db.listEntrepots(), db.getEtablissementId(),
      ]);
      setProducts(prods); setWarehouses(whs); setEtbId(eid);
    } catch (e) {
      notify("Erreur de connexion à la base : " + e.message);
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const SUBS = {
    "Fauteuil roulant": ["Manuel 4 roues", "Manuel 6 roues", "Électrique", "Confort / coquille", "Pédiatrique"],
    "Lit médicalisé": ["Standard 1 fonction", "Hauteur variable", "Électrique 3 fonctions", "Bariatrique", "Pédiatrique"],
    "Aide à la marche": ["Déambulateur", "Rollator", "Cannes", "Béquilles", "Verticalisateur"],
    "Aide au transfert": ["Lève-personne mobile", "Lève-personne sur rail", "Disque de transfert", "Planche de transfert"],
    "Prévention anti-escarres": ["Matelas à air", "Matelas mousse", "Surmatelas", "Coussin de positionnement"],
    "Assistance respiratoire": ["Concentrateur d'oxygène", "Bouteille O₂", "Aspirateur de mucosités", "PPC / CPAP", "Nébuliseur"],
    "Hygiène & toilette": ["Chaise percée", "Chaise de douche", "Rehausseur WC", "Siège de bain", "Barre d'appui"],
    "Nutrition & perfusion": ["Pompe à nutrition", "Pompe à perfusion", "Pied à perfusion"],
    "Mobilité électrique": ["Scooter", "Tricycle adapté", "Poussette adaptée"],
    "Matériel de soin": ["Tensiomètre", "Pèse-personne", "Table de soins", "Adaptable de lit"],
  };
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const openNew = () => { setEditing(null); setF(emptyForm); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setF({ name: p.name, numParc: p.numParc || "", numSerie: p.numSerie || "", prix: p.prix || "",
      category: p.category, sub: p.sub || "", parts: (p.parts || []).join(", "), linked: p.linked || [],
      warehouse: p.warehouse, photo: p.photo || null, pdf: p.pdf || null });
    setOpen(true);
  };

  const submit = async () => {
    const fields = {
      name: f.name, numParc: f.numParc, numSerie: f.numSerie, prix: f.prix,
      category: f.category, sub: f.sub || (SUBS[f.category]?.[0] ?? ""),
      parts: f.parts.split(",").map((x) => x.trim()).filter(Boolean), linked: f.linked, warehouse: f.warehouse, photo: f.photo, pdf: f.pdf,
    };
    try {
      if (editing) {
        await db.updateProduit(editing.id, fields, etbId);
        notify("Matériel modifié et enregistré.");
      } else {
        await db.createProduit(fields, etbId);
        notify("Matériel ajouté et enregistré.");
      }
      await reload();
    } catch (e) {
      notify("Erreur d'enregistrement : " + e.message);
      return;
    }
    setOpen(false); setF(emptyForm);
  };
  const archive = async (id) => {
    try {
      await db.setProduitArchived(id, true);
      notify("Matériel archivé.");
      await reload();
    } catch (e) {
      notify("Erreur : " + e.message);
    }
  };

  return (
    <div>
      <PageTitle title="Fauteuils / Matériels" sub={loading ? "Chargement depuis la base…" : `${products.filter((p) => !p.archived).length} produit(s) au parc`}
        action={<button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"><Plus size={16} /> Ajouter un matériel</button>} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.filter((p) => !p.archived).map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
                  {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" /> : <Package size={20} />}
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.category} · {p.sub}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(p)} title="Modifier ce matériel" className="rounded-md p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={15} /></button>
                <button onClick={() => archive(p.id)} title="Archiver ce matériel" className="rounded-md p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"><Archive size={15} /></button>
              </div>
            </div>
            <dl className="mb-3 space-y-1 text-xs text-slate-500">
              {p.numParc && <div className="flex justify-between"><dt className="text-slate-400">N° de parc</dt><dd className="plex-mono text-slate-600">{p.numParc}</dd></div>}
              {p.numSerie && <div className="flex justify-between"><dt className="text-slate-400">N° de série</dt><dd className="plex-mono text-slate-600">{p.numSerie}</dd></div>}
              {p.prix && <div className="flex justify-between"><dt className="text-slate-400">Prix d'achat</dt><dd className="text-slate-600">{p.prix} €</dd></div>}
              {p.pdf && <div className="flex items-center gap-1.5 text-slate-500"><FileText size={12} className="text-rose-500" /><span className="plex-mono truncate">{p.pdf}</span></div>}
            </dl>
            <div className="mb-3 flex flex-wrap gap-1">
              {p.parts.map((part) => <span key={part} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{part}</span>)}
            </div>
            {p.linked && p.linked.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                <Link2 size={11} className="text-teal-600" /> Associé à&nbsp;:
                {p.linked.map((lid) => { const lp = products.find((x) => x.id === lid); return <span key={lid} className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-700">{lp ? lp.name : lid}</span>; })}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin size={13} className="text-slate-400" />{whName(p.warehouse)}</span>
              <button onClick={() => setCodeFor(p)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50">
                <QrCode size={14} /> Code
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* add modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier le matériel" : "Ajouter un matériel"} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Photo">
            <label className="flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-teal-400">
              {f.photo ? <img src={f.photo} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center text-xs"><Upload size={18} /> Importer</span>}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) set("photo", URL.createObjectURL(file)); }} />
            </label>
          </Field>
          <div className="space-y-3">
            <Field label="Nom"><input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="Ex : Fauteuil roulant Invacare" /></Field>
            <Field label="Entrepôt de stockage">
              <select value={f.warehouse} onChange={(e) => set("warehouse", e.target.value)} className={inputCls}>
                <option value="">Sélectionner…</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Numéro de parc"><input value={f.numParc} onChange={(e) => set("numParc", e.target.value)} className={`${inputCls} plex-mono`} placeholder="ex : P-0428" /></Field>
          <Field label="Numéro de série"><input value={f.numSerie} onChange={(e) => set("numSerie", e.target.value)} className={`${inputCls} plex-mono`} placeholder="ex : SN-99A21" /></Field>
          <Field label="Catégorie">
            <select value={f.category} onChange={(e) => set("category", e.target.value) || set("sub", "")} className={inputCls}>
              {Object.keys(SUBS).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Sous-catégorie">
            <select value={f.sub} onChange={(e) => set("sub", e.target.value)} className={inputCls}>
              <option value="">Par défaut</option>
              {(SUBS[f.category] || []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Prix d'achat (€)" hint="Pour les statistiques patrimoniales">
            <input type="number" value={f.prix} onChange={(e) => set("prix", e.target.value)} className={inputCls} placeholder="ex : 1250" />
          </Field>
          <Field label="Document PDF (facture, notice…)">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-teal-400 hover:bg-teal-50/40">
              <Upload size={15} className="text-slate-400" />
              {f.pdf ? <span className="plex-mono truncate text-slate-700">{f.pdf}</span> : "Importer un PDF"}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => set("pdf", e.target.files?.[0]?.name || null)} />
            </label>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Parties médicales associées" hint="Séparées par des virgules">
              <input value={f.parts} onChange={(e) => set("parts", e.target.value)} className={inputCls} placeholder="Accoudoirs, Repose-pieds…" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Matériels associés (réservés ensemble)" hint="Sélectionnez d'autres matériels du parc : réserver celui-ci les réservera aussi automatiquement.">
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {products.filter((p) => !p.archived && p.id !== editing?.id).length === 0 && <div className="px-1 py-2 text-xs text-slate-400">Aucun autre matériel dans le parc pour l'instant.</div>}
                {products.filter((p) => !p.archived && p.id !== editing?.id).map((p) => {
                  const on = f.linked.includes(p.id);
                  return (
                    <button type="button" key={p.id} onClick={() => set("linked", on ? f.linked.filter((x) => x !== p.id) : [...f.linked, p.id])} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                      <span className={`grid h-4 w-4 place-items-center rounded border ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{on && <Check size={12} />}</span>
                      <span className="flex-1">{p.name}</span>
                      <span className="plex-mono text-[11px] text-slate-400">{p.numParc || p.id}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!f.name || !f.warehouse} onClick={submit} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">{editing ? "Enregistrer" : "Ajouter (génère le code)"}</button>
        </div>
      </Modal>

      {/* code modal */}
      <Modal open={!!codeFor} onClose={() => setCodeFor(null)} title="Code produit — imprimable">
        {codeFor && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="font-semibold text-slate-800">{codeFor.name}</div>
            <div className="flex items-center gap-6 rounded-xl border border-slate-200 p-5">
              <QrFake code={codeFor.id} />
              <div className="w-40">
                <Barcode code={codeFor.id} />
                <div className="plex-mono mt-1 text-xs tracking-widest text-slate-600">{codeFor.id}</div>
              </div>
            </div>
            <p className="text-xs text-slate-400">Le scan de ce code redirige vers la fiche produit et sa réservation en cours.</p>
            <button onClick={() => window.print()} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">Imprimer</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================== Ajout de tiers : patients / lieux ================== */
function TiersSimple({ notify, kind }) {
  const CFG = {
    patients:    { title: "Patients / Clients", unit: "patient(s)", prefix: "PAT", icon: Users, add: "Ajouter un patient / client" },
    warehouses:  { title: "Lieux de stockage", unit: "entrepôt(s)", prefix: "LIE", icon: Building2, add: "Ajouter un lieu de stockage" },
    partenaires: { title: "Partenaires", unit: "partenaire(s)", prefix: "PAR", icon: Building2, add: "Ajouter un partenaire" },
  }[kind];
  const isPatients = kind === "patients";
  const [list, setList] = useState([]);
  const [partners, setPartners] = useState([]);
  const [etbId, setEtbId] = useState(null);
  const [loading, setLoading] = useState(true);
  const partnerName = (id) => partners.find((p) => p.id === id)?.name;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState({ name: "", address: "", partenaire: "" });

  // Charge la liste (et les partenaires, pour le menu déroulant des patients) depuis la base.
  const reload = async () => {
    setLoading(true);
    try {
      const [items, eid] = await Promise.all([db.listTiers(kind), db.getEtablissementId()]);
      setList(items); setEtbId(eid);
      if (isPatients) setPartners(await db.listTiers("partenaires"));
    } catch (e) {
      notify("Erreur de connexion à la base : " + e.message);
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, [kind]);

  const openNew = () => { setEditing(null); setF({ name: "", address: "", partenaire: "" }); setOpen(true); };
  const openEdit = (x) => { setEditing(x); setF({ name: x.name, address: x.address || "", partenaire: x.partenaire || "" }); setOpen(true); };
  const submit = async () => {
    try {
      if (editing) {
        await db.updateTiers(kind, editing.id, f);
        notify("Modifié et enregistré.");
      } else {
        await db.createTiers(kind, f, etbId);
        notify("Ajouté et enregistré.");
      }
      await reload();
    } catch (e) {
      notify("Erreur d'enregistrement : " + e.message);
      return;
    }
    setOpen(false); setF({ name: "", address: "", partenaire: "" });
  };
  const archive = async (id) => {
    try {
      await db.archiveTiers(kind, id);
      await reload();
    } catch (e) {
      notify("Erreur : " + e.message);
    }
  };
  const Icon = CFG.icon;

  return (
    <div>
      <PageTitle title={CFG.title} sub={loading ? "Chargement depuis la base…" : `${list.length} ${CFG.unit}`}
        action={<button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"><Plus size={16} /> Ajouter</button>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((x) => (
          <div key={x.id} className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400"><Icon size={16} /></div>
              <div>
                <div className="font-medium text-slate-800">{x.name}</div>
                <div className="text-xs text-slate-400">{x.address || "Adresse non renseignée"}</div>
                {isPatients && x.partenaire && partnerName(x.partenaire) && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700"><Building2 size={10} /> {partnerName(x.partenaire)}</div>
                )}
                <div className="plex-mono mt-1 text-[11px] text-slate-300">{x.id}</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(x)} title="Modifier" className="rounded-md p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"><Pencil size={15} /></button>
              <button onClick={() => archive(x.id)} title="Archiver" className="rounded-md p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500"><Archive size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier" : CFG.add}>
        <div className="space-y-3">
          <Field label="Nom"><input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} className={inputCls} /></Field>
          <Field label={`Adresse${isPatients ? " (optionnel)" : ""}`}><input value={f.address} onChange={(e) => setF((s) => ({ ...s, address: e.target.value }))} className={inputCls} /></Field>
          {isPatients && (
            <Field label="Partenaire associé (optionnel)" hint="Rattacher ce patient à un partenaire (pharmacie, réseau…).">
              <select value={f.partenaire} onChange={(e) => setF((s) => ({ ...s, partenaire: e.target.value }))} className={inputCls}>
                <option value="">Aucun</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!f.name} onClick={submit} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">{editing ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </Modal>
    </div>
  );
}

function TiersArchive({ store, setStore, notify }) {
  const restore = (kind, id) => {
    setStore((s) => ({ ...s, [kind]: s[kind].map((x) => x.id === id ? { ...x, archived: false } : x) }));
    notify("Élément désarchivé.");
  };
  const groups = [
    { label: "Matériels retirés", items: store.products.filter((p) => p.archived), icon: Package, kind: "products" },
    { label: "Anciens patients", items: store.patients.filter((p) => p.archived), icon: Users, kind: "patients" },
    { label: "Anciens partenaires", items: (store.partenaires || []).filter((p) => p.archived), icon: Building2, kind: "partenaires" },
    { label: "Anciens lieux", items: store.warehouses.filter((w) => w.archived), icon: Building2, kind: "warehouses" },
  ];
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  return (
    <div>
      <PageTitle title="Tiers archivés" sub="Historique des éléments retirés ou désactivés." />
      {total === 0 ? <Empty icon={Archive} msg="Aucun tiers archivé." /> : (
        <div className="space-y-6">
          {groups.filter((g) => g.items.length).map((g) => {
            const Icon = g.icon;
            return (
              <div key={g.label}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600"><Icon size={15} className="text-slate-400" />{g.label}</div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {g.items.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0">
                      <span className="text-slate-700">{x.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="plex-mono text-xs text-slate-300">{x.id}</span>
                        <button onClick={() => restore(g.kind, x.id)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><RotateCcw size={13} /> Désarchiver</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================== Inventaire ================== */
function Inventaire({ store, setStore, notify, helpers }) {
  const { whName } = helpers;
  const [whFilter, setWhFilter] = useState("");
  const [correct, setCorrect] = useState(null);
  const [newWh, setNewWh] = useState("");

  const warehouses = store.warehouses.filter((w) => !w.archived);
  const products = store.products.filter((p) => !p.archived);
  const isOut = (pid) => store.reservations.some((r) => r.product === pid && !r.archived && r.start <= TODAY && TODAY <= r.end);

  const doCorrect = () => {
    setStore((s) => ({ ...s, products: s.products.map((p) => p.id === correct.id ? { ...p, warehouse: newWh } : p) }));
    notify(`Emplacement de ${correct.name} corrigé.`);
    setCorrect(null); setNewWh("");
  };

  const shown = whFilter ? warehouses.filter((w) => w.id === whFilter) : warehouses;

  return (
    <div>
      <PageTitle title="Inventaire — stock par entrepôt" sub="Chaque matériel est suivi individuellement (numéro unique), sans notion de quantité globale." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter size={15} className="text-slate-400" />
        <span className="text-sm text-slate-500">Entrepôt :</span>
        <select value={whFilter} onChange={(e) => setWhFilter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Tous</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div className="space-y-6">
        {shown.map((wh) => {
          const items = products.filter((p) => p.warehouse === wh.id);
          return (
            <div key={wh.id}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Warehouse size={16} className="text-slate-400" />{wh.name}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{items.length} matériel(s)</span>
                </div>
                <span className="text-xs text-slate-400">{wh.address}</span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">Aucun matériel dans cet entrepôt.</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Matériel</th>
                        <th className="px-4 py-2.5 font-medium">N° de parc</th>
                        <th className="px-4 py-2.5 font-medium">Catégorie</th>
                        <th className="px-4 py-2.5 font-medium">Statut</th>
                        <th className="px-4 py-2.5 font-medium text-right">Emplacement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{p.name}</td>
                          <td className="plex-mono px-4 py-2.5 text-slate-500">{p.numParc || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{p.category}</td>
                          <td className="px-4 py-2.5">
                            {isOut(p.id)
                              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20">En location</span>
                              : <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">En stock</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => { setCorrect(p); setNewWh(""); }} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><Pencil size={12} /> Corriger</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!correct} onClose={() => setCorrect(null)} title="Correction manuelle d'emplacement">
        {correct && (
          <>
            <p className="mb-3 text-sm text-slate-500">Réaffecter <span className="font-medium text-slate-700">{correct.name}</span> à un autre entrepôt (en cas d'erreur de stock). Emplacement actuel : {whName(correct.warehouse)}.</p>
            <Field label="Nouvel emplacement">
              <select value={newWh} onChange={(e) => setNewWh(e.target.value)} className={inputCls}>
                <option value="">Sélectionner…</option>
                {warehouses.filter((w) => w.id !== correct.warehouse).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCorrect(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
              <button disabled={!newWh} onClick={doCorrect} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Corriger l'emplacement</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/* ================== Maintenance : réparations & révisions ================== */
function Maintenance({ store, setStore, notify, mode }) {
  const products = store.products.filter((p) => !p.archived);
  const usageCount = (pid) => store.reservations.filter((r) => r.product === pid).length;
  const monthsBetween = (isoA, isoB) => { const a = parseISO(isoA), b = parseISO(isoB); return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); };
  const revisionDue = (p) => {
    if (!p.revision) return false;
    if (p.revision.mode === "temps") return monthsBetween(p.revision.lastDate || TODAY, TODAY) >= p.revision.every;
    return usageCount(p.id) - (p.revision.lastCount || 0) >= p.revision.every;
  };
  const revisionLabel = (p) => {
    if (!p.revision) return "—";
    if (p.revision.mode === "temps") {
      const done = monthsBetween(p.revision.lastDate || TODAY, TODAY);
      return `Tous les ${p.revision.every} mois · ${done}/${p.revision.every} écoulés`;
    }
    const used = usageCount(p.id) - (p.revision.lastCount || 0);
    return `Toutes les ${p.revision.every} locations · ${used}/${p.revision.every}`;
  };

  const [planFor, setPlanFor] = useState(null);
  const [pf, setPf] = useState({ mode: "temps", every: 6 });

  const toggleRepair = (p) => {
    setStore((s) => ({ ...s, products: s.products.map((x) => x.id === p.id ? { ...x, maintStatus: x.maintStatus === "reparation" ? "ok" : "reparation" } : x) }));
    notify(p.maintStatus === "reparation" ? "Matériel remis en service." : "Matériel mis en réparation.");
  };
  const openPlan = (p) => { setPlanFor(p); setPf(p.revision ? { mode: p.revision.mode, every: p.revision.every } : { mode: "temps", every: 6 }); };
  const savePlan = () => {
    const rev = pf.mode === "temps" ? { mode: "temps", every: Number(pf.every), lastDate: TODAY } : { mode: "usages", every: Number(pf.every), lastCount: usageCount(planFor.id) };
    setStore((s) => ({ ...s, products: s.products.map((x) => x.id === planFor.id ? { ...x, revision: rev } : x) }));
    notify("Révision planifiée."); setPlanFor(null);
  };
  const markRevised = (p) => {
    const rev = p.revision.mode === "temps" ? { ...p.revision, lastDate: TODAY } : { ...p.revision, lastCount: usageCount(p.id) };
    setStore((s) => ({ ...s, products: s.products.map((x) => x.id === p.id ? { ...x, revision: rev } : x) }));
    notify("Révision enregistrée — compteur remis à zéro.");
  };

  const alerts = products.filter((p) => p.maintStatus === "reparation" || revisionDue(p));
  const rows = mode === "revisions" ? alerts : products;

  return (
    <div>
      <PageTitle
        title={mode === "revisions" ? "À réviser / réparer" : "Maintenance — état du parc"}
        sub={mode === "revisions" ? `${alerts.length} matériel(s) nécessitant une intervention` : "Réparations et révisions préventives du parc."}
        action={mode === "revisions" && alerts.length > 0 && (
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"><FileText size={16} /> Exporter / Imprimer (PDF)</button>
        )} />

      {mode === "revisions" && alerts.length === 0 ? (
        <Empty icon={Check} msg="Aucun matériel à réviser ou réparer. Tout est à jour." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Matériel</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3 font-medium">Révision préventive</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const due = revisionDue(p);
                const inRepair = p.maintStatus === "reparation";
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{p.name}</div>
                      <div className="plex-mono text-[11px] text-slate-400">{p.numParc || p.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      {inRepair
                        ? <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20"><Wrench size={12} /> En réparation</span>
                        : <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20"><Check size={12} /> En service</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">{revisionLabel(p)}</span>
                        {due && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20"><AlertTriangle size={11} /> À réviser</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button onClick={() => toggleRepair(p)} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">{inRepair ? "Remettre en service" : "Mettre en réparation"}</button>
                        <button onClick={() => openPlan(p)} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">{p.revision ? "Modifier révision" : "Planifier révision"}</button>
                        {p.revision && <button onClick={() => markRevised(p)} className="rounded-md bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100">Marquer révisé</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!planFor} onClose={() => setPlanFor(null)} title="Planifier une révision préventive">
        {planFor && (
          <>
            <p className="mb-3 text-sm text-slate-500">{planFor.name}</p>
            <div className="space-y-3">
              <Field label="Fréquence basée sur">
                <select value={pf.mode} onChange={(e) => setPf((s) => ({ ...s, mode: e.target.value }))} className={inputCls}>
                  <option value="temps">Le temps (mois)</option>
                  <option value="usages">Le nombre de locations</option>
                </select>
              </Field>
              <Field label={pf.mode === "temps" ? "Tous les … mois" : "Toutes les … locations"}>
                <input type="number" min="1" value={pf.every} onChange={(e) => setPf((s) => ({ ...s, every: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPlanFor(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
              <button disabled={!pf.every || Number(pf.every) < 1} onClick={savePlan} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Enregistrer</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/* ================== Vue magasinier (logistique consolidée) ================== */
function Magasinier({ store, helpers }) {
  const { productName, patientName, whName } = helpers;
  const parc = (pid) => store.products.find((p) => p.id === pid)?.numParc || "—";
  const [typeFilter, setTypeFilter] = useState("");
  const [whFilter, setWhFilter] = useState("");

  const moves = [];
  store.transfers.filter((t) => !t.archived).forEach((t) =>
    moves.push({ type: "Transfert", product: t.product, fromWh: t.from, from: whName(t.from), to: whName(t.to), date: t.date }));
  store.reservations.filter((r) => !r.archived).forEach((r) => {
    moves.push({ type: "Livraison", product: r.product, fromWh: r.warehouse, from: whName(r.warehouse), to: patientName(r.patient), date: r.start });
    moves.push({ type: "Retour", product: r.product, fromWh: null, from: patientName(r.patient), to: whName(r.returnWh || r.warehouse), date: r.end });
  });
  let list = moves.sort((a, b) => a.date.localeCompare(b.date));
  if (typeFilter) list = list.filter((m) => m.type === typeFilter);
  if (whFilter) list = list.filter((m) => m.fromWh === whFilter);

  const TYPE = {
    Transfert: "bg-violet-50 text-violet-700 ring-violet-600/20",
    Livraison: "bg-sky-50 text-sky-700 ring-sky-600/20",
    Retour: "bg-amber-50 text-amber-700 ring-amber-600/20",
  };

  return (
    <div>
      <PageTitle title="Vue magasinier" sub="Tous les mouvements de matériel à préparer : transferts entre entrepôts, livraisons chez les clients, retours." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter size={15} className="text-slate-400" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Tous les types</option>
          <option value="Transfert">Transferts</option>
          <option value="Livraison">Livraisons</option>
          <option value="Retour">Retours</option>
        </select>
        <select value={whFilter} onChange={(e) => setWhFilter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Tout entrepôt de départ</option>
          {store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <Empty icon={Truck} msg="Aucun mouvement à préparer." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">N° parc</th>
                <th className="px-4 py-3 font-medium">Matériel</th>
                <th className="px-4 py-3 font-medium">De → à</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((m, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtFR(m.date)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TYPE[m.type]}`}>{m.type}</span></td>
                  <td className="plex-mono px-4 py-3 text-slate-500">{parc(m.product)}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{productName(m.product)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs">{m.from}</span>
                      <ArrowRight size={13} className="text-slate-400" />
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs text-teal-800">{m.to}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================== Statistiques ================== */
function Stats({ store, helpers }) {
  const { productName } = helpers;
  const products = store.products.filter((p) => !p.archived);
  const usage = (pid) => store.reservations.filter((r) => r.product === pid).length;
  const eur = (n) => `${(n || 0).toLocaleString("fr-FR")} €`;

  const totalValue = products.reduce((a, p) => a + (Number(p.prix) || 0), 0);
  const outNow = products.filter((p) => store.reservations.some((r) => r.product === p.id && !r.archived && r.start <= TODAY && TODAY <= r.end)).length;
  const resTotal = store.reservations.length;
  const ranked = products.map((p) => ({ p, u: usage(p.id) })).sort((a, b) => b.u - a.u);
  const maxU = Math.max(1, ...ranked.map((r) => r.u));
  const byCat = {};
  products.forEach((p) => { byCat[p.category] = (byCat[p.category] || 0) + (Number(p.prix) || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const KPI = ({ label, value, sub }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );

  return (
    <div>
      <PageTitle title="Statistiques — vue d'ensemble" sub="Aide au pilotage et au renouvellement du parc." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Matériels au parc" value={products.length} />
        <KPI label="Valeur du parc" value={eur(totalValue)} sub="Somme des prix d'achat" />
        <KPI label="Réservations (total)" value={resTotal} />
        <KPI label="En location aujourd'hui" value={`${outNow} / ${products.length}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Matériels les plus sollicités</h3>
          <div className="space-y-3">
            {ranked.slice(0, 6).map(({ p, u }) => (
              <div key={p.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{p.name}</span>
                  <span className="plex-mono text-xs text-slate-400">{u} résa.</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${(u / maxU) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800">Valeur du parc par catégorie</h3>
          <div className="space-y-2 text-sm">
            {cats.map(([c, v]) => (
              <div key={c} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0">
                <span className="text-slate-600">{c}</span>
                <span className="font-medium text-slate-800">{eur(v)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Aide au renouvellement</h3>
        <p className="mb-4 text-xs text-slate-400">Les matériels les plus sollicités (usure la plus rapide) sont les premiers candidats au renouvellement.</p>
        <div className="overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-4 py-2.5 font-medium">Matériel</th><th className="px-4 py-2.5 font-medium">Locations</th><th className="px-4 py-2.5 font-medium">Prix d'achat</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranked.slice(0, 5).map(({ p, u }) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{p.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{u}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.prix ? eur(Number(p.prix)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================== Gestion des accès (côté entreprise) ================== */
function GestionAcces({ store, setStore, notify, etbId }) {
  const accesses = store.accesses.filter((a) => a.establishmentId === etbId && !a.archived);
  const genCode = (name, fb) => (name.split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 3).toUpperCase() || fb) + "-" + Math.floor(1000 + Math.random() * 8999);
  const blank = { label: "", identifiant: "", mode: "full", sections: SECTIONS.map((s) => s.id), singleDevice: true };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [af, setAf] = useState(blank);
  const openNew = () => { setEditing(null); setAf(blank); setOpen(true); };
  const openEdit = (a) => { setEditing(a); setAf({ label: a.label, identifiant: a.identifiant, mode: a.sections.length === SECTIONS.length ? "full" : "custom", sections: a.sections, singleDevice: a.singleDevice }); setOpen(true); };
  const save = () => {
    const sections = af.mode === "full" ? SECTIONS.map((s) => s.id) : af.sections;
    const ident = af.identifiant.trim().toLowerCase();
    if (editing) {
      setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === editing.id ? { ...a, label: af.label, identifiant: ident, sections, singleDevice: af.singleDevice } : a) }));
      notify("Accès modifié.");
    } else {
      const code = genCode(af.label, "ACC");
      setStore((s) => ({ ...s, accesses: [{ id: newId("ACC"), establishmentId: etbId, label: af.label, identifiant: ident, code, sections, singleDevice: af.singleDevice, activeDevice: null, archived: false }, ...s.accesses] }));
      notify(`Accès créé — code ${code}.`);
    }
    setOpen(false);
  };
  const archive = (id) => { setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === id ? { ...a, archived: true } : a) })); notify("Accès archivé."); };
  const release = (id) => { setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === id ? { ...a, activeDevice: null } : a) })); notify("Appareil libéré."); };

  return (
    <div>
      <PageTitle title="Accès de l'établissement" sub="Gérez vous-même les droits des accès de votre structure."
        action={<button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"><Plus size={16} /> Créer un accès</button>} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {accesses.map((a) => (
          <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500"><KeyRound size={16} /></div>
                <div>
                  <div className="font-medium text-slate-800">{a.label}</div>
                  <div className="plex-mono text-xs text-slate-400">{a.identifiant} · {a.code}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(a)} title="Modifier les droits" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15} /></button>
                <button onClick={() => archive(a.id)} title="Archiver" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Archive size={15} /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
              {a.sections.length === SECTIONS.length ? (
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-600/20">Accès complet</span>
              ) : SECTIONS.map((s) => (
                <span key={s.id} className={`rounded-full px-2 py-0.5 text-[11px] ${a.sections.includes(s.id) ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/20" : "bg-slate-50 text-slate-300 line-through"}`}>{s.label}</span>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              {a.singleDevice
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20"><Smartphone size={12} /> 1 seul appareil</span>
                : <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-400 ring-1 ring-inset ring-slate-300/40"><Smartphone size={12} /> Multi-appareils</span>}
              {a.singleDevice && a.activeDevice && (
                <span className="inline-flex items-center gap-2 text-xs text-slate-500"><span className="plex-mono text-slate-700">{a.activeDevice}</span><button onClick={() => release(a.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"><Unlock size={12} /> Libérer</button></span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Modifier l'accès" : "Créer un accès"}>
        <div className="space-y-4">
          <Field label="Nom de l'accès"><input value={af.label} onChange={(e) => setAf((s) => ({ ...s, label: e.target.value }))} className={inputCls} placeholder="Ex : Accueil" /></Field>
          <Field label="Identifiant de connexion" hint={editing ? `Code : ${editing.code} (généré)` : "Le code sera généré automatiquement."}>
            <input value={af.identifiant} onChange={(e) => setAf((s) => ({ ...s, identifiant: e.target.value }))} className={`${inputCls} plex-mono`} placeholder="ex : accueil" />
          </Field>
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Droits d'accès</span>
            <div className="grid grid-cols-2 gap-2">
              {[["full", "Accès complet"], ["custom", "Accès personnalisé"]].map(([v, l]) => (
                <button key={v} onClick={() => setAf((s) => ({ ...s, mode: v }))} className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${af.mode === v ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
              ))}
            </div>
          </div>
          {af.mode === "custom" && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-50 p-3">
              {SECTIONS.map((s) => {
                const on = af.sections.includes(s.id);
                return (
                  <button key={s.id} onClick={() => setAf((st) => ({ ...st, sections: on ? st.sections.filter((x) => x !== s.id) : [...st.sections, s.id] }))} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-white">
                    <span className={`grid h-4 w-4 place-items-center rounded border ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{on && <Check size={12} />}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={() => setAf((s) => ({ ...s, singleDevice: !s.singleDevice }))} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50">
            <span className="flex items-center gap-2.5"><Smartphone size={16} className="text-slate-400" /><span className="text-sm font-medium text-slate-700">Limiter à un seul appareil</span></span>
            <span className={`flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition ${af.singleDevice ? "justify-end bg-teal-600" : "justify-start bg-slate-300"}`}><span className="h-4 w-4 rounded-full bg-white" /></span>
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!af.label.trim() || !af.identifiant.trim() || (af.mode === "custom" && af.sections.length === 0)} onClick={save} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">{editing ? "Enregistrer" : "Créer l'accès"}</button>
        </div>
      </Modal>
    </div>
  );
}

/* ================== Transport ================== */
function Transport({ store, setStore, notify, archived, helpers, etbId }) {
  const { productName, whName } = helpers;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ product: "", from: "", to: "", date: "" });
  const [fromFilter, setFromFilter] = useState("");

  const submit = () => {
    const id = newId("TRF");
    setStore((s) => ({ ...s, transfers: [{ id, ...f, etb: etbId, archived: false }, ...s.transfers] }));
    notify(`Transfert ${id} planifié.`);
    setOpen(false); setF({ product: "", from: "", to: "", date: "" });
  };
  const complete = (t) => {
    setStore((s) => ({
      ...s,
      transfers: s.transfers.map((x) => x.id === t.id ? { ...x, archived: true } : x),
      products: s.products.map((p) => p.id === t.product ? { ...p, warehouse: t.to } : p),
    }));
    notify("Transfert effectué — stock mis à jour.");
  };
  const restore = (t) => {
    setStore((s) => ({ ...s, transfers: s.transfers.map((x) => x.id === t.id ? { ...x, archived: false } : x) }));
    notify("Transfert désarchivé — de nouveau planifié.");
  };

  // One suggestion per product: only the NEXT reservation in time that needs a move.
  // Later reservations stay hidden until the current one is dealt with / ends.
  const suggestions = useMemo(() => {
    if (archived) return [];
    const earliestByProduct = {};
    store.reservations.filter((r) => !r.archived).forEach((r) => {
      const cur = earliestByProduct[r.product];
      if (!cur || r.start < cur.start) earliestByProduct[r.product] = r;
    });
    const out = [];
    Object.values(earliestByProduct).forEach((r) => {
      const prod = store.products.find((p) => p.id === r.product);
      if (!prod || prod.archived) return;
      if (prod.warehouse === r.warehouse) return;
      const already = store.transfers.find((t) => !t.archived && t.product === r.product && t.to === r.warehouse);
      if (already) return;
      out.push({ product: r.product, from: prod.warehouse, to: r.warehouse, before: r.start });
    });
    return out.sort((a, b) => a.before.localeCompare(b.before));
  }, [archived, store.reservations, store.products, store.transfers]);

  const planSuggested = (sug) => {
    const id = newId("TRF");
    setStore((s) => ({ ...s, transfers: [{ id, product: sug.product, from: sug.from, to: sug.to, date: dayBefore(sug.before), etb: etbId, archived: false }, ...s.transfers] }));
    notify(`Transfert ${id} planifié pour le ${fmtFR(dayBefore(sug.before))}.`);
  };

  const visibleSuggestions = fromFilter ? suggestions.filter((s) => s.from === fromFilter) : suggestions;
  const rows = store.transfers.filter((t) => t.archived === archived && (!fromFilter || t.from === fromFilter));

  return (
    <div>
      <PageTitle title={archived ? "Transferts terminés" : "Transferts en cours / à venir"}
        sub="Déplacements de matériel entre entrepôts — connecté au stock et à l'agenda."
        action={!archived && <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"><Plus size={16} /> Planifier un transfert</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter size={15} className="text-slate-400" />
        <span className="text-sm text-slate-500">Entrepôt de départ :</span>
        <select value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Tous</option>
          {store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        {fromFilter && <button onClick={() => setFromFilter("")} className="text-xs text-slate-400 underline hover:text-slate-600">réinitialiser</button>}
      </div>

      {!archived && visibleSuggestions.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800"><Truck size={15} /> Transferts à prévoir ({visibleSuggestions.length})</div>
          <p className="mb-3 text-xs text-amber-700">Le prochain déplacement nécessaire par matériel s'affiche ici. Le suivant apparaîtra une fois celui-ci traité.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSuggestions.map((sug, i) => (
              <div key={i} className="rounded-lg border border-dashed border-amber-300 bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800"><Truck size={15} className="text-amber-500" />{productName(sug.product)}</div>
                <div className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-md bg-slate-100 px-2 py-1">{whName(sug.from)}</span>
                  <ArrowRight size={13} className="text-slate-400" />
                  <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-800">{whName(sug.to)}</span>
                </div>
                <div className="mb-3 text-xs font-medium text-amber-700">À déplacer avant le {fmtFR(sug.before)}</div>
                <button onClick={() => planSuggested(sug)} className="w-full rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">Planifier ce transfert</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {rows.length === 0 ? <Empty icon={Truck} msg={archived ? "Aucun transfert terminé." : "Aucun transfert planifié."} /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="plex-mono text-[11px] text-slate-400">{t.id}</span>
                <Status s={trStatus(t)} />
              </div>
              <div className="mb-3 flex items-center gap-2 font-semibold text-slate-800"><Truck size={16} className="text-violet-500" />{productName(t.product)}</div>
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">{whName(t.from)}</span>
                <ArrowRight size={14} className="text-slate-400" />
                <span className="rounded-md bg-teal-50 px-2 py-1 text-xs text-teal-800">{whName(t.to)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><Calendar size={13} className="text-slate-400" />{fmtFR(t.date)}</span>
                {!archived && <button onClick={() => complete(t)} className="rounded-md px-2 py-1 font-medium text-teal-700 hover:bg-teal-50">Marquer effectué</button>}
                {archived && <button onClick={() => restore(t)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"><RotateCcw size={13} /> Désarchiver</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Planifier un transfert">
        <div className="space-y-3">
          <Field label="Produit">
            <select value={f.product} onChange={(e) => setF((s) => ({ ...s, product: e.target.value }))} className={inputCls}>
              <option value="">Sélectionner…</option>
              {store.products.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} (actuellement {whName(p.warehouse)})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entrepôt de départ">
              <select value={f.from} onChange={(e) => setF((s) => ({ ...s, from: e.target.value }))} className={inputCls}>
                <option value="">…</option>{store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Entrepôt d'arrivée">
              <select value={f.to} onChange={(e) => setF((s) => ({ ...s, to: e.target.value }))} className={inputCls}>
                <option value="">…</option>{store.warehouses.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Date prévue"><input type="date" value={f.date} onChange={(e) => setF((s) => ({ ...s, date: e.target.value }))} className={inputCls} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!f.product || !f.from || !f.to || !f.date || f.from === f.to} onClick={submit} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Planifier</button>
        </div>
      </Modal>
    </div>
  );
}

/* ================================================================== *
 *  ADMIN APP
 * ================================================================== */
function AdminApp({ store, setStore, onPreview }) {
  const [selectedEtb, setSelectedEtb] = useState(null);
  const [toast, setToast] = useState(null);
  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  const genCode = (name, fb) =>
    (name.split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 3).toUpperCase() || fb) +
    "-" + Math.floor(1000 + Math.random() * 8999);

  /* ----- establishment modal ----- */
  const [etbOpen, setEtbOpen] = useState(false);
  const [etbEditing, setEtbEditing] = useState(null);
  const [etbForm, setEtbForm] = useState({ name: "", identifiant: "" });
  const openEtbNew = () => { setEtbEditing(null); setEtbForm({ name: "", identifiant: "" }); setEtbOpen(true); };
  const openEtbEdit = (e) => { setEtbEditing(e); setEtbForm({ name: e.name, identifiant: e.identifiant }); setEtbOpen(true); };
  const saveEtb = () => {
    const ident = etbForm.identifiant.trim().toLowerCase();
    if (etbEditing) {
      setStore((s) => ({ ...s, establishments: s.establishments.map((e) => e.id === etbEditing.id ? { ...e, name: etbForm.name, identifiant: ident } : e) }));
      notify("Établissement modifié.");
    } else {
      const code = genCode(etbForm.name, "ETB");
      setStore((s) => ({ ...s, establishments: [{ id: newId("ETB"), name: etbForm.name, identifiant: ident, code, archived: false }, ...s.establishments] }));
      notify(`Établissement créé — identifiant « ${ident} », code ${code}.`);
    }
    setEtbOpen(false);
  };
  const archiveEtb = (id) => {
    setStore((s) => ({
      ...s,
      establishments: s.establishments.map((e) => e.id === id ? { ...e, archived: true } : e),
      accesses: s.accesses.map((a) => a.establishmentId === id ? { ...a, archived: true } : a),
    }));
    setSelectedEtb(null);
    notify("Établissement archivé (avec ses accès).");
  };

  /* ----- access modal ----- */
  const blankAcc = { label: "", identifiant: "", mode: "full", sections: SECTIONS.map((s) => s.id), singleDevice: true };
  const [accOpen, setAccOpen] = useState(false);
  const [accEditing, setAccEditing] = useState(null);
  const [af, setAf] = useState(blankAcc);
  const openAccNew = () => { setAccEditing(null); setAf(blankAcc); setAccOpen(true); };
  const openAccEdit = (a) => { setAccEditing(a); setAf({ label: a.label, identifiant: a.identifiant, mode: a.sections.length === SECTIONS.length ? "full" : "custom", sections: a.sections, singleDevice: a.singleDevice }); setAccOpen(true); };
  const saveAcc = () => {
    const sections = af.mode === "full" ? SECTIONS.map((s) => s.id) : af.sections;
    const ident = af.identifiant.trim().toLowerCase();
    if (accEditing) {
      setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === accEditing.id ? { ...a, label: af.label, identifiant: ident, sections, singleDevice: af.singleDevice } : a) }));
      notify("Accès modifié.");
    } else {
      const code = genCode(af.label, "ACC");
      setStore((s) => ({ ...s, accesses: [{ id: newId("ACC"), establishmentId: selectedEtb.id, label: af.label, identifiant: ident, code, sections, singleDevice: af.singleDevice, activeDevice: null, archived: false }, ...s.accesses] }));
      notify(`Accès créé — identifiant « ${ident} », code ${code}.`);
    }
    setAccOpen(false);
  };
  const archiveAcc = (id) => { setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === id ? { ...a, archived: true } : a) })); notify("Accès archivé."); };
  const releaseDevice = (id) => { setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === id ? { ...a, activeDevice: null } : a) })); notify("Appareil libéré — l'accès peut se reconnecter ailleurs."); };
  const restoreEtb = (id) => {
    setStore((s) => ({
      ...s,
      establishments: s.establishments.map((e) => e.id === id ? { ...e, archived: false } : e),
      accesses: s.accesses.map((a) => a.establishmentId === id ? { ...a, archived: false } : a),
    }));
    notify("Établissement désarchivé (avec ses accès).");
  };
  const restoreAcc = (id) => { setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === id ? { ...a, archived: false } : a) })); notify("Accès désarchivé."); };

  const etbs = store.establishments.filter((e) => !e.archived);
  const accessesOf = (eid) => store.accesses.filter((a) => a.establishmentId === eid && !a.archived);
  const archivedAccessesOf = (eid) => store.accesses.filter((a) => a.establishmentId === eid && a.archived);
  const etb = selectedEtb ? store.establishments.find((e) => e.id === selectedEtb.id) : null;

  return (
    <div className="min-h-full w-full bg-slate-100">
      <div className="border-b border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><Shield size={18} /></div>
          <div>
            <div className="text-sm font-semibold">Administration</div>
            <div className="text-[11px] text-slate-400">Établissements & accès — application séparée</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {!etb ? (
          /* ---------- list of establishments ---------- */
          <>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-slate-800">Établissements</h1>
                <p className="mt-0.5 text-sm text-slate-400">{etbs.length} établissement(s). Ouvrez-en un pour gérer ses accès.</p>
              </div>
              <button onClick={openEtbNew} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"><Plus size={16} /> Créer un établissement</button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {etbs.map((e) => {
                const accs = accessesOf(e.id);
                return (
                  <button key={e.id} onClick={() => setSelectedEtb(e)} className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-500"><Building2 size={18} /></div>
                        <div>
                          <div className="font-semibold text-slate-800">{e.name}</div>
                          <div className="plex-mono text-xs text-slate-400">{e.identifiant} · {e.code}</div>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-500" />
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                      <KeyRound size={14} className="text-slate-400" />
                      {accs.length} accès {accs.length > 0 && <span className="text-slate-300">·</span>}
                      <span className="truncate text-slate-400">{accs.map((a) => a.label).join(", ")}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {store.establishments.some((e) => e.archived) && (
              <div className="mt-8">
                <div className="mb-2 text-sm font-medium text-slate-500">Établissements archivés</div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {store.establishments.filter((e) => e.archived).map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0">
                      <span className="text-slate-500">{e.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="plex-mono text-xs text-slate-300">{e.code}</span>
                        <button onClick={() => restoreEtb(e.id)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><RotateCcw size={13} /> Désarchiver</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ---------- establishment detail: its accesses ---------- */
          <>
            <button onClick={() => setSelectedEtb(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><ChevronLeft size={16} /> Tous les établissements</button>

            <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-slate-900 text-white"><Building2 size={22} /></div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-800">{etb.name}</h1>
                  <div className="plex-mono text-xs text-slate-400">Identifiant : {etb.identifiant} · Code : {etb.code}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEtbEdit(etb)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Pencil size={14} /> Renommer</button>
                <button onClick={() => archiveEtb(etb.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><Archive size={14} /> Archiver</button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Accès</h2>
                <p className="text-sm text-slate-400">Plusieurs accès possibles par établissement, chacun avec ses propres droits.</p>
              </div>
              <button onClick={openAccNew} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"><Plus size={16} /> Créer un accès</button>
            </div>

            <div className="space-y-3">
              {accessesOf(etb.id).length === 0 && <Empty icon={KeyRound} msg="Aucun accès. Créez-en un pour cet établissement." />}
              {accessesOf(etb.id).map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500"><KeyRound size={16} /></div>
                      <div>
                        <div className="font-medium text-slate-800">{a.label}</div>
                        <div className="plex-mono text-xs text-slate-400">{a.identifiant} · {a.code}</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => onPreview(a, etb)} title="Prévisualiser le logiciel avec cet accès" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><Eye size={14} /> Prévisualiser</button>
                      <button onClick={() => openAccEdit(a)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15} /></button>
                      <button onClick={() => archiveAcc(a.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Archive size={15} /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                    {a.sections.length === SECTIONS.length ? (
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-600/20">Accès complet</span>
                    ) : SECTIONS.map((s) => (
                      <span key={s.id} className={`rounded-full px-2.5 py-1 text-xs ${a.sections.includes(s.id) ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-600/20" : "bg-slate-50 text-slate-300 line-through"}`}>{s.label}</span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {a.singleDevice ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20"><Smartphone size={12} /> 1 seul appareil</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-400 ring-1 ring-inset ring-slate-300/40"><Smartphone size={12} /> Multi-appareils</span>
                    )}
                    {a.singleDevice && (a.activeDevice ? (
                      <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                        Connecté&nbsp;: <span className="plex-mono text-slate-700">{a.activeDevice}</span>
                        <button onClick={() => releaseDevice(a.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50"><Unlock size={12} /> Libérer</button>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Aucun appareil connecté</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {archivedAccessesOf(etb.id).length > 0 && (
              <div className="mt-8">
                <div className="mb-2 text-sm font-medium text-slate-500">Accès archivés</div>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {archivedAccessesOf(etb.id).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-2.5 text-sm last:border-0">
                      <span className="text-slate-500">{a.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="plex-mono text-xs text-slate-300">{a.code}</span>
                        <button onClick={() => restoreAcc(a.id)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><RotateCcw size={13} /> Désarchiver</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* establishment modal */}
      <Modal open={etbOpen} onClose={() => setEtbOpen(false)} title={etbEditing ? "Modifier l'établissement" : "Créer un établissement"}>
        <div className="space-y-4">
          <Field label="Nom de l'établissement">
            <input value={etbForm.name} onChange={(e) => setEtbForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Ex : CHU de Paris" />
          </Field>
          <Field label="Identifiant de connexion" hint={etbEditing ? `Code : ${etbEditing.code} (généré)` : "Choisi par vous. Le code sera généré automatiquement."}>
            <input value={etbForm.identifiant} onChange={(e) => setEtbForm((f) => ({ ...f, identifiant: e.target.value }))} className={`${inputCls} plex-mono`} placeholder="ex : chu-paris" />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setEtbOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!etbForm.name.trim() || !etbForm.identifiant.trim()} onClick={saveEtb} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-slate-800 disabled:opacity-40">{etbEditing ? "Enregistrer" : "Créer"}</button>
        </div>
      </Modal>

      {/* access modal */}
      <Modal open={accOpen} onClose={() => setAccOpen(false)} title={accEditing ? "Modifier l'accès" : "Créer un accès"}>
        <div className="space-y-4">
          <Field label="Nom de l'accès">
            <input value={af.label} onChange={(e) => setAf((s) => ({ ...s, label: e.target.value }))} className={inputCls} placeholder="Ex : Service logistique" />
          </Field>
          <Field label="Identifiant de connexion" hint={accEditing ? `Code : ${accEditing.code} (généré)` : "Choisi par vous. Le code sera généré automatiquement."}>
            <input value={af.identifiant} onChange={(e) => setAf((s) => ({ ...s, identifiant: e.target.value }))} className={`${inputCls} plex-mono`} placeholder="ex : logistique" />
          </Field>
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">Droits d'accès</span>
            <div className="grid grid-cols-2 gap-2">
              {[["full", "Accès complet"], ["custom", "Accès personnalisé"]].map(([v, l]) => (
                <button key={v} onClick={() => setAf((s) => ({ ...s, mode: v }))} className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${af.mode === v ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
              ))}
            </div>
          </div>
          {af.mode === "custom" && (
            <div className="space-y-1 rounded-lg bg-slate-50 p-3">
              {SECTIONS.map((s) => {
                const on = af.sections.includes(s.id);
                return (
                  <button key={s.id} onClick={() => setAf((st) => ({ ...st, sections: on ? st.sections.filter((x) => x !== s.id) : [...st.sections, s.id] }))} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-white">
                    <span className={`grid h-4 w-4 place-items-center rounded border ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300"}`}>{on && <Check size={12} />}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={() => setAf((s) => ({ ...s, singleDevice: !s.singleDevice }))}
            className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50">
            <span className="flex items-start gap-2.5">
              <Smartphone size={16} className="mt-0.5 text-slate-400" />
              <span>
                <span className="block text-sm font-medium text-slate-700">Limiter à un seul appareil</span>
                <span className="block text-xs text-slate-400">Le code ne pourra pas être connecté sur deux postes en même temps.</span>
              </span>
            </span>
            <span className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition ${af.singleDevice ? "justify-end bg-teal-600" : "justify-start bg-slate-300"}`}>
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setAccOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={!af.label.trim() || !af.identifiant.trim() || (af.mode === "custom" && af.sections.length === 0)} onClick={saveAcc} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">{accEditing ? "Enregistrer" : "Créer l'accès"}</button>
        </div>
      </Modal>

      {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

/* ---------- shared empty state ---------- */
function Empty({ icon: Icon, msg }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
      <Icon size={28} className="mb-2 text-slate-300" />
      <p className="text-sm text-slate-400">{msg}</p>
    </div>
  );
}

/* ================================================================== *
 *  LOGIN — two-step: establishment code, then personal access code
 * ================================================================== */
function LoginScreen({ store, onLogin }) {
  const [step, setStep] = useState(1);
  const [etbIdent, setEtbIdent] = useState("");
  const [etbCode, setEtbCode] = useState("");
  const [accIdent, setAccIdent] = useState("");
  const [accCode, setAccCode] = useState("");
  const [etb, setEtb] = useState(null);
  const [error, setError] = useState("");

  const submitEtb = () => {
    const found = store.establishments.find((e) => !e.archived
      && e.identifiant.toLowerCase() === etbIdent.trim().toLowerCase()
      && e.code.toLowerCase() === etbCode.trim().toLowerCase());
    if (!found) { setError("Identifiant ou code établissement incorrect."); return; }
    setEtb(found); setError(""); setStep(2);
  };
  const submitAcc = () => {
    const acc = store.accesses.find((a) => !a.archived && a.establishmentId === etb.id
      && a.identifiant.toLowerCase() === accIdent.trim().toLowerCase()
      && a.code.toLowerCase() === accCode.trim().toLowerCase());
    if (!acc) { setError("Identifiant ou code d'accès incorrect."); return; }
    if (acc.singleDevice && acc.activeDevice) {
      setError(`Cet accès est déjà connecté sur un autre appareil (${acc.activeDevice}). Libérez-le depuis l'Administration.`);
      return;
    }
    const deviceId = "Poste-" + Math.random().toString(16).slice(2, 6).toUpperCase();
    onLogin(acc, etb, deviceId);
  };
  const back = () => { setStep(1); setAccIdent(""); setAccCode(""); setError(""); };

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-teal-700 text-white"><Package size={24} /></div>
          <div className="text-lg font-semibold text-slate-800">MedPark</div>
          <div className="text-sm text-slate-400">Connexion à l'espace de gestion</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <StepDot n={1} active={step === 1} done={step > 1} label="Établissement" />
            <div className={`h-px flex-1 ${step > 1 ? "bg-teal-500" : "bg-slate-200"}`} />
            <StepDot n={2} active={step === 2} done={false} label="Accès" />
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <Field label="Identifiant de l'établissement">
                <input autoFocus value={etbIdent} onChange={(e) => setEtbIdent(e.target.value)} className={`${inputCls} plex-mono`} placeholder="chu-paris" />
              </Field>
              <Field label="Code de l'établissement" hint="Identifiant et code fournis par l'administrateur.">
                <input value={etbCode} onChange={(e) => setEtbCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitEtb()} className={`${inputCls} plex-mono uppercase tracking-widest`} placeholder="CHP-4821" />
              </Field>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button onClick={submitEtb} disabled={!etbIdent.trim() || !etbCode.trim()} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Continuer</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
                <Building2 size={15} /> {etb.name}
              </div>
              <Field label="Votre identifiant d'accès">
                <input autoFocus value={accIdent} onChange={(e) => setAccIdent(e.target.value)} className={`${inputCls} plex-mono`} placeholder="logistique" />
              </Field>
              <Field label="Votre code d'accès" hint="Propre à votre accès — ne le partagez pas.">
                <input value={accCode} onChange={(e) => setAccCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAcc()} className={`${inputCls} plex-mono uppercase tracking-widest`} placeholder="LOG-2207" />
              </Field>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button onClick={submitAcc} disabled={!accIdent.trim() || !accCode.trim()} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white enabled:hover:bg-teal-800 disabled:opacity-40">Se connecter</button>
              <button onClick={back} className="w-full text-center text-xs text-slate-400 hover:text-slate-600">← Changer d'établissement</button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          Démo — établissement <span className="plex-mono">chu-paris</span> / <span className="plex-mono">CHP-4821</span>.<br />
          Accès <span className="plex-mono">accueil</span> / <span className="plex-mono">ACR-5530</span> (libre).
          <span className="plex-mono"> logistique</span> / <span className="plex-mono">LOG-2207</span> est occupé (blocage « 1 seul appareil »).
        </p>
      </div>
    </div>
  );
}
function StepDot({ n, active, done, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${done ? "bg-teal-600 text-white" : active ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-400"}`}>
        {done ? <Check size={13} /> : n}
      </span>
      <span className={`text-xs font-medium ${active || done ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

/* ================================================================== *
 *  ROOT — login → main app, plus a separate admin app
 * ================================================================== */
export default function App() {
  const [store, setStore] = useState({
    warehouses: seedWarehouses, patients: seedPatients, partenaires: seedPartenaires, products: seedProducts,
    reservations: seedReservations, transfers: seedTransfers,
    establishments: seedEstablishments, accesses: seedAccesses,
  });
  const [app, setApp] = useState("main");
  const [preview, setPreview] = useState(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      .pm-root, .pm-root * { font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif; }
      .pm-root .plex-mono { font-family: 'IBM Plex Mono', monospace; }
    `;
    document.head.appendChild(style);
    return () => { link.remove(); style.remove(); };
  }, []);

  const switchApp = (v) => { setPreview(null); setApp(v); };
  const startPreview = (access, etb) => {
    setPreview({ sections: access.sections, establishmentId: etb.id, establishmentName: etb.name, accessLabel: access.label, code: access.code });
    setApp("main");
  };
  const exitPreview = () => { setPreview(null); setApp("admin"); };

  const handleLogin = (access, etb, deviceId) => {
    setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === access.id ? { ...a, activeDevice: access.singleDevice ? deviceId : a.activeDevice } : a) }));
    setSession({ accessId: access.id, deviceId, sections: access.sections, establishmentId: etb.id, establishmentName: etb.name, accessLabel: access.label, code: access.code });
  };
  const logout = () => {
    if (session) setStore((s) => ({ ...s, accesses: s.accesses.map((a) => a.id === session.accessId ? { ...a, activeDevice: null } : a) }));
    setSession(null);
  };

  // session stays in sync with admin actions (e.g. access rights changed, device released, archived)
  const liveAccess = session ? store.accesses.find((a) => a.id === session.accessId) : null;
  const sessionAccess = liveAccess && !liveAccess.archived
    ? { ...session, sections: liveAccess.sections }
    : session;

  return (
    <div className="pm-root flex h-screen w-full flex-col bg-slate-50 text-slate-800">
      {/* prototype top bar — lets you preview both applications (démo uniquement) */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Prototype</span>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {[["main", "Logiciel principal"], ["admin", "Administration"]].map(([v, l]) => (
            <button key={v} onClick={() => switchApp(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${app === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {app === "admin"
          ? <AdminApp store={store} setStore={setStore} onPreview={startPreview} />
          : preview
            ? <MainApp store={store} setStore={setStore} access={preview} mode="preview" onExit={exitPreview} />
            : session
              ? <MainApp store={store} setStore={setStore} access={sessionAccess} mode="session" onExit={logout} />
              : <LoginScreen store={store} onLogin={handleLogin} />}
      </div>
    </div>
  );
}
