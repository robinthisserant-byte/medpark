import { supabase } from "./supabaseClient.js";

/* ------------------------------------------------------------------ *
 *  AUTHENTIFICATION (connexion réelle par email + mot de passe).
 * ------------------------------------------------------------------ */

// Connexion.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Déconnexion.
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Session en cours (ou null si personne n'est connecté).
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// S'abonne aux changements de connexion (connexion / déconnexion). Renvoie une fonction pour se désabonner.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => { try { data.subscription.unsubscribe(); } catch (e) {} };
}

// Récupère le profil de l'utilisateur connecté : son rôle (admin/client),
// son établissement (pour un client) et ses droits (sections autorisées).
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membre, error } = await supabase
    .from("membres").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  let establishmentName = "";
  if (membre && membre.etablissement_id) {
    const { data: etb } = await supabase
      .from("etablissements").select("nom").eq("id", membre.etablissement_id).maybeSingle();
    establishmentName = (etb && etb.nom) || "";
  }
  return { user, membre: membre || null, establishmentName };
}

/* ------------------------------------------------------------------ *
 *  db.js — le "traducteur" entre l'application et la base Supabase.
 *  Les colonnes de la base sont en français (nom, n_parc, entrepot_id…),
 *  l'application utilise d'autres noms (name, numParc, warehouse…).
 *  Ces fonctions font la conversion dans les deux sens.
 * ------------------------------------------------------------------ */

// --- MATÉRIELS (table "produits") ---

// base -> application
function produitFromDb(r) {
  return {
    id: r.id,
    name: r.nom,
    numParc: r.n_parc || "",
    numSerie: r.n_serie || "",
    prix: r.prix != null ? String(r.prix) : "",
    category: r.categorie || "",
    sub: r.sous_cat || "",
    parts: r.parts || [],
    linked: r.materiels_lies || [],
    warehouse: r.entrepot_id || "",
    photo: r.photo || null,
    pdf: r.pdf || null,
    revision: r.revision || null,
    maintStatus: r.statut_maint || "ok",
    archived: r.archived,
    etb: r.etablissement_id,
  };
}

// application -> base
function produitToDb(f, etbId) {
  return {
    etablissement_id: etbId,
    nom: f.name,
    n_parc: f.numParc || null,
    n_serie: f.numSerie || null,
    prix: f.prix !== "" && f.prix != null ? Number(f.prix) : null,
    categorie: f.category || null,
    sous_cat: f.sub || null,
    parts: f.parts || [],
    materiels_lies: f.linked || [],
    entrepot_id: f.warehouse || null,
    photo: f.photo || null,
    pdf: f.pdf || null,
  };
}

// Récupère l'identifiant de l'établissement (un seul pour l'instant : le client pilote).
export async function getEtablissementId() {
  const { data, error } = await supabase.from("etablissements").select("id").limit(1).maybeSingle();
  if (error) throw error;
  return data ? data.id : null;
}

// Liste les entrepôts (pour les menus déroulants et l'affichage).
export async function listEntrepots() {
  const { data, error } = await supabase
    .from("entrepots").select("*").eq("archived", false).order("nom");
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.nom, address: r.adresse }));
}

// Liste tous les matériels.
export async function listProduits() {
  const { data, error } = await supabase
    .from("produits").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(produitFromDb);
}

// Ajoute un matériel.
export async function createProduit(f, etbId) {
  const { data, error } = await supabase
    .from("produits").insert(produitToDb(f, etbId)).select().single();
  if (error) throw error;
  return produitFromDb(data);
}

// Modifie un matériel existant.
export async function updateProduit(id, f, etbId) {
  const { data, error } = await supabase
    .from("produits").update(produitToDb(f, etbId)).eq("id", id).select().single();
  if (error) throw error;
  return produitFromDb(data);
}

// Archive (ou désarchive) un matériel.
export async function setProduitArchived(id, archived) {
  const { error } = await supabase.from("produits").update({ archived }).eq("id", id);
  if (error) throw error;
}

// Liste uniquement les matériels archivés (pour l'écran "Tiers archivés").
export async function listProduitsArchived() {
  const { data, error } = await supabase
    .from("produits").select("*").eq("archived", true).order("nom");
  if (error) throw error;
  return (data || []).map(produitFromDb);
}

/* ------------------------------------------------------------------ *
 *  TIERS SIMPLES : lieux de stockage (entrepots), patients, partenaires.
 *  Ces 3 écrans se ressemblent, donc on les gère avec les mêmes fonctions,
 *  en précisant juste le "kind" (le type).
 * ------------------------------------------------------------------ */
const TIERS = {
  warehouses:  { table: "entrepots",   hasPartner: false },
  partenaires: { table: "partenaires", hasPartner: false },
  patients:    { table: "patients",    hasPartner: true  },
};

function tiersFromDb(r) {
  return { id: r.id, name: r.nom, address: r.adresse || "", partenaire: r.partenaire_id || "" };
}

export async function listTiers(kind) {
  const t = TIERS[kind];
  const { data, error } = await supabase.from(t.table).select("*").eq("archived", false).order("nom");
  if (error) throw error;
  return (data || []).map(tiersFromDb);
}

export async function createTiers(kind, f, etbId) {
  const t = TIERS[kind];
  const row = { etablissement_id: etbId, nom: f.name, adresse: f.address || null };
  if (t.hasPartner) row.partenaire_id = f.partenaire || null;
  const { data, error } = await supabase.from(t.table).insert(row).select().single();
  if (error) throw error;
  return tiersFromDb(data);
}

