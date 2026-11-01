#!/usr/bin/env python3
"""
Build the Index of State Capacity (O'Reilly and Murphy, Economica 2022) for
every V-Dem vintage, write the downloadable files, and write the compact data
files used by the dashboard.

Usage
-----
  # 1. (once per new V-Dem release) pull the six inputs out of the full V-Dem file
  python pipeline/build.py extract --vdem path/to/V-Dem-CY-FullOthers-v16_csv.zip --version 16

  # 2. rebuild everything (indices, downloads, dashboard data, validation report)
  python pipeline/build.py build

Method
------
* The ORIGINAL series (V-Dem v9, 1789-2018) is the published file, frozen.
  We re-estimate its PCA here only to recover the loadings and to verify that
  they reproduce Table 2 and the published scores exactly.
* Each UPDATED vintage applies those fixed v9 loadings to the six V-Dem inputs,
  each standardised (z-score) on that vintage's own estimation sample (all
  country-years with the index's inputs non-missing). This is the convention
  used for the 2022 (v12) and 2024 (v14) updates; the build checks that it
  reproduces those files.
* For robustness, an updated vintage also carries pca_* columns: the first
  principal component re-estimated on that vintage's data.
"""
import argparse, json, sys, zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / "pipeline" / "inputs"
EXTRACTS = INP / "vintages"
DL = ROOT / "downloads"
WEB = ROOT / "data"

IDS = ["country_name", "country_text_id", "country_id", "year"]
INPUTS = ["v2x_rule", "v2svstterr", "v2clrspct", "v2dlencmps", "v2stfisccap", "v2peedueq"]
INDEX = {  # paper notation -> inputs (order as in Table 2)
    "c_nar":  ["v2x_rule", "v2svstterr", "v2clrspct", "v2dlencmps"],
    "c_fisc": ["v2x_rule", "v2svstterr", "v2clrspct", "v2dlencmps", "v2stfisccap"],
    "c_comp": ["v2x_rule", "v2svstterr", "v2clrspct", "v2dlencmps", "v2stfisccap", "v2peedueq"],
}
PUBLISHED_V9 = {"c_nar": "statecap_baseline", "c_fisc": "statecap_base_fiscal",
                "c_comp": "statecap_base_fiscal_edu"}
