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
    prix est mis en avant avec son poids en % du budget "Voyage 1 mois" ;
  - un bouton **"Importer flight_prices.json"** charge automatiquement les
    prix collectés par `track_flights.py` et/ou `track_flights_amadeus.py`
    (voir ci-dessous), avec déduplication.

## Suivi de prix automatisé en local (optionnel)

Deux scripts indépendants, qui écrivent tous les deux dans les mêmes
`flight_prices.csv` / `flight_prices.json` (tu peux utiliser l'un, l'autre,
ou les deux) :

| | `track_flights.py` | `track_flights_amadeus.py` |
|---|---|---|
| Source | Google Flights (indirectement) | API officielle Amadeus |
| Installation | `pip install -r requirements.txt` | idem + clé gratuite |
| Stabilité | scraper non officiel, peut casser | API documentée, plus stable |
| Compte requis | non | oui (gratuit, ~5 min) |

### `track_flights.py` — via fast-flights

Plutôt que de re-développer un scraper Google Flights (aucune API publique
n'existe), ce dépôt s'appuie sur un outil libre déjà écrit et maintenu :
[**fast-flights**](https://github.com/AWeirdDev/flights) (licence MIT). Cette
librairie Python interroge directement le moteur interne de Google Flights
(format Protobuf) sans navigateur headless — rapide, et sans clé d'API.

```bash
pip install -r requirements.txt
python3 track_flights.py
```

À chaque exécution, le script :
1. cherche l'aller-retour CDG ↔ Haneda (HND), sans escale, aux dates du
   voyage (8 mai → 7 juin 2027 par défaut, modifiable en tête du fichier) ;
2. affiche le meilleur prix trouvé dans le terminal ;
3. l'ajoute à `flight_prices.csv` (historique local, jamais écrasé) ;
4. met à jour `flight_prices.json`, à importer dans l'appli via le bouton
   **"Importer flight_prices.json"** du bloc "Vols Paris CDG → Tokyo".

Pour l'automatiser (optionnel), un simple cron suffit — pas besoin de plus,
et éviter de lancer le script trop souvent limite le risque d'être bridé par
Google :
```bash
# tous les jours à 9h
0 9 * * * cd /chemin/vers/Japaney && /usr/bin/python3 track_flights.py >> flight_tracker.log 2>&1
```

⚠️ `fast-flights` n'est pas une API officielle Google : c'est un outil
communautaire qui peut casser si Google modifie son format, ou se faire
limiter en cas d'usage trop intensif. C'est pour ça qu'on l'utilise
ponctuellement (voire une fois par jour via cron), et jamais depuis le
navigateur (qui ne pourrait de toute façon pas l'appeler directement : CORS
+ absence d'API publique).

### `track_flights_amadeus.py` — via l'API officielle Amadeus

[Amadeus for Developers](https://developers.amadeus.com) propose une vraie
API REST documentée (Flight Offers Search), avec un accès de test gratuit
(aucune carte bancaire requise) :

1. Crée un compte sur https://developers.amadeus.com/register puis, dans
   "My Self-Service Apps", crée une application pour obtenir une **API Key**
   (client id) et un **API Secret** (client secret).
2. Renseigne ces identifiants (au choix) :
   ```bash
   export AMADEUS_CLIENT_ID="..."
   export AMADEUS_CLIENT_SECRET="..."
   ```
   ou dans un fichier `amadeus_credentials.json` local (jamais commit, déjà
   dans `.gitignore`) :
   ```json
   { "client_id": "...", "client_secret": "..." }
   ```
3. Lance :
   ```bash
   pip install -r requirements.txt
   python3 track_flights_amadeus.py
   ```

Même comportement que `track_flights.py` (recherche CDG ↔ HND sans escale,
journal CSV, export JSON importable), mais via une API stable plutôt qu'un
scraper. L'environnement de test Amadeus est gratuit en permanence pour un
usage personnel raisonnable, mais ses tarifs peuvent avoir un léger
décalage par rapport au prix affiché en direct sur un site marchand.

## Structure

```
index.html               structure de la page + template de carte "objectif"
style.css                design mobile-first, thème clair/sombre automatique
app.js                   état, calculs (progression, effort requis, taux de change), rendu
track_flights.py         suivi de prix via fast-flights (Google Flights, sans clé)
track_flights_amadeus.py suivi de prix via l'API officielle Amadeus (clé gratuite)
requirements.txt         dépendances Python des deux scripts de suivi
```

## Personnaliser

Les montants et dates par défaut sont modifiables directement dans
l'interface (champs éditables sur chaque carte), ou dans `defaultState()`
en haut de `app.js` si tu préfères changer les valeurs de départ.
