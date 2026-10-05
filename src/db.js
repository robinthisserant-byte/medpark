import { supabase } from "./supabaseClient.js";

// Toutes les sections du logiciel (droits par défaut d'un nouveau compte entreprise).
const ALL_SECTIONS = ["reservations", "agenda", "tiers", "inventaire", "maintenance", "stats", "transport"];

// Établissement de l'utilisateur connecté (rempli au login). Sert à ne montrer
// que les données de SON entreprise. null pour l'admin (qui ne liste pas ces données).
let _etbId = null;
// Ajoute le filtre "mon établissement" à une requête, quand on en a un.
function scope(q) { return _etbId ? q.eq("etablissement_id", _etbId) : q; }

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
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => { try { data.subscription.unsubscribe(); } catch (e) {} };
}

// Envoie un email de réinitialisation de mot de passe.
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

// Définit un nouveau mot de passe (après avoir cliqué le lien de réinitialisation).
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Récupère le profil de l'utilisateur connecté : son rôle (admin/client),
// son établissement (pour un client) et ses droits (sections autorisées).
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { _etbId = null; return null; }
  const { data: membre, error } = await supabase
    .from("membres").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  _etbId = (membre && membre.etablissement_id) || null;   // on mémorise l'établissement du compte
  let establishmentName = "";
  if (membre && membre.etablissement_id) {
    const { data: etb } = await supabase
      .from("etablissements").select("nom").eq("id", membre.etablissement_id).maybeSingle();
    establishmentName = (etb && etb.nom) || "";
  }
  return { user, membre: membre || null, establishmentName };
}

// Inscription libre : une entreprise crée son compte, son espace est provisionné
// avec 14 jours d'essai gratuit et le nombre d'accès choisi.
export async function signUp(companyName, email, password, nbAcces) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) return { needsConfirm: true };   // si la confirmation email est activée
  // date de fin d'essai = aujourd'hui + 2 mois
  const d = new Date(); d.setMonth(d.getMonth() + 2);
  const essaiFin = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const base = (companyName || "entreprise").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "entreprise";
  const slug = base + "-" + Math.random().toString(36).slice(2, 6);   // suffixe pour éviter les doublons
  const code = "ETB-" + Math.floor(1000 + Math.random() * 8999);
  // 1) créer l'établissement de l'entreprise (avec son abonnement en période d'essai)
  const { data: etb, error: e2 } = await supabase.from("etablissements").insert({
    nom: companyName, identifiant: slug, code, archived: false,
    nb_acces: nbAcces || 1, abo_statut: "essai", essai_fin: essaiFin,
  }).select().single();
  if (e2) throw e2;
  // 2) rattacher l'utilisateur à cet établissement (compte client, tous les droits)
  const { error: e3 } = await supabase.from("membres").insert({
    user_id: data.user.id, role: "client", etablissement_id: etb.id, sections: ALL_SECTIONS, label: companyName,
  });
  if (e3) throw e3;
  _etbId = etb.id;
  return { ok: true };
}

// Abonnement de mon entreprise (nombre d'accès, statut, fin d'essai).
export async function getMyAbonnement() {
  const id = await getEtablissementId();
  if (!id) return null;
  const { data, error } = await supabase
    .from("etablissements").select("nb_acces, abo_statut, essai_fin").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { nbAcces: data.nb_acces || 1, statut: data.abo_statut || "essai", essaiFin: data.essai_fin || null };
}

// Modifie le nombre d'accès de mon entreprise (change le prix mensuel).
export async function setNbAcces(nbAcces) {
  const id = await getEtablissementId();
  if (!id) return;
  const { error } = await supabase.from("etablissements").update({ nb_acces: nbAcces }).eq("id", id);
  if (error) throw error;
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

// Identifiant de l'établissement de l'utilisateur connecté (son entreprise).
export async function getEtablissementId() {
  if (_etbId) return _etbId;
  // au cas où le profil n'aurait pas encore été chargé
  const prof = await getMyProfile();
  return prof && prof.membre ? prof.membre.etablissement_id : null;
}

// Liste les entrepôts de mon entreprise (pour les menus déroulants et l'affichage).
export async function listEntrepots() {
  const { data, error } = await scope(
    supabase.from("entrepots").select("*").eq("archived", false).order("nom"));
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.nom, address: r.adresse }));
}

// Liste tous les matériels de mon entreprise.
export async function listProduits() {
  const { data, error } = await scope(
    supabase.from("produits").select("*").order("created_at", { ascending: false }));
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
  const { data, error } = await scope(
    supabase.from("produits").select("*").eq("archived", true).order("nom"));
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
  const { data, error } = await scope(supabase.from(t.table).select("*").eq("archived", false).order("nom"));
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
  const { data, error } = await scope(supabase.from(t.table).select("*").eq("archived", true).order("nom"));
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
  const { data, error } = await scope(
    supabase.from("reservations").select("*").order("created_at", { ascending: false }));
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
  const { data, error } = await scope(
    supabase.from("transferts").select("*").order("created_at", { ascending: false }));
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

/* ------------------------------------------------------------------ *
 *  ACCÈS (table "acces") : les "sièges" d'une entreprise.
 *  Chacun a un nom, un code (pour ouvrir le logiciel) et des droits.
 * ------------------------------------------------------------------ */
function accesFromDb(r) {
  // "droits" est un tableau Postgres (text[]) -> déjà un tableau JS côté client.
  let sections = Array.isArray(r.droits) ? r.droits : [];
  if (!sections.length) sections = ALL_SECTIONS;
  return { id: r.id, label: r.nom || "Accès", code: r.code || "", sections };
}

// Liste les accès de mon entreprise.
export async function listAcces() {
  const { data, error } = await scope(supabase.from("acces").select("*").eq("archived", false).order("nom"));
  if (error) throw error;
  return (data || []).map(accesFromDb);
}

// Crée un accès (génère un code à 6 chiffres).
export async function createAcces(label, sections) {
  const etbId = await getEtablissementId();
  const code = Math.floor(100000 + Math.random() * 899999).toString();
  const slug = (label || "acces").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "acces";
  const ident = slug + "-" + Math.random().toString(36).slice(2, 5);
  const row = {
    etablissement_id: etbId, nom: label, code, identifiant: ident,
    droits: (sections && sections.length ? sections : ALL_SECTIONS), archived: false,
  };
  const { data, error } = await supabase.from("acces").insert(row).select().single();
  if (error) throw error;
  return accesFromDb(data);
}

// Supprime (archive) un accès.
export async function deleteAcces(id) {
  const { error } = await supabase.from("acces").update({ archived: true }).eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ *
 *  ADMIN (toi) : voir toutes les entreprises inscrites et leurs accès.
 * ------------------------------------------------------------------ */
export async function listEtablissementsAdmin() {
  const { data, error } = await supabase.from("etablissements").select("*").order("nom");
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id, nom: r.nom, identifiant: r.identifiant || "", code: r.code || "",
    nbAcces: r.nb_acces || 1, statut: r.abo_statut || "essai", essaiFin: r.essai_fin || null,
    archived: !!r.archived,
  }));
}

export async function listAccesForEtb(etbId) {
  const { data, error } = await supabase
    .from("acces").select("*").eq("etablissement_id", etbId).eq("archived", false).order("nom");
  if (error) throw error;
  return (data || []).map(accesFromDb);
}