# Names used in the 2022/2024 update files (for validation and the crosswalk)
UPDATE_NAMES = {"c_nar": "c_base", "c_fisc": "c_fiscal", "c_comp": "c_comp"}
TABLE2 = {  # loadings as printed in Table 2
    "c_comp": [0.4631, 0.3166, 0.4609, 0.4125, 0.3712, 0.4061],
    "c_fisc": [0.518, 0.3581, 0.5121, 0.4336, 0.3912],
    "c_nar":  [0.5558, 0.3868, 0.5500, 0.4889],
}
LABELS = {
    "country_name": "Country name (V-Dem)",
    "country_text_id": "Country code (V-Dem; ISO 3166-1 alpha-3 where one exists)",
    "country_id": "V-Dem country ID",
    "iso3": "ISO 3166-1 alpha-3 (blank for historical polities)",
    "year": "Year",
    "c_nar": "State capacity: narrow index (4 inputs)",
    "c_fisc": "State capacity: narrow index with fiscal capacity (5 inputs)",
    "c_comp": "State capacity: comprehensive index (6 inputs)",
    "pca_nar": "Robustness: narrow index, PCA re-estimated on this vintage",
    "pca_fisc": "Robustness: narrow+fiscal index, PCA re-estimated on this vintage",
    "pca_comp": "Robustness: comprehensive index, PCA re-estimated on this vintage",
    "v2x_rule": "V-Dem: Rule of law index (v2x_rule)",
    "v2svstterr": "V-Dem: State authority over territory, % (v2svstterr)",
    "v2clrspct": "V-Dem: Rigorous and impartial public administration (v2clrspct)",
    "v2dlencmps": "V-Dem: Particularistic or public goods (v2dlencmps)",
    "v2stfisccap": "V-Dem: State fiscal source of revenue (v2stfisccap)",
    "v2peedueq": "V-Dem: Educational equality (v2peedueq)",
}
INPUT_INFO = {
    "v2x_rule": ("Rule of law", "To what extent are laws transparently, independently, predictably, impartially and equally enforced, and to what extent do the actions of government officials comply with the law?"),
    "v2svstterr": ("State authority over territory", "Over what percentage of the territory does the state have effective control?"),
    "v2clrspct": ("Rigorous and impartial public administration", "Are public officials rigorous and impartial in the performance of their duties?"),
    "v2dlencmps": ("Particularistic or public goods", "Considering the profile of social and infrastructural spending in the national budget, how 'particularistic' or 'public goods' are most expenditures?"),
    "v2stfisccap": ("State fiscal source of revenue", "On which of the following sources of revenue does the central government primarily rely to finance its activities?"),
    "v2peedueq": ("Educational equality", "To what extent is high-quality basic education guaranteed to all, sufficient to enable them to exercise their basic rights as adult citizens?"),
}
# V-Dem dataset citations by version (shown on the site and in the README).
# Add the new entry when a vintage is added; take it from V-Dem's suggested_citation file.
VDEM_CITATION = {
    9:  ("Coppedge, Michael, John Gerring, Staffan I. Lindberg, Svend-Erik Skaaning, Jan Teorell, et al. 2019. "
         "\u201cV-Dem [Country-Year/Country-Date] Dataset v9.\u201d Varieties of Democracy (V-Dem) Project.",
         "https://doi.org/10.23696/vdemcy19"),
    12: ("Coppedge, Michael, John Gerring, Carl Henrik Knutsen, Staffan I. Lindberg, Jan Teorell, et al. 2022. "
         "\u201cV-Dem [Country-Year/Country-Date] Dataset v12.\u201d Varieties of Democracy (V-Dem) Project.",
         "https://doi.org/10.23696/vdemds22"),
    14: ("Coppedge, Michael, John Gerring, Carl Henrik Knutsen, Staffan I. Lindberg, Jan Teorell, et al. 2024. "
         "\u201cV-Dem [Country-Year/Country-Date] Dataset v14.\u201d Varieties of Democracy (V-Dem) Project.",
         "https://doi.org/10.23696/mcwt-fr58"),
    16: ("Coppedge, Michael, John Gerring, Carl Henrik Knutsen, Staffan I. Lindberg, Jan Teorell, et al. 2026. "
         "\u201cV-Dem [Country-Year/Country-Date] Dataset v16.\u201d Varieties of Democracy (V-Dem) Project.",
         "https://doi.org/10.23696/vdemds26"),
}


# Release-specific caveats from V-Dem's cautionary notes that touch the six inputs.
VINTAGE_NOTES = {
    14: ("V-Dem's v14 notes report test ratings included by mistake for Afghanistan, Burundi, Comoros, Iraq, Lebanon, "
         "North Macedonia, Uruguay and Zimbabwe around 1900, 1925, 1950, 1975 and 2000. v16 corrects this, and these "
         "country-years account for the largest v14-to-v16 revisions."),
    16: ("V-Dem's v16 cautionary notes flag convergence issues in the measurement model for two inputs: public goods "
         "(v2dlencmps) and educational equality (v2peedueq). On the same country-years, their v16 values correlate 0.997 "
         "with v14, and the index correlates 0.999 with v14."),
}


def vdem_cite(ver):
    t, doi = VDEM_CITATION.get(ver, (f"Coppedge, Michael, et al. \u201cV-Dem [Country-Year/Country-Date] Dataset v{ver}.\u201d "
                                     "Varieties of Democracy (V-Dem) Project.", ""))
    return {"text": t, "doi": doi}


def sizes(stem):
    return {ext: (DL / f"{stem}.{ext}").stat().st_size for ext in ("csv", "dta", "xlsx")}


# V-Dem codes that are not ISO codes but correspond to a modern map unit
MAP_NAME = {"XKX": "Kosovo", "SML": "Somaliland"}
NO_ISO = {"XKX", "SML", "PSG", "YMD", "VDR", "DDR", "PSB", "ZZB"}


# --------------------------------------------------------------------------- #
def pca_first(df, cols):
    """Stata `pca` (correlation matrix) + `predict, score` for component 1."""
    s = df.dropna(subset=cols)
    X = s[cols].astype(float)
    mu, sd = X.mean(), X.std(ddof=1)
    Z = (X - mu) / sd
    ev, evec = np.linalg.eigh(np.corrcoef(Z.values.T))
    w = evec[:, -1] * np.sign(evec[:, -1].sum())
    return dict(loadings=w, mean=mu.values, sd=sd.values, eigen=float(ev[-1]),
                share=float(ev[-1] / len(cols)), n=len(s))


