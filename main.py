import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import os
import csv
import json

load_dotenv()

EMAIL = os.getenv("LEAGUE_EMAIL")
PASSWORD = os.getenv("LEAGUE_PASSWORD")

if not EMAIL or not PASSWORD:
    print("❌ Missing credentials in .env file")
    exit()

LEAGUE_URLS = [
    "https://bluegrassultimate.org/e/2024-indoor-league",
    "https://bluegrassultimate.org/e/indoor-session-2-the-eras-league",
    "https://bluegrassultimate.org/e/indoor-league-2025-session-1",
    "https://bluegrassultimate.org/e/indoor-league-2",
    "https://bluegrassultimate.org/e/2026-indoor-session-1",
    "https://bluegrassultimate.org/e/2026-indoor-session-2",
]

session = requests.Session()

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://bluegrassultimate.org/signin",
    "Origin": "https://bluegrassultimate.org",
}

# ── Step 1: Authenticate ──────────────────────────────────────────────────────
print("Fetching signin page...")
login_page = session.get("https://bluegrassultimate.org/signin", headers=headers)
soup = BeautifulSoup(login_page.text, "html.parser")

connect_id_input = soup.find("input", {"name": "connect_id"})
if not connect_id_input:
    print("❌ Could not find connect_id on signin page")
    exit()

connect_id = connect_id_input["value"]
print(f"✅ Got connect_id: {connect_id}")

payload = {
    "signin[xvz32]": "",
    "signin[email]": EMAIL,
    "signin[account]": "exists",
    "signin[password]": PASSWORD,
    "signin[return_url]": "https://bluegrassultimate.org/",
    "signin[family_id]": "",
    "connect_id": connect_id,
}

post_headers = {**headers, "Content-Type": "application/x-www-form-urlencoded"}
response = session.post(
    "https://bluegrassultimate.org/signin",
    data=payload,
    headers=post_headers,
    allow_redirects=True
)

if response.status_code == 200 and ("Sign Out" in response.text or EMAIL.split("@")[0].lower() in response.text.lower()):
    print("✅ Login successful!\n")
else:
    print(f"❌ Login failed (status {response.status_code})")
    exit()


# ── Step 2: Scrape each league ────────────────────────────────────────────────
def scrape_teams(league_url):
    teams_url = league_url.rstrip("/") + "/teams"
    print(f"Scraping: {teams_url}")

    page = session.get(teams_url, headers=headers)
    if page.status_code != 200:
        print(f"  ❌ Failed to fetch {teams_url} (status {page.status_code})")
        return None

    soup = BeautifulSoup(page.text, "html.parser")

    league_name_tag = soup.find("h2")
    league_name = league_name_tag.get_text(strip=True) if league_name_tag else league_url.split("/")[-1]

    teams = []

    for team_wrapper in soup.select(".media-item-wrapper"):
        team_name_tag = team_wrapper.select_one(".media-item-tile-overlay h3")
        if not team_name_tag:
            continue
        team_name = team_name_tag.get_text(strip=True)

        players = []

        # Fix: target only inner lis inside each gender cluster to avoid duplicates
        for player_li in team_wrapper.select(".gender-cluster ul li"):
            name_tag = player_li.select_one("a.plain-link")
            roles_tag = player_li.select_one("[data-field='roles']")

            if not name_tag:
                continue

            name = name_tag.get_text(strip=True)
            roles = roles_tag.get_text(strip=True) if roles_tag else ""
            players.append({"name": name, "roles": roles})

        teams.append({"team": team_name, "players": players})

    return {"league": league_name, "url": league_url, "teams": teams}

