# Japaney 🗾 — Outil d'épargne pour le voyage au Japon

Petite application web (mobile d'abord, puis PC) pour suivre l'épargne de deux
objectifs de voyage, avec conversion EUR → JPY et journal de mouvements
justifiés.

## Utiliser l'appli

Aucune installation nécessaire : c'est du HTML/CSS/JS pur, sans dépendance.

- **En local** : ouvre `index.html` dans un navigateur, ou lance un petit
  serveur (recommandé pour que la conversion de devise en direct fonctionne
  correctement) :
  ```bash
  python3 -m http.server 8000
  # puis ouvre http://localhost:8000
  ```
- **En ligne** : héberge les 3 fichiers (`index.html`, `style.css`, `app.js`)
  sur GitHub Pages, Netlify, Vercel, etc. — aucune configuration serveur
  requise.

## Fonctionnalités

- **Deux cagnottes indépendantes**, éditables (nom, montant cible, date
  d'échéance) :
  - ✈️ *Voyage 1 mois* — 5 000 € par défaut, du 8 mai au 7 juin 2027.
  - 🇯🇵 *PVT Japon* — 10 000 € par défaut, échéance 01/11/2027 (départ en PVT).
- **Barre de progression** par objectif, avec pourcentage, statut
  (en avance / dans les temps / en retard / échéance dépassée / atteint) basé
  sur une projection linéaire entre la date de départ et l'échéance.
- **Conversion en yen en direct** : le montant épargné et l'objectif sont
  affichés en € et en ¥ (taux du jour via l'API gratuite
  [Frankfurter](https://frankfurter.dev), mise en cache 1 jour). Si l'appareil
  est hors-ligne ou que l'API est bloquée, l'appli retombe sur le dernier taux
  connu (badge orange).
- **Journal des mouvements** : chaque dépôt ou retrait est enregistré avec sa
  date. **Un retrait exige un motif** — c'est la justification à donner
  quand de l'argent doit ressortir de la cagnotte pour revenir sur le compte
  courant (dépense imprévue, urgence, etc.).
- **Résumé global** en haut de page (total épargné / objectifs cumulés, en €
  et ¥).
- **100 % local** : toutes les données sont stockées dans le `localStorage`
  du navigateur — rien n'est envoyé à un serveur (à part la requête de taux
  de change, qui ne contient aucune donnée personnelle).
- **Responsive** : navigation par onglets sur mobile (une cagnotte à la fois),
  les deux cagnottes côte à côte automatiquement à partir de 820 px de large
  (tablette/PC).
- **Suivi des vols Paris CDG → Tokyo Haneda** pour le voyage de mai (dates
  éditables, 8 mai → 7 juin 2027 par défaut) :
  - un bouton ouvre une recherche **Google Flights pré-remplie** (dates +
    filtre "sans escale") — Google ne fournissant pas d'API publique de prix,
    il n'y a pas de vraie récupération automatique possible depuis une page
    statique ;
  - vols directs uniquement disponibles vers **Haneda (HND)**, opérés par Air
    France, ANA et JAL (≈ 13h55, à partir d'environ 900 € A/R selon la
    période) ;
  - un **carnet de prix** permet d'enregistrer chaque prix trouvé (montant,
    compagnie, lien) pour suivre son évolution dans le temps ; le meilleur
    prix est mis en avant avec son poids en % du budget "Voyage 1 mois".

## Structure

```
index.html   structure de la page + template de carte "objectif"
style.css    design mobile-first, thème clair/sombre automatique
app.js       état, calculs (progression, effort requis, taux de change), rendu
```

## Personnaliser

Les montants et dates par défaut sont modifiables directement dans
l'interface (champs éditables sur chaque carte), ou dans `defaultState()`
en haut de `app.js` si tu préfères changer les valeurs de départ.