def score(df, cols, w, mu, sd):
    Z = (df[cols].astype(float) - mu) / sd
    return pd.Series(Z.values @ w, index=df.index)  # NaN if any input missing


def iso_lookup(codes):
    import pycountry
    out = {}
    for c in codes:
        if c in NO_ISO:
            out[c] = ""
            continue
        out[c] = c if pycountry.countries.get(alpha_3=c) else ""
    return out


def iso_numeric(iso3):
    import pycountry
    c = pycountry.countries.get(alpha_3=iso3) if iso3 else None
    return c.numeric if c else ""


# --------------------------------------------------------------------------- #
def cmd_extract(a):
    src = Path(a.vdem)
    cols = IDS + INPUTS
    if src.suffix == ".zip":
        with zipfile.ZipFile(src) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".csv") and "cy" in n.lower()]
            if not names:
                sys.exit(f"No country-year CSV in {src}: {z.namelist()}")
            print("reading", names[0])
            with z.open(names[0]) as f:
                d = pd.read_csv(f, usecols=cols, low_memory=False)
    elif src.suffix == ".dta":
        d = pd.read_stata(src, columns=cols, convert_categoricals=False)
    else:
        d = pd.read_csv(src, usecols=cols, low_memory=False)
    d = d[cols].sort_values(["country_id", "year"])
    d["country_id"] = d["country_id"].astype(int)
    d["year"] = d["year"].astype(int)
    out = EXTRACTS / f"vdem_v{a.version}_extract.csv"
    d.to_csv(out, index=False)
    print(f"wrote {out.relative_to(ROOT)}  rows={len(d)}  years={d.year.min()}-{d.year.max()}")


def extract_from_update_file(version):
    """The 2022/2024 update files contain the six V-Dem inputs; reuse them."""
    f = INP / f"statecap_finalv{version}.dta"
    out = EXTRACTS / f"vdem_v{version}_extract.csv"
    if f.exists() and not out.exists():
        d = pd.read_stata(f)[IDS + INPUTS]
        d["country_id"] = d["country_id"].astype(int)
        d["year"] = d["year"].astype(int)
        d.to_csv(out, index=False)


# --------------------------------------------------------------------------- #
def write_outputs(df, stem, title, cols):
    df = df[cols].copy()
    df.to_csv(DL / f"{stem}.csv", index=False, float_format="%.6g")
    st = df.copy()
    st["iso3"] = st["iso3"].fillna("")
    st.to_stata(DL / f"{stem}.dta", write_index=False, version=118,
                data_label=title[:80], variable_labels={c: LABELS[c][:80] for c in cols})
    with pd.ExcelWriter(DL / f"{stem}.xlsx") as xw:
        df.to_excel(xw, sheet_name="data", index=False)
        pd.DataFrame({"variable": cols, "label": [LABELS[c] for c in cols]}).to_excel(
            xw, sheet_name="codebook", index=False)


def web_json(df, vintage_key, label):
    """Compact per-country arrays for the dashboard."""
    keep = ["c_nar", "c_fisc", "c_comp"] + INPUTS
    d = df.dropna(subset=["c_nar", "c_fisc", "c_comp"], how="all")
    countries = []
    for (cid, code, name, iso3), g in d.groupby(["country_id", "country_text_id", "country_name", "iso3"], sort=False):
        g = g.sort_values("year")
        y0, y1 = int(g.year.min()), int(g.year.max())
        g = g.set_index("year").reindex(range(y0, y1 + 1))
        rec = {"id": int(cid), "code": code, "name": name, "iso3": iso3,
               "num": iso_numeric(iso3), "mapName": MAP_NAME.get(code, ""), "y0": y0}
        for k in keep:
            digs = 2 if k == "v2svstterr" else 3
            rec[k] = [None if pd.isna(v) else round(float(v), digs) for v in g[k].values]
        countries.append(rec)
    countries.sort(key=lambda r: r["name"])
    out = {"vintage": vintage_key, "label": label, "countries": countries}
    p = WEB / f"{vintage_key}.json"
    p.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False))
    return p


