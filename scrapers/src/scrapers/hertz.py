"""
Hertz scraper — uses Playwright to intercept Hertz's internal JSON API.

Strategy: Hertz.com is a React SPA that calls an internal REST API when the
search results page loads. We navigate the booking flow, intercept the network
responses, and parse the vehicle list from the captured JSON — no DOM scraping.

Intercepted endpoint pattern: /rentacar/reservation/... (XHR/fetch)

Rate limiting: add a random delay between requests. Hertz does not have a
public API, so use responsibly and respect their ToS. This scraper is intended
for personal/open-source use only.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import random
import re
from datetime import datetime

from playwright.async_api import async_playwright, Page, Response

from scrapers.base import BaseScraper
from models import CarOffer, CarSearchParams, map_vehicle_category, to_cents
from logger import get_logger

log = get_logger("hertz-scraper")

# False locally (so you can watch the browser), True in Docker/CI where there's no display
_HEADLESS = os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower() != "false"

BASE_URL = "https://www.hertz.com"
SEARCH_URL = f"{BASE_URL}/rentacar/reservation/"

# Hertz internal API — confirmed via HAR inspection (May 2026)
# POST /rentacar/rest/hertz/v2/itinerary/vehicles returns data.model.vehicles
_RESULT_URL_PATTERNS = [
    re.compile(r"/rentacar/rest/hertz/v2/itinerary/vehicles", re.IGNORECASE),
]

# Selectors confirmed via HAR inspection of hertz.com/rentacar/reservation/
_SEL_PICKUP = '#pickup-location'            # input[name="pickupLocation"]
_SEL_DROPOFF = '#dropoff-location'          # input[name="dropoffLocation"]
_SEL_PICKUP_DATE = '#pickup-date-box'       # div.date — click opens calendar
_SEL_DROPOFF_DATE = '#dropoff-date-box'     # div.date — click opens calendar
_SEL_SUBMIT = 'button.res-submit'           # "Continue" button (class="res-submit primary")

# Ordered list of selectors to try for autocomplete suggestions
_AUTOCOMPLETE_SELECTORS = [
    '.ww-item',
    '[class*="suggestion"]',
    '[class*="autocomplete"] li',
    '[role="option"]',
    'li[class*="location"]',
]

# Ordered list of selectors to try for the calendar panel
_CALENDAR_PANEL_SELECTORS = [
    '.calendar .month.dual',
    '[class*="calendar"] [class*="month"]',
    '[class*="datepicker"] [class*="month"]',
    '[class*="calendar-month"]',
]


async def _screenshot(page: Page, name: str) -> None:
    path = f"/tmp/hertz_debug_{name}.png"
    try:
        await page.screenshot(path=path)
        print(f"[hertz] screenshot saved: {path}")
    except Exception:
        pass


def _offer_id(vehicle: dict, params: CarSearchParams) -> str:
    """Deterministic offer ID from vehicle data + search context."""
    quotes = vehicle.get("quotes") or [{}]
    quote_id = quotes[0].get("id") or ""       # e.g. "MBMR-1"
    sipp = vehicle.get("sipp") or vehicle.get("carGroup") or ""
    vehicle_index = str(vehicle.get("vehicleIndex") or "")
    key = f"{quote_id}-{sipp}-{vehicle_index}-{params.pickup_location}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def _rental_days(params: CarSearchParams) -> int:
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    try:
        pickup = datetime.strptime(params.pickup_datetime, fmt)
        dropoff = datetime.strptime(params.dropoff_datetime, fmt)
        return max(1, math.ceil((dropoff - pickup).total_seconds() / 86400))
    except ValueError:
        return 1


def _parse_passengers(raw: str | int | None) -> int | None:
    """Parse '4 Passengers' or 4 → 4."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    digits = re.sub(r"[^\d]", "", str(raw))
    return int(digits) if digits else None


