#!/usr/bin/env python3
"""
Suivi local des prix de vols Paris CDG -> Tokyo Haneda via l'API officielle
et gratuite Amadeus for Developers (Flight Offers Search), en complément de
track_flights.py (fast-flights / Google Flights).

Pourquoi une deuxième source ? Amadeus est une vraie API documentée avec
compte développeur (pas du scraping) : plus stable dans le temps, mais
nécessite une clé gratuite. fast-flights reste utile car il donne
(indirectement) les prix affichés sur Google Flights lui-même.

1) Créer une clé gratuite (5 min, aucune carte bancaire requise) :
   - https://developers.amadeus.com/register
   - une fois connecté : "My Self-Service Apps" -> "Create new app"
   - récupère l'"API Key" (= client id) et l'"API Secret" (= client secret)
     de l'environnement de test

2) Renseigner les identifiants, au choix :
   a) variables d'environnement (recommandé, jamais commit) :
        export AMADEUS_CLIENT_ID="..."
        export AMADEUS_CLIENT_SECRET="..."
   b) fichier local amadeus_credentials.json (ignoré par git, voir .gitignore) :
        {"client_id": "...", "client_secret": "..."}

3) Installer les dépendances puis lancer :
        pip install -r requirements.txt
        python3 track_flights_amadeus.py

Comme track_flights.py, ce script journalise dans flight_prices.csv et met
à jour flight_prices.json (à importer dans l'appli via le bouton
"Importer flight_prices.json").

Note : l'environnement de test Amadeus (gratuit) renvoie des tarifs réels
issus des compagnies, mais parfois avec un peu de retard/cache par rapport
au prix affiché en direct sur le site d'une compagnie ou Google Flights.
Si la recherche ne renvoie aucun résultat, c'est en général que les
compagnies n'ont pas encore ouvert la vente pour ces dates -- réessaie
plus tard.
"""

import csv
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

# --- Configuration : garde ces dates synchronisées avec l'objectif "Voyage 1
# mois" dans l'appli (index.html / app.js) et avec track_flights.py. ---
ORIGIN = "CDG"
DESTINATION = "HND"
DEPART_DATE = "2027-05-08"
RETURN_DATE = "2027-06-07"
ADULTS = 1
CURRENCY = "EUR"

# Environnement de test (gratuit). Passe à "https://api.amadeus.com" si tu
# migres un jour vers l'environnement de production Amadeus.
BASE_URL = "https://test.api.amadeus.com"

CSV_PATH = Path(__file__).parent / "flight_prices.csv"
JSON_PATH = Path(__file__).parent / "flight_prices.json"
CREDENTIALS_PATH = Path(__file__).parent / "amadeus_credentials.json"


def load_credentials() -> tuple[str, str]:
    client_id = os.environ.get("AMADEUS_CLIENT_ID")
    client_secret = os.environ.get("AMADEUS_CLIENT_SECRET")
    if client_id and client_secret:
        return client_id, client_secret

    if CREDENTIALS_PATH.exists():
        try:
            data = json.loads(CREDENTIALS_PATH.read_text(encoding="utf-8"))
            if data.get("client_id") and data.get("client_secret"):
                return data["client_id"], data["client_secret"]
        except (json.JSONDecodeError, OSError):
            pass

    sys.exit(
        "Identifiants Amadeus manquants.\n"
        "Crée une clé gratuite sur https://developers.amadeus.com/register puis "
        "renseigne AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET (variables "
        "d'environnement) ou amadeus_credentials.json -- voir l'en-tête de ce fichier."
    )


def get_access_token(client_id: str, client_secret: str) -> str:
    res = requests.post(
        f"{BASE_URL}/v1/security/oauth2/token",
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=15,
    )
    if res.status_code != 200:
        sys.exit(f"Échec de l'authentification Amadeus ({res.status_code}) : {res.text}")
    return res.json()["access_token"]


def search_flights(token: str) -> list:
    res = requests.get(
        f"{BASE_URL}/v2/shopping/flight-offers",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "originLocationCode": ORIGIN,
            "destinationLocationCode": DESTINATION,
            "departureDate": DEPART_DATE,
            "returnDate": RETURN_DATE,
            "adults": ADULTS,
            "nonStop": "true",
            "currencyCode": CURRENCY,
            "max": 15,
        },
        timeout=20,
    )
    if res.status_code != 200:
        sys.exit(f"Échec de la recherche Amadeus ({res.status_code}) : {res.text}")
    return res.json().get("data", [])


def airlines_from_offer(offer: dict) -> str:
    codes = set()
    for itinerary in offer.get("itineraries", []):
        for segment in itinerary.get("segments", []):
            code = segment.get("carrierCode")
            if code:
                codes.add(code)
    return "/".join(sorted(codes)) if codes else "?"


def google_flights_link() -> str:
    """Lien de vérification/réservation -- Amadeus donne un prix, pas un lien
    de réservation grand public directement exploitable ici."""
    q = (
        f"Flights from Paris to Tokyo Haneda on {DEPART_DATE} "
        f"through {RETURN_DATE} nonstop"
    )
    return f"https://www.google.com/travel/flights?hl=fr&curr=EUR&q={quote(q)}"


def main() -> None:
    client_id, client_secret = load_credentials()

    print(
        f"Recherche {ORIGIN} <-> {DESTINATION}, {DEPART_DATE} / {RETURN_DATE}, "
        "sans escale, via l'API Amadeus...\n"
    )

    token = get_access_token(client_id, client_secret)
    offers = search_flights(token)

    if not offers:
        sys.exit(
            "Aucun vol sans escale trouvé pour ces dates (les compagnies n'ont "
            "peut-être pas encore ouvert la vente). Réessaie plus tard."
        )

    best = min(offers, key=lambda o: float(o["price"]["total"]))
    price = float(best["price"]["total"])
    airlines = airlines_from_offer(best)

    print(f"Meilleur prix trouvé : {price:.2f} {CURRENCY} — compagnies : {airlines}")
    for i, itinerary in enumerate(best.get("itineraries", [])):
        leg = "aller" if i == 0 else "retour"
        segments = itinerary.get("segments", [])
        if segments:
            seg = segments[0]
            dep = seg.get("departure", {})
            arr = seg.get("arrival", {})
            print(
                f"  {leg}: {dep.get('iataCode')} -> {arr.get('iataCode')}  "
                f"({seg.get('carrierCode')}{seg.get('number', '')}, {itinerary.get('duration', '')})"
            )

    now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
    today = now_iso[:10]

    is_new_csv = not CSV_PATH.exists()
    with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new_csv:
            writer.writerow(["timestamp", "price_eur", "airlines", "depart", "return", "source"])
        writer.writerow([now_iso, price, airlines, DEPART_DATE, RETURN_DATE, "amadeus"])

    entries = []
    if JSON_PATH.exists():
        try:
            entries = json.loads(JSON_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            entries = []
    entries.insert(
        0,
        {
            "id": f"amadeus-{now_iso}",
            "loggedDate": today,
            "price": price,
            "airline": airlines,
            "link": google_flights_link(),
            "source": "amadeus",
        },
    )
    JSON_PATH.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nJournal mis à jour : {CSV_PATH.name}")
    print(f"Export pour Japaney : {JSON_PATH.name} (bouton \"Importer\" dans l'appli)")


if __name__ == "__main__":
    main()
