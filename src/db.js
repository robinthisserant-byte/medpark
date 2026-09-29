import { supabase } from "./supabaseClient.js";

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
