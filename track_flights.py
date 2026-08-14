#!/usr/bin/env python3
"""
Suivi local des prix de vols Paris CDG -> Tokyo Haneda (aller-retour, sans
escale) pour l'objectif "Voyage 1 mois" de Japaney.

Ce script n'est PAS un scraper maison : il s'appuie sur la librairie libre
`fast-flights` (MIT, https://github.com/AWeirdDev/flights), qui interroge
directement le moteur interne de Google Flights (format Protobuf) sans
navigateur headless. Ce n'est pas une API officielle Google (elle peut casser
si Google change son format), mais c'est un outil déjà écrit, maintenu par
quelqu'un d'autre, et réutilisable tel quel.

Installation :
    pip install -r requirements.txt

Utilisation (recherche ponctuelle) :
    python3 track_flights.py

Chaque exécution :
  1. interroge Google Flights pour l'aller-retour CDG <-> HND, sans escale
  2. affiche le meilleur prix trouvé dans le terminal
  3. ajoute une ligne à flight_prices.csv (historique local)
  4. met à jour flight_prices.json, importable dans l'appli web Japaney via
     le bouton "Importer" du bloc "Vols Paris CDG -> Tokyo"

Pour automatiser en local (optionnel, à ajouter toi-même), un simple cron
suffit -- par exemple une fois par jour à 9h, pour ne pas se faire limiter :
    0 9 * * * cd /chemin/vers/Japaney && /usr/bin/python3 track_flights.py >> flight_tracker.log 2>&1

Voir aussi track_flights_amadeus.py : une deuxième source de prix basée sur
une vraie API officielle (Amadeus for Developers, gratuite avec clé), plus
stable que ce scraper mais nécessitant une inscription. Les deux scripts
écrivent dans les mêmes flight_prices.csv / flight_prices.json.
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

try:
    from fast_flights import (
        FlightQuery,
        FlightsNotFound,
        Passengers,
        create_query,
        get_flights,
    )
except ImportError:
    sys.exit(
        "La librairie 'fast-flights' n'est pas installée.\n"
        "Installe-la avec : pip install -r requirements.txt"
    )

# --- Configuration : garde ces dates synchronisées avec l'objectif "Voyage 1
# mois" dans l'appli (index.html / app.js) si tu les changes. ---
ORIGIN = "CDG"
DESTINATION = "HND"
DEPART_DATE = "2027-05-08"
RETURN_DATE = "2027-06-07"
ADULTS = 1
SEAT = "economy"

CSV_PATH = Path(__file__).parent / "flight_prices.csv"
JSON_PATH = Path(__file__).parent / "flight_prices.json"


def google_flights_link() -> str:
    """Même lien de secours que celui utilisé dans l'appli web, pour
    retrouver facilement l'offre en cas de doute sur le prix relevé."""
    q = (
        f"Flights from Paris to Tokyo Haneda on {DEPART_DATE} "
        f"through {RETURN_DATE} nonstop"
    )
    return f"https://www.google.com/travel/flights?hl=fr&curr=EUR&q={quote(q)}"


def main() -> None:
    print(
        f"Recherche {ORIGIN} <-> {DESTINATION}, {DEPART_DATE} / {RETURN_DATE}, "
        "sans escale, via fast-flights...\n"
    )

    query = create_query(
        flights=[
            FlightQuery(
                date=DEPART_DATE,
                from_airport=ORIGIN,
                to_airport=DESTINATION,
                max_stops=0,
            ),
            FlightQuery(
                date=RETURN_DATE,
                from_airport=DESTINATION,
                to_airport=ORIGIN,
                max_stops=0,
            ),
        ],
        trip="round-trip",
        seat=SEAT,
        passengers=Passengers(adults=ADULTS),
        language="fr",
        currency="EUR",
    )

    try:
        results = get_flights(query)
    except FlightsNotFound:
        sys.exit("Aucun vol sans escale trouvé pour ces dates.")
    except Exception as e:  # réseau, changement de format côté Google, etc.
        sys.exit(f"Échec de la recherche : {e}")

    if not results:
        sys.exit("Aucun résultat retourné.")

    best = min(results, key=lambda itinerary: itinerary.price)

    print(f"Meilleur prix trouvé : {best.price} € — {', '.join(best.airlines)}")
    for leg in best.flights:
        print(
            f"  {leg.from_airport.code} -> {leg.to_airport.code}  "
            f"({leg.duration} min, {leg.plane_type})"
        )

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    today = now_iso[:10]

    # 1) journal local (append, jamais écrasé)
    is_new_csv = not CSV_PATH.exists()
    with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new_csv:
            writer.writerow(["timestamp", "price_eur", "airlines", "depart", "return", "source"])
        writer.writerow([now_iso, best.price, "/".join(best.airlines), DEPART_DATE, RETURN_DATE, "fast-flights"])

    # 2) export au format attendu par le carnet de prix de l'appli Japaney
    entries = []
    if JSON_PATH.exists():
        try:
            entries = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            entries = []
    entries.insert(
        0,
        {
            "id": f"track-{now_iso}",
            "loggedDate": today,
            "price": best.price,
            "airline": "/".join(best.airlines),
            "link": google_flights_link(),
            "source": "fast-flights",
        },
    )
    JSON_PATH.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nJournal mis à jour : {CSV_PATH.name}")
    print(f"Export pour Japaney : {JSON_PATH.name} (bouton \"Importer\" dans l'appli)")


if __name__ == "__main__":
    main()