export async function updateTiers(kind, id, f) {
  const t = TIERS[kind];
  const row = { nom: f.name, adresse: f.address || null };
  if (t.hasPartner) row.partenaire_id = f.partenaire || null;
  const { error } = await supabase.from(t.table).update(row).eq("id", id);
  if (error) throw error;
}

export async function archiveTiers(kind, id) {
  const t = TIERS[kind];
  const { error } = await supabase.from(t.table).update({ archived: true }).eq("id", id);
  if (error) throw error;
}

// Liste les tiers archivés d'un type donné (pour l'écran "Tiers archivés").
export async function listTiersArchived(kind) {
  const t = TIERS[kind];
  const { data, error } = await supabase.from(t.table).select("*").eq("archived", true).order("nom");
  if (error) throw error;
  return (data || []).map(tiersFromDb);
}

// Désarchive un tiers (le remet dans la liste active).
export async function unarchiveTiers(kind, id) {
  const t = TIERS[kind];
  const { error } = await supabase.from(t.table).update({ archived: false }).eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 *  RÉSERVATIONS (table "reservations").
 *  Colonnes base : produit_id, patient_id, retrait_id (lieu de départ),
 *  retour_id (lieu de retour), debut, fin, note, pdf, archived.
 * ------------------------------------------------------------------ */

// base -> application
function reservationFromDb(r) {
  return {
    id: r.id,
    product: r.produit_id || "",
    patient: r.patient_id || "",
    warehouse: r.retrait_id || "",      // lieu de retrait / départ
    returnWarehouse: r.retour_id || "", // lieu de retour
    returnWh: r.retour_id || "",        // alias utilisé par l'écran détail
    start: r.debut,
    end: r.fin,
    note: r.note || "",
    pdf: r.pdf || null,
    archived: r.archived,
    etb: r.etablissement_id,
  };
}

// application -> base
function reservationToDb(f, etbId) {
  return {
    etablissement_id: etbId,
    produit_id: f.product || null,
    patient_id: f.patient || null,
    retrait_id: f.warehouse || null,
    retour_id: f.returnWh || f.returnWarehouse || null,
    debut: f.start || null,
    fin: f.end || null,
    note: f.note || null,
    pdf: f.pdf || null,
  };
}

// Liste toutes les réservations (actives + archivées ; chaque écran filtre ensuite).
export async function listReservations() {
  const { data, error } = await supabase
    .from("reservations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(reservationFromDb);
}

// Crée une ou plusieurs réservations d'un coup (la principale + les matériels associés).
export async function createReservations(list, etbId) {
  const rows = list.map((f) => reservationToDb(f, etbId));
  const { data, error } = await supabase.from("reservations").insert(rows).select();
  if (error) throw error;
  return (data || []).map(reservationFromDb);
}

// Archive ou désarchive une réservation.
export async function setReservationArchived(id, archived) {
  const { error } = await supabase.from("reservations").update({ archived }).eq("id", id);
  if (error) throw error;
}

// Clôture une réservation : on l'archive, on note le lieu de retour et la date de fin.
export async function endReservation(id, retourId, finIso) {
  const { error } = await supabase
    .from("reservations").update({ archived: true, retour_id: retourId || null, fin: finIso }).eq("id", id);
  if (error) throw error;
}

// Déplace un matériel dans un autre lieu de stockage (utilisé au retour d'une location).
export async function setProduitEntrepot(id, entrepotId) {
  const { error } = await supabase.from("produits").update({ entrepot_id: entrepotId || null }).eq("id", id);
  if (error) throw error;
}

// Change le statut de maintenance d'un matériel ("ok" / "reparation").
export async function setProduitMaintStatus(id, statut) {
  const { error } = await supabase.from("produits").update({ statut_maint: statut }).eq("id", id);
  if (error) throw error;
}

// Enregistre (ou efface) le plan de révision préventive d'un matériel.
export async function setProduitRevision(id, revision) {
  const { error } = await supabase.from("produits").update({ revision: revision || null }).eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 *  TRANSFERTS (table "transferts").
 *  Colonnes base : produit_id, depart_id, arrivee_id, date, archived.
 * ------------------------------------------------------------------ */

// base -> application
function transfertFromDb(r) {
  return {
    id: r.id,
    product: r.produit_id || "",
    from: r.depart_id || "",
    to: r.arrivee_id || "",
    date: r.date,
    archived: r.archived,
    etb: r.etablissement_id,
  };
}

// application -> base
function transfertToDb(f, etbId) {
  return {
    etablissement_id: etbId,
    produit_id: f.product || null,
    depart_id: f.from || null,
    arrivee_id: f.to || null,
    date: f.date || null,
  };
}

// Liste tous les transferts (actifs + terminés ; chaque écran filtre ensuite).
export async function listTransferts() {
  const { data, error } = await supabase
    .from("transferts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(transfertFromDb);
}

// Crée (planifie) un transfert.
export async function createTransfert(f, etbId) {
  const { data, error } = await supabase
    .from("transferts").insert(transfertToDb(f, etbId)).select().single();
  if (error) throw error;
  return transfertFromDb(data);
}

// Archive ou désarchive un transfert.
export async function setTransfertArchived(id, archived) {
  const { error } = await supabase.from("transferts").update({ archived }).eq("id", id);
  if (error) throw error;
}