# ── Step 2.1: Scrape each game ────────────────────────────────────────────────
def scrape_schedule(league_url, league_name):
    schedule_url = league_url.rstrip("/") + "/schedule"
    print(f"Scraping schedule: {schedule_url}")

    page = session.get(schedule_url, headers=headers)
    if page.status_code != 200:
        print(f"  ❌ Failed to fetch {schedule_url} (status {page.status_code})")
        return []

    soup = BeautifulSoup(page.text, "html.parser")

    # ── Build the correct schedule URL ────────────────────────────────────────
    # Try to find a stage tab link (e.g. /schedule/stage/162434)
    # and check for a division filter in the form (e.g. division/Participation)
    stage_link = soup.select_one("a.ajax-remote[href*='/schedule/stage/']")

    if stage_link:
        stage_href = stage_link["href"]  # e.g. /e/foo/schedule/stage/162434

        # Check if the schedule filter form has a division select with a selected option
        division_select = soup.select_one("form.game-filters select[name='division']")
        selected_division = None
        if division_select:
            selected_opt = division_select.select_one("option[selected]")
            if selected_opt:
                selected_division = selected_opt["value"]

        # Build full URL: always fetch all game types
        full_schedule_url = f"https://bluegrassultimate.org{stage_href}/game_type/all"
        if selected_division:
            # Insert division before game_type
            full_schedule_url = f"https://bluegrassultimate.org{stage_href}/division/{selected_division}/game_type/all"
    else:
        # No stage tab found — fall back to the base schedule URL
        full_schedule_url = schedule_url

    # If the constructed URL differs from what we already fetched, re-fetch it
    if full_schedule_url != schedule_url:
        print(f"  → Fetching full schedule: {full_schedule_url}")
        page = session.get(full_schedule_url, headers=headers)
        if page.status_code != 200:
            print(f"  ❌ Failed to fetch {full_schedule_url} (status {page.status_code})")
            return []
        soup = BeautifulSoup(page.text, "html.parser")

    # ── Parse games ───────────────────────────────────────────────────────────
    games = []

    for game in soup.select(".game-list-item"):
        date_el = game.select_one(".flex-basis-md-15")
        date_raw = date_el.get_text(separator=" ", strip=True) if date_el else ""

        left = game.select_one(".flex-basis-45:first-child")
        right = game.select_one(".flex-basis-45:last-child")

        if not left or not right:
            continue

        left_name_tag = left.select_one("a.plain-link span.btn-label")
        right_name_tag = right.select_one("a.plain-link span.btn-label")

        if not left_name_tag or not right_name_tag:
            continue

        left_name = left_name_tag.get_text(strip=True)
        right_name = right_name_tag.get_text(strip=True)

        left_score_tag = left.select_one(".score")
        right_score_tag = right.select_one(".score")

        # Case 1: No score tags → unreported
        if not left_score_tag or not right_score_tag:
            games.append({
                "league": league_name,
                "league_url": league_url,
                "date_time": date_raw,
                "home_team": left_name,
                "home_score": 0,
                "home_result": "unreported",
                "away_team": right_name,
                "away_score": 0,
                "away_result": "unreported",
            })
            continue

        left_score_raw = left_score_tag.get_text(strip=True)
        right_score_raw = right_score_tag.get_text(strip=True)
        left_classes = left_score_tag.get("class", [])

        # Case 2: W/L scores
        if left_score_raw.upper() in ("W", "L") or right_score_raw.upper() in ("W", "L"):
            if left_score_raw.upper() == "W":
                left_score, right_score = 1, 0
                left_result, right_result = "win", "loss"
            else:
                left_score, right_score = 0, 1
                left_result, right_result = "loss", "win"

        # Case 3: Numeric scores
        else:
            try:
                left_score = int(left_score_raw)
                right_score = int(right_score_raw)
            except ValueError:
                games.append({
                    "league": league_name,
                    "league_url": league_url,
                    "date_time": date_raw,
                    "home_team": left_name,
                    "home_score": 0,
                    "home_result": "unreported",
                    "away_team": right_name,
                    "away_score": 0,
                    "away_result": "unreported",
                })
                continue

            if "win" in left_classes:
                left_result, right_result = "win", "loss"
            elif "loss" in left_classes:
                left_result, right_result = "loss", "win"
            else:
                left_result, right_result = "tie", "tie"

        games.append({
            "league": league_name,
            "league_url": league_url,
            "date_time": date_raw,
            "home_team": left_name,
            "home_score": left_score,
            "home_result": left_result,
            "away_team": right_name,
            "away_score": right_score,
            "away_result": right_result,
        })

    return games

# ── Step 3: Run team scraper ───────────────────────────────────────────────────────
all_leagues = []
all_rows = []  # flat rows for CSV
all_games = []

for url in LEAGUE_URLS:
    result = scrape_teams(url)
    if not result:
        continue

    all_leagues.append(result)
    print(f"  ✅ Found {len(result['teams'])} teams in '{result['league']}'")

    for team in result["teams"]:
        print(f"\n    🏅 {team['team']} ({len(team['players'])} players)")
        for p in team["players"]:
            roles = p["roles"]
            print(f"       {p['name']} — {roles}")
            all_rows.append({
                "league": result["league"],
                "league_url": result["url"],
                "team": team["team"],
                "player_name": p["name"],
                "roles": roles,
            })
    print()

# ── Step 3.1: Run game scraper ───────────────────────────────────────────────────────

    # Scrape schedule too
    league_name_for_schedule = result["league"] if result else url.split("/")[-1]
    games = scrape_schedule(url, league_name_for_schedule)
    all_games.extend(games)
    print(f"  ✅ Found {len(games)} games in schedule")
    print()


# ── Step 4: Save to CSV (for analysis) ───────────────────────────────────────
csv_file = "league_rosters.csv"
with open(csv_file, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["league", "league_url", "team", "player_name", "roles"])
    writer.writeheader()
    writer.writerows(all_rows)
print(f"💾 Saved roster CSV to {csv_file}")

games_csv = "league_results.csv"
with open(games_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "league", "league_url", "date_time",
        "home_team", "home_score", "home_result",
        "away_team", "away_score", "away_result",
    ])
    writer.writeheader()
    writer.writerows(all_games)
print(f"💾 Saved game results to {games_csv}")

# # ── Step 5: Save to JSON (for reference/nesting) ─────────────────────────────
# json_file = "league_rosters.json"
# with open(json_file, "w", encoding="utf-8") as f:
#     json.dump(all_leagues, f, indent=2, ensure_ascii=False)
# print(f"💾 Saved nested JSON to {json_file}")