# Property Sales Dashboard

A personal dashboard for tracking house sales. Open the page, choose your Excel file, and the
dashboard is built **inside your web browser**.

## Privacy

- The spreadsheet is read on your own computer. It is never uploaded anywhere.
- This website contains **no property data**: only the code that reads the file.
- The last loaded data is kept on that device only (in the browser's own storage), so the dashboard
  opens instantly next time. Click **Forget my data on this device** to remove it.
- `.gitignore` stops Excel and CSV files from ever being added to this project by mistake.
- The page has a security rule (Content-Security-Policy) that only lets it load code from this site,
  SheetJS and jsDelivr, and only talk to this site.

## Access code

The site opens with an access code screen. Only a scrambled version (a salted PBKDF2 hash) of the code is
stored in `js/access.js`, never the code itself. Capital letters and extra spaces are ignored. Once
unlocked, that device stays unlocked ("Forget my data on this device" doesn't lock it again).

This is a "private" sign, not real security: on a website with no server, the check has to happen in the
browser, so a determined person could get past it. That's fine here because the website contains none of
the spreadsheet data. To change the code, follow the instructions at the top of `js/access.js`.

## Using it

1. Open the website (or `index.html`).
2. Click **Choose Excel file** and pick the sales spreadsheet.
3. Use the filters at the top. They apply to every tab except Data Check.
4. Check the **Data Check** tab for anything worth fixing in Excel. After fixing, click **Load new file**.

## What the spreadsheet needs

The data is read from the **RawData** sheet (or the first sheet with a "Suburb" heading). Columns are
found by their heading names, so their order doesn't matter:

`No, Suburb, Status, Outcome, AreaSqM, ListingDate, AuctionDate, SoldDate, PriceHighBand,
MyPredictedPrice, FinalReservePrice, ActualSoldPrice, SellingCompany, SellingAgent, Address, Link`

If a column is missing, the parts that need it show a message and everything else keeps working.
Only rows with a Suburb are counted. If there is a **CompanyMap** sheet (RawName → CleanName), it is
used to tidy agency names.

## How the numbers are worked out

The dashboard works these out itself from the raw columns and ignores the formula columns in Excel:

| Figure | How |
|---|---|
| Sold | Has an ActualSoldPrice above $0 |
| Days on market | SoldDate − ListingDate |
| $ per m² | ActualSoldPrice ÷ AreaSqM |
| Prediction error | (ActualSoldPrice − MyPredictedPrice) ÷ MyPredictedPrice |
| Vs price guide | (ActualSoldPrice − PriceHighBand) ÷ PriceHighBand |
| How properties sold | From the Status column (capitals ignored). **Sold at auction**: "Sold In Auction". **Sold before auction**: "Sold Before Auction Date". **Sold privately**: "Private Sale" and "Auction Failed, Sold in Private" (the second is marked **Passed in**). **Not sold yet**: "Currently Listed…", "Auction Failed, On Private Sale Now" and "…Price Not Published Yet", shown separately. If a property has a sold price but its Status still says it isn't sold, it's counted as sold: "Auction Failed…" statuses become Sold privately (passed in); "Currently Listed For Auction" compares SoldDate with AuctionDate: before = Sold before auction, same day = Sold at auction, after = Sold privately (passed in), either date missing = Sold privately; anything else becomes Sold privately. These are listed in Data Check as "Sold price recorded, but Status not updated". Percentages are of the three sold categories. |

These are **left out of averages** and listed in Data Check: negative days on market, missing or zero
land size (for $/m²), and predictions or price guides more than 100% away from the sold price.

## Running it on your own computer

The page needs no server, but browsers work best with one. From this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

- `index.html`: the page
- `css/styles.css`: colours and layout (light and dark mode)
- `js/data.js`: reads and tidies the spreadsheet
- `js/tabs.js`: builds each tab
- `js/app.js`: filters, tabs, loading and remembering
- `js/ui.js`, `js/charts.js`, `js/format.js`, `js/storage.js`: helpers

Libraries: [SheetJS](https://sheetjs.com) 0.20.3 (reads Excel) and [Chart.js](https://www.chartjs.org) 4.4.1 (charts), loaded from
their CDNs at fixed versions with integrity checks.
