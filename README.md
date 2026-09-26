# MedPark — Gestion de parc de location de matériel médical

Maquette interactive (interface) du logiciel MedPark : réservations, agenda, matériels,
patients & partenaires, inventaire, maintenance, transferts, statistiques, et une
application d'administration séparée (établissements, accès, droits).

> **État actuel : maquette.** Les données sont en mémoire (elles se réinitialisent au
> rechargement). L'étape suivante est de brancher une vraie base de données. Voir le guide
> _« De la maquette au produit commercialisable »_.

## Stack technique

- [React 18](https://react.dev/)
- [Vite 5](https://vite.dev/) (serveur de dev + build)
- [Tailwind CSS 3](https://tailwindcss.com/)
- [lucide-react](https://lucide.dev/) (icônes)

## Prérequis

- [Node.js](https://nodejs.org/) version 18 ou plus (testé avec Node 22)
- npm (fourni avec Node.js)

## Démarrer en local

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer le serveur de développement
npm run dev
```

Vite affiche alors une adresse locale (par défaut http://localhost:5173) — ouvrez-la
dans votre navigateur.

## Construire pour la production

```bash
npm run build      # génère le dossier dist/
npm run preview    # prévisualise le build de production en local
```

## Structure du projet

```
medpark/
├── index.html            # point d'entrée HTML
├── package.json          # dépendances et scripts
├── vite.config.js        # configuration Vite
├── tailwind.config.js    # configuration Tailwind
├── postcss.config.js     # configuration PostCSS
├── src/
│   ├── main.jsx          # montage de l'application React
│   ├── App.jsx           # toute la maquette (interface)
│   └── index.css         # directives Tailwind
└── .gitignore
```

## Comptes de démonstration (connexion)

L'application s'ouvre sur un écran de connexion en deux étapes.

- **Établissement** — identifiant `chu-paris`, code `CHP-4821`
- **Accès** — identifiant `accueil`, code `ACR-5530` (accès libre)
  - `logistique` / `LOG-2207` est volontairement « déjà connecté » pour illustrer la
    règle « un seul appareil ».

Le bouton **Administration** (en haut) permet de prévisualiser l'application d'admin.

## Prochaines étapes (industrialisation)

1. Base de données + authentification réelle (ex : Supabase) avec isolation par établissement
2. Brancher l'interface sur la base (remplacer les données en mémoire)
3. Mise en ligne (ex : Vercel) + nom de domaine + HTTPS
4. Facturation (ex : Stripe)
5. Hébergement conforme **HDS** avant toute donnée patient réelle

⚠️ Ne jamais committer de clés ou secrets : utilisez un fichier `.env.local` (déjà ignoré par git).