def _normalize_vehicle(vehicle: dict, params: CarSearchParams, search_job_id: str) -> CarOffer | None:
    """Map a raw Hertz vehicle dict to a CarOffer. Returns None if data is incomplete.

    Hertz API response structure (confirmed via HAR, May 2026):
      data.model.vehicles[i].quotes[0].price  — price string e.g. "1246.72"
      data.model.vehicles[i].sipp             — SIPP code e.g. "MBMR"
      data.model.vehicles[i].sippDisplay      — "Mini, 2-3 Door, Manual, Aircon, MBMR"
      data.model.vehicles[i].automatic        — 0 (manual) or 1 (automatic)
      data.model.vehicles[i].airConditioning  — "Air Conditioning" string or ""
      data.model.vehicles[i].passengers       — "4 Passengers" string
      data.model.vehicles[i].noOfSmallSuitcases / noOfLargeSuitcases
    """
    try:
        quotes = vehicle.get("quotes") or []
        best_quote = quotes[0] if quotes else {}

        price_str = best_quote.get("price") or vehicle.get("price") or "0"
        total_float = float(str(price_str).replace(",", "")) if price_str else 0.0
        currency = (
            best_quote.get("currency")
            or vehicle.get("currency")
            or params.currency
        )

        if total_float <= 0:
            print(f"[hertz] skip vehicle (price=0): sipp={vehicle.get('sipp')} name={vehicle.get('name')}")
            return None

        days = _rental_days(params)
        price_total = to_cents(total_float)
        price_per_day = max(1, price_total // days)

        vehicle_name = vehicle.get("name") or vehicle.get("vehicleName") or "Unknown Vehicle"
        vehicle_class = vehicle.get("sipp") or vehicle.get("sippCode") or ""

        # Extract category from sippDisplay first word e.g. "Mini, 2-3 Door..." → "mini"
        sipp_display = vehicle.get("sippDisplay") or vehicle.get("carTypeDisplay") or ""
        raw_category = sipp_display.split(",")[0].strip().lower() if sipp_display else ""
        if not raw_category:
            raw_category = vehicle.get("carGroup") or "economy"
        vehicle_category = map_vehicle_category(raw_category)

        # Passengers: "4 Passengers" string
        seats = _parse_passengers(vehicle.get("passengers"))
        # Bags: sum of suitcase counts
        bags = (
            (vehicle.get("noOfSmallSuitcases") or 0)
            + (vehicle.get("noOfMediumSuitcases") or 0)
            + (vehicle.get("noOfLargeSuitcases") or 0)
        ) or None

        # automatic: 0=manual, 1=automatic (int field, not string)
        is_automatic = vehicle.get("automatic") == 1

        # airConditioning: non-empty string means AC present
        has_ac = bool(vehicle.get("airConditioning"))

        booking_url = best_quote.get("href")
        if booking_url and not booking_url.startswith("http"):
            booking_url = BASE_URL + booking_url
        if not booking_url:
            booking_url = f"{BASE_URL}/rentacar/reservation/"

        return CarOffer(
            search_job_id=search_job_id,
            provider_name="hertz",
            provider_offer_id=_offer_id(vehicle, params),
            vehicle_type=vehicle_category,
            vehicle_name=str(vehicle_name),
            vehicle_class=str(vehicle_class),
            price_total=price_total,
            price_currency=str(currency).upper()[:3] if currency else params.currency,
            price_per_day=price_per_day,
            pickup_location=params.pickup_location,
            dropoff_location=params.dropoff_location,
            pickup_datetime=params.pickup_datetime,
            dropoff_datetime=params.dropoff_datetime,
            rental_days=days,
            has_ac=has_ac,
            is_automatic=is_automatic,
            seats_count=seats,
            bag_count=bags,
            booking_url=str(booking_url),
        )
    except Exception as exc:
        print(f"[hertz] normalize_failed: {exc} | keys={list(vehicle.keys())}")
        log.warning("normalize_failed", error=str(exc), vehicle_keys=list(vehicle.keys()))
        return None


def _extract_vehicles(data: dict | list) -> list[dict]:
    """Extract vehicle list from a Hertz API response.

    Primary path (confirmed HAR May 2026): data.model.vehicles
    Falls back to recursive search for resilience against future API changes.
    """
    if isinstance(data, dict):
        # Primary: data.model.vehicles
        try:
            vehicles = data["data"]["model"]["vehicles"]
            if isinstance(vehicles, list) and vehicles:
                print(f"[hertz] found {len(vehicles)} vehicles at data.model.vehicles")
                return vehicles
        except (KeyError, TypeError):
            pass

        # Fallback: recursive search for any "vehicles" key
        for key in ("vehicles", "vehicleList", "results", "items", "offers", "cars"):
            if key in data and isinstance(data[key], list) and data[key]:
                candidate = data[key]
                if isinstance(candidate[0], dict) and any(
                    k in candidate[0] for k in ("sipp", "quotes", "carGroup", "price")
                ):
                    print(f"[hertz] found {len(candidate)} vehicles at key '{key}'")
                    return candidate

        for value in data.values():
            if isinstance(value, (dict, list)):
                result = _extract_vehicles(value)
                if result:
                    return result

    elif isinstance(data, list):
        if data and isinstance(data[0], dict) and any(
            k in data[0] for k in ("sipp", "quotes", "carGroup", "vehicleIndex")
        ):
            return data
        for item in data:
            result = _extract_vehicles(item)
            if result:
                return result

    return []


async def _scrape_dom_vehicles(page: Page) -> list[dict]:
    """Extract vehicle data directly from .vehicle.vehCardRD cards in the DOM."""
    cards = page.locator(".vehicle.vehCardRD")
    count = await cards.count()
    print(f"[hertz] DOM vehicle cards found: {count}")
    vehicles = []
    for i in range(count):
        try:
            card = cards.nth(i)
            sipp = await card.get_attribute("data-sipp") or ""

            name = await card.locator(".gtm-vehicle-title").first.inner_text()
            desc = await card.locator(".gtm-vehicle-type").first.inner_text()

            passengers = await card.locator(".gtm-vehFeature-passengers .gtm-vehFeatureDesc").first.inner_text()
            suitcases = await card.locator(".gtm-vehFeature-suitcases .gtm-vehFeatureDesc").first.inner_text()
            transmission_code = await card.locator(".gtm-vehFeature-transmission .gtm-vehFeatureDesc").first.inner_text()

            price_el = card.locator(".gtm-price-cont.gtm-paynow .gtm-price").first
            price_text = (await price_el.inner_text()).strip() if await price_el.count() > 0 else "0"
            currency_el = card.locator(".gtm-price-cont.gtm-paynow .gtm-price-currency-per").first
            currency = (await currency_el.inner_text()).strip() if await currency_el.count() > 0 else "EUR"

            has_ac = await card.locator(".icons-snow_flake").count() > 0

            price_val = float(re.sub(r"[^\d.]", "", price_text) or "0")

            vehicle = {
                "vehicleCode": sipp,
                "sippCode": sipp,
                "vehicleName": name.strip(),
                "description": desc.strip(),
                "passengerCount": int(passengers.strip()) if passengers.strip().isdigit() else None,
                "baggageCount": int(suitcases.strip()) if suitcases.strip().isdigit() else None,
                "transmission": "automatic" if transmission_code.strip().upper() == "A" else "manual",
                "airConditioning": has_ac,
                "price": {"total": price_val, "currency": currency},
                "vehicleCategory": sipp[0] if sipp else "economy",
            }
            print(f"[hertz] card[{i}]: {name.strip()} sipp={sipp} price={price_val} {currency}")
            vehicles.append(vehicle)
        except Exception as exc:
            print(f"[hertz] card[{i}] parse error: {exc}")
    return vehicles


async def _fill_location(page: Page, selector: str, location: str, label: str) -> bool:
    """Fill a location input and wait for autocomplete, then click the first suggestion.

    Returns True if a suggestion was clicked, False if we fell back to ArrowDown+Enter.
    """
    try:
        await page.click(selector, timeout=5_000)
        # Clear any pre-filled value before typing
        await page.triple_click(selector)
        await page.keyboard.press("Backspace")
        await asyncio.sleep(0.3)

        print(f"[hertz] typing {label}: '{location}'")
        await page.type(selector, location, delay=60)

        # Poll for autocomplete suggestions using multiple candidate selectors
        suggestion = None
        for sel in _AUTOCOMPLETE_SELECTORS:
            try:
                loc = page.locator(sel).first
                await loc.wait_for(state="visible", timeout=8_000)
                suggestion = loc
                print(f"[hertz] {label} autocomplete visible via selector: {sel}")
                break
            except Exception:
                continue

        if suggestion:
            await suggestion.click()
            await asyncio.sleep(0.5)
            print(f"[hertz] {label} suggestion clicked")
            return True

        print(f"[hertz] {label} no autocomplete found — using ArrowDown+Enter")
        await _screenshot(page, f"no_autocomplete_{label}")
        await page.keyboard.press("ArrowDown")
        await asyncio.sleep(0.2)
        await page.keyboard.press("Enter")
        await asyncio.sleep(0.3)
        return False

    except Exception as exc:
        await _screenshot(page, f"fill_{label}_failed")
        print(f"[hertz] {label} fill_failed: {exc}")
        log.warning(f"{label}_fill_failed", error=str(exc), selector=selector)
        return False


async def _submit_and_wait(
    page: Page,
    captured_responses: list,
    url_before: str,
) -> bool:
    """Click submit and poll until results appear (URL change, response captured, or DOM cards).

    Returns True if results were detected within timeout.
    """
    print("[hertz] clicking submit ...")

    # Strategy 1: Playwright click
    try:
        await page.locator(_SEL_SUBMIT).first.click(timeout=5_000)
        print("[hertz] submit strategy1: Playwright click done")
    except Exception as exc:
        print(f"[hertz] submit strategy1 failed: {exc}")
        # Strategy 2: JS click on any element matching res-submit class
        try:
            await page.evaluate(
                "() => { const b = document.querySelector('[class*=res-submit]'); if(b) b.click(); }"
            )
            print("[hertz] submit strategy2: JS click done")
        except Exception as exc2:
            print(f"[hertz] submit strategy2 failed: {exc2}")
            # Strategy 3: keyboard Enter
            try:
                await page.locator(_SEL_SUBMIT).first.focus()
                await page.keyboard.press("Enter")
                print("[hertz] submit strategy3: Enter key done")
            except Exception as exc3:
                print(f"[hertz] submit strategy3 failed: {exc3}")
                await _screenshot(page, "submit_all_failed")
                return False

    # Poll up to 25 seconds for results to appear
    deadline = asyncio.get_event_loop().time() + 25
    while asyncio.get_event_loop().time() < deadline:
        if page.url != url_before:
            print(f"[hertz] URL changed → {page.url}")
            return True
        if captured_responses:
            print(f"[hertz] API response captured while waiting")
            return True
        try:
            if await page.locator(".vehicle.vehCardRD").count() > 0:
                print("[hertz] DOM vehicle cards appeared")
                return True
        except Exception:
            pass
        await asyncio.sleep(0.5)

    await _screenshot(page, "submit_timeout")
    print("[hertz] submit timeout — no results detected")
    return False


class HertzScraper(BaseScraper):
    name = "hertz"
    version = "1.1"

    async def ping(self) -> bool:
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=_HEADLESS)
                page = await browser.new_page()
                resp = await page.goto(BASE_URL, timeout=10_000)
                await browser.close()
                return resp is not None and resp.ok
        except Exception:
            return False

    async def search(self, params: CarSearchParams) -> list[CarOffer]:
        captured_responses: list[dict] = []

        async def on_response(response: Response) -> None:
            content_type = response.headers.get("content-type", "")
            # Debug: print every JSON response URL so we can identify patterns
            if "json" in content_type and response.status == 200:
                print(f"[hertz] json_response status={response.status} url={response.url}")

            if response.status != 200:
                return
            if not any(pat.search(response.url) for pat in _RESULT_URL_PATTERNS):
                return
            if "json" not in content_type:
                return
            try:
                data = await response.json()
                captured_responses.append(data)
                print(f"[hertz] CAPTURED response from {response.url}")
                log.debug("intercepted_response", url=response.url)
            except Exception:
                pass

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=_HEADLESS,
                slow_mo=0 if _HEADLESS else 300,
                args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                locale="en-US",
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
            )
            # Patch navigator.webdriver to hide automation
            await context.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            page = await context.new_page()
            page.on("response", on_response)

            dom_vehicles: list[dict] = []
            try:
                print("[hertz] starting _run_search ...")
                await self._run_search(page, params, captured_responses)
                print("[hertz] _run_search done, waiting for network to settle ...")
                await asyncio.sleep(random.uniform(1.5, 2.5))
                try:
                    await page.wait_for_load_state("networkidle", timeout=12_000)
                    print("[hertz] networkidle reached")
                except Exception:
                    print("[hertz] networkidle timeout — continuing anyway")
                # Scrape vehicle cards directly from the DOM
                dom_vehicles = await _scrape_dom_vehicles(page)
                print(f"[hertz] dom_vehicles scraped: {len(dom_vehicles)}")
            except Exception as exc:
                print(f"[hertz] page_error: {exc}")
                await _screenshot(page, "page_error")
                log.warning("page_error", error=str(exc))
            finally:
                print(f"[hertz] closing browser, captured_responses={len(captured_responses)}, dom_vehicles={len(dom_vehicles)}")
                await browser.close()

        # Prefer API responses; fall back to DOM scrape
        vehicles: list[dict] = []
        if captured_responses:
            for data in captured_responses:
                vehicles.extend(_extract_vehicles(data))
            log.info("raw_vehicles_found_api", count=len(vehicles))
            if vehicles:
                print(f"[hertz] sample vehicle keys: {list(vehicles[0].keys())}")
                print(f"[hertz] sample vehicle data: {json.dumps(vehicles[0], indent=2, default=str)[:1000]}")
        elif dom_vehicles:
            vehicles = dom_vehicles
            log.info("raw_vehicles_found_dom", count=len(vehicles))
        else:
            print("[hertz] no vehicles found (API or DOM)")
            log.info("no_responses_captured", pickup=params.pickup_location)
            return []

        offers: list[CarOffer] = []
        for vehicle in vehicles:
            offer = _normalize_vehicle(vehicle, params, search_job_id="")
            if offer:
                offers.append(offer)

        log.info("offers_normalized", count=len(offers), provider="hertz")
        return offers

    async def _run_search(self, page: Page, params: CarSearchParams, captured_responses: list) -> None:
        """Navigate Hertz booking flow and trigger a vehicle search."""
        print("[hertz] goto SEARCH_URL ...")
        await page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=30_000)
        print(f"[hertz] page loaded: {page.url}")
        await _screenshot(page, "01_loaded")

        # Dismiss cookie consent banner if present (Hertz uses securiti.ai consent)
        _COOKIE_SELECTORS = [
            "a.cc-allow",
            "[id*='accept'][class*='cookie']",
            "button[id*='accept']",
            "[class*='consent'] button[class*='accept']",
            "[class*='cookie'] button[class*='allow']",
            "[class*='privaci'] button",
        ]
        for sel in _COOKIE_SELECTORS:
            try:
                await page.click(sel, timeout=2_000)
                print(f"[hertz] cookie banner dismissed via: {sel}")
                await asyncio.sleep(0.3)
                break
            except Exception:
                continue
        else:
            print("[hertz] no cookie banner (or already dismissed)")

        # Small human-like delay
        await asyncio.sleep(random.uniform(0.8, 1.5))

        # Fill pickup location
        print(f"[hertz] filling pickup location: {params.pickup_location}")
        await _fill_location(page, _SEL_PICKUP, params.pickup_location, "pickup")
        await _screenshot(page, "02_pickup_filled")

        # One-way vs same location
        if params.pickup_location != params.dropoff_location:
            print(f"[hertz] filling dropoff location: {params.dropoff_location}")
            await _fill_location(page, _SEL_DROPOFF, params.dropoff_location, "dropoff")
            await _screenshot(page, "03_dropoff_filled")
        else:
            print("[hertz] same pickup/dropoff, skipping dropoff fill")

        # Debug: verify that the hidden location code was set after autocomplete click
        form_state = await page.evaluate("""() => {
            const result = {};
            ['pickup-location','dropoff-location','pickUpLocId','dropOffLocId',
             'pickupLocation','dropoffLocation'].forEach(id => {
                const el = document.getElementById(id) || document.querySelector('[name="'+id+'"]');
                if (el) result[id] = el.value;
            });
            result._hidden = [...document.querySelectorAll('input[type=hidden]')]
                .map(el => ({name: el.name, id: el.id, value: el.value}))
                .filter(x => x.value);
            return result;
        }""")
        print(f"[hertz] form_state: {json.dumps(form_state, default=str)[:1000]}")

        # Dates — calendar datepicker (click-based, not text fill)
        pickup_dt = _parse_datetime(params.pickup_datetime)
        dropoff_dt = _parse_datetime(params.dropoff_datetime)

        print(f"[hertz] picking pickup date: {pickup_dt.date()}")
        try:
            await _pick_calendar_date(page, _SEL_PICKUP_DATE, pickup_dt)
            print("[hertz] pickup date selected")
            await _screenshot(page, "04_pickup_date")
            await asyncio.sleep(0.5)
            print(f"[hertz] picking dropoff date: {dropoff_dt.date()}")
            await _pick_calendar_date(page, _SEL_DROPOFF_DATE, dropoff_dt)
            print("[hertz] dropoff date selected")
            await _screenshot(page, "05_dropoff_date")
        except Exception as exc:
            await _screenshot(page, "date_pick_failed")
            print(f"[hertz] date_pick_failed: {exc}")
            log.warning("date_pick_failed", error=str(exc))

        await _screenshot(page, "06_before_submit")

        # Submit and wait for results
        url_before = page.url
        results_detected = await _submit_and_wait(page, captured_responses, url_before)
        print(f"[hertz] submit done, results_detected={results_detected}, url={page.url}")

        if not results_detected:
            log.warning("submit_no_results_detected", url=page.url)

        # Age overlay — appears after submit, select 25+ and continue
        try:
            dialog = page.get_by_role("dialog", name="Why do we need to ask your age?")
            age_selector = dialog.locator("#ageSelector")
            print("[hertz] waiting for age overlay ...")
            await age_selector.wait_for(state="visible", timeout=10_000)
            print("[hertz] age overlay detected, selecting 25+ ...")
            await age_selector.select_option(value="25")
            await asyncio.sleep(0.3)
            await page.evaluate(
                "() => { const b = document.querySelector('#age-overlay-submit-proxy'); if(b) b.click(); }"
            )
            print("[hertz] age overlay submitted, waiting for results ...")
            await page.wait_for_load_state("domcontentloaded", timeout=20_000)
            print(f"[hertz] post-age page: {page.url}")
            await _screenshot(page, "07_post_age")
        except Exception as exc:
            print(f"[hertz] age_overlay_not_found_or_failed: {exc}")