def summary(df, var):
    s = df.dropna(subset=[var])
    between = s.groupby("country_id")[var].mean()
    within = s[var] - s.groupby("country_id")[var].transform("mean") + s[var].mean()
    return {"N": int(len(s)), "n": int(s.country_id.nunique()),
            "T": round(len(s) / max(s.country_id.nunique(), 1), 1),
            "mean": round(float(s[var].mean()), 3), "sd": round(float(s[var].std()), 3),
            "sd_between": round(float(between.std()), 3), "sd_within": round(float(within.std()), 3),
            "min": round(float(s[var].min()), 3), "max": round(float(s[var].max()), 3),
            "first_year": int(s.year.min()), "last_year": int(s.year.max())}


# --------------------------------------------------------------------------- #
def cmd_build(a):
    DL.mkdir(exist_ok=True); (DL / "archive").mkdir(exist_ok=True); WEB.mkdir(exist_ok=True)
    report = ["# Build report", ""]
    ok = True

    # ---- 1. Original (v9) -------------------------------------------------- #
    v9 = pd.read_stata(INP / "statecap_finalv9_published.dta")
    v9["country_id"] = v9["country_id"].astype(int); v9["year"] = v9["year"].astype(int)
    fixed, meta_load = {}, {}
    report += ["## 1. Replication of the published v9 index", "",
               "| Index | N | Eigenvalue | Share | Max abs. diff. vs published scores | Loadings (this build) | Loadings (Table 2) |",
               "|---|---|---|---|---|---|---|"]
    for k, cols in INDEX.items():
        p = pca_first(v9, cols)
        fixed[k] = p
        diff = float(np.nanmax(np.abs(score(v9, cols, p["loadings"], p["mean"], p["sd"]) - v9[PUBLISHED_V9[k]])))
        tdiff = float(np.max(np.abs(np.round(p["loadings"], 4) - np.array(TABLE2[k]))))
        ok &= diff < 1e-5 and tdiff <= 1e-4
        report.append(f"| {k} | {p['n']:,} | {p['eigen']:.3f} | {p['share']:.3f} | {diff:.1e} | "
                      f"{', '.join(f'{x:.4f}' for x in p['loadings'])} | {', '.join(map(str, TABLE2[k]))} |")
        meta_load[k] = {"inputs": cols, "loadings": [round(float(x), 6) for x in p["loadings"]],
                        "v9_mean": [float(x) for x in p["mean"]], "v9_sd": [float(x) for x in p["sd"]],
                        "eigen": round(p["eigen"], 4), "share": round(p["share"], 4), "n": p["n"]}
    report.append("")

    isomap = iso_lookup(sorted(set(v9.country_text_id)))
    orig = v9[IDS].copy()
    orig["iso3"] = orig.country_text_id.map(isomap).fillna("")
    for k in INDEX:
        orig[k] = v9[PUBLISHED_V9[k]]
    for c in INPUTS:
        orig[c] = v9[c]
    cols_orig = IDS[:3] + ["iso3", "year"] + list(INDEX) + INPUTS
    orig = orig[cols_orig]
    write_outputs(orig, "statecap_original_vdem_v9", "Index of State Capacity, original (V-Dem v9)", cols_orig)
    vintages = [{"key": "v9", "vdem": 9, "label": "Original (Economica 2022, V-Dem v9)", "short": "Original · V-Dem v9",
                 "file": "statecap_original_vdem_v9", "sizes": sizes("statecap_original_vdem_v9"),
                 "cite": vdem_cite(9), "summary": {k: summary(orig, k) for k in INDEX}}]
    web_json(orig, "v9", vintages[0]["label"])

    # ---- 2. Updated vintages ---------------------------------------------- #
    for v in (12, 14):
        extract_from_update_file(v)
    archive = []
    extracts = sorted(EXTRACTS.glob("vdem_v*_extract.csv"), key=lambda p: int(p.stem.split("_")[1][1:]))
    report += ["## 2. Updated vintages (fixed v9 loadings, own-vintage standardisation)", ""]
    for f in extracts:
        ver = int(f.stem.split("_")[1][1:])
        d = pd.read_csv(f)
        d["iso3"] = d.country_text_id.map(iso_lookup(sorted(set(d.country_text_id)))).fillna("")
        for k, cols in INDEX.items():
            s = d.dropna(subset=cols)
            mu, sd = s[cols].mean().values, s[cols].std(ddof=1).values
            d[k] = score(d, cols, fixed[k]["loadings"], mu, sd)
            p = pca_first(d, cols)
            d[k.replace("c_", "pca_")] = score(d, cols, p["loadings"], p["mean"], p["sd"])
        line = f"- **V-Dem v{ver}**: {len(d):,} rows, {d.year.min()}-{d.year.max()}."
        pub = INP / f"statecap_finalv{ver}.dta"
        if pub.exists():  # validate against the previously released update file
            P = pd.read_stata(pub); P["country_id"] = P.country_id.astype(int); P["year"] = P.year.astype(int)
            m = d.merge(P, on=["country_id", "year"], suffixes=("", "_pub"))
            diffs = {k: float(np.nanmax(np.abs(m[k] - m[UPDATE_NAMES[k] + ("_pub" if UPDATE_NAMES[k] == k else "")])))
                     for k in INDEX}
            ok &= max(diffs.values()) < 1e-5
            line += " Reproduces the released update file: max abs. diff. " + \
                    ", ".join(f"{k} {x:.1e}" for k, x in diffs.items()) + "."
        m9 = d.merge(orig, on=["country_id", "year"], suffixes=("", "_v9"))
        line += " Correlation with original on overlapping years: " + ", ".join(
            f"{k} {m9[[k, k + '_v9']].corr().iloc[0, 1]:.3f}" for k in INDEX) + "."
        report.append(line)
        cols = IDS[:3] + ["iso3", "year"] + list(INDEX) + ["pca_nar", "pca_fisc", "pca_comp"] + INPUTS
        d = d[cols]
        latest = f is extracts[-1]
        stem = f"statecap_vdem_v{ver}"
        write_outputs(d, (stem if latest else f"archive/{stem}"),
                      f"Index of State Capacity, V-Dem v{ver} (fixed v9 loadings)", cols)
        if latest:
            yr = int(d.dropna(subset=["c_nar"]).year.max())
            vintages.insert(0, {"key": f"v{ver}", "vdem": ver,
                                "label": f"Latest (V-Dem v{ver}, data to {yr})", "short": f"Latest · V-Dem v{ver}",
                                "file": stem, "sizes": sizes(stem), "cite": vdem_cite(ver), "note": VINTAGE_NOTES.get(ver, ""),
                                "summary": {k: summary(d, k) for k in INDEX}})
            web_json(d, f"v{ver}", vintages[0]["label"])
        else:
            archive.append({"vdem": ver, "file": f"archive/{stem}", "sizes": sizes(f"archive/{stem}"), "cite": vdem_cite(ver),
                            "note": VINTAGE_NOTES.get(ver, "")})
    report.append("")

    meta = {"vintages": vintages, "archive": archive,
            "loadings": meta_load, "inputs": {k: {"name": n, "question": q} for k, (n, q) in INPUT_INFO.items()},
            "labels": LABELS}
    (WEB / "meta.json").write_text(json.dumps(meta, indent=1))
    report += ["## 3. Summary statistics (compare Table 3)", "",
               "| Vintage | Index | N | n | T̄ | SD | SD between | SD within | Min | Max | Years |", "|---|---|---|---|---|---|---|---|---|---|---|"]
    for v in vintages:
        for k, s in v["summary"].items():
            report.append(f"| {v['key']} | {k} | {s['N']:,} | {s['n']} | {s['T']} | {s['sd']} | {s['sd_between']} | {s['sd_within']} | {s['min']} | {s['max']} | {s['first_year']}-{s['last_year']} |")
    report += ["", "**All checks passed.**" if ok else "**SOME CHECKS FAILED - see above.**"]
    (ROOT / "pipeline" / "BUILD_REPORT.md").write_text("\n".join(report) + "\n")
    print("\n".join(report))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract"); e.add_argument("--vdem", required=True); e.add_argument("--version", required=True, type=int)
    sub.add_parser("build")
    a = ap.parse_args()
    {"extract": cmd_extract, "build": cmd_build}[a.cmd](a)