def _parse_datetime(iso: str) -> datetime:
    try:
        return datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return datetime.strptime(iso[:10], "%Y-%m-%d")


async def _pick_calendar_date(page: Page, trigger_sel: str, target: datetime) -> None:
    """Open the Hertz calendar datepicker and click the target date.

    Hertz uses a dual-month calendar: two .month.dual panels, each with an
    <h1> like "May 2026" and plain <td> cells containing day numbers.
    Navigation forward is via span.next.arrow (visible only on the right panel).
    """
    print(f"[hertz] _pick_calendar_date: clicking trigger '{trigger_sel}'")
    await page.click(trigger_sel, timeout=5_000)
    await asyncio.sleep(0.4)

    # Wait for calendar to appear using multiple candidate selectors
    calendar_panel_sel = None
    for sel in _CALENDAR_PANEL_SELECTORS:
        try:
            await page.locator(sel).first.wait_for(state="visible", timeout=8_000)
            calendar_panel_sel = sel
            print(f"[hertz] calendar panel visible via selector: {sel}")
            break
        except Exception:
            continue

    if calendar_panel_sel is None:
        await _screenshot(page, f"calendar_not_found_{trigger_sel.strip('#')}")
        print(f"[hertz] calendar panel not found for trigger '{trigger_sel}'")
        log.warning("calendar_panel_not_found", trigger=trigger_sel)
        return

    target_month_str = target.strftime("%B %Y")  # "May 2026"
    target_day_str = str(target.day)             # "14" (no leading zero)
    print(f"[hertz] calendar target: {target_month_str} day={target_day_str}")

    for nav_step in range(24):
        month_panels = page.locator(calendar_panel_sel)
        panel_count = await month_panels.count()
        print(f"[hertz] calendar nav_step={nav_step}, panels_visible={panel_count}")

        for i in range(panel_count):
            panel = month_panels.nth(i)
            try:
                header = await panel.locator("h1").inner_text()
            except Exception:
                # Try alternative header selectors if h1 isn't found
                try:
                    header = await panel.locator("[class*='month-title'], [class*='month-header'], .month-name").first.inner_text()
                except Exception:
                    continue

            print(f"[hertz]   panel[{i}] header='{header.strip()}'")
            if header.strip() != target_month_str:
                continue

            # Found the right month — click the td with exact day text
            day_cell = panel.locator("td:not(.empty)").filter(
                has_text=re.compile(rf"^{target_day_str}$")
            )
            cell_count = await day_cell.count()
            print(f"[hertz]   found target month, day cells matching '{target_day_str}': {cell_count}")
            if cell_count > 0:
                await day_cell.first.click()
                print(f"[hertz]   clicked day {target_day_str}")
                return

        # Target month not visible yet — navigate forward
        next_btn = page.locator(".calendar .next.arrow, [class*='calendar'] [class*='next']").last
        next_visible = await next_btn.is_visible()
        print(f"[hertz] target month not found, next_btn_visible={next_visible}")
        if next_visible:
            await next_btn.click()
            await asyncio.sleep(0.3)
        else:
            await _screenshot(page, f"calendar_nav_stuck_{nav_step}")
            print("[hertz] next button not visible, stopping calendar navigation")
            break

    await _screenshot(page, f"calendar_date_not_found_{target.strftime('%Y%m%d')}")
    print(f"[hertz] calendar_date_not_found for target={target.date()}")
    log.warning("calendar_date_not_found", target=str(target.date()))
