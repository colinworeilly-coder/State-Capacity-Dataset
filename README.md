# Index of State Capacity

Interactive explorer and data downloads for the index of state capacity in

> O'Reilly, Colin, and Ryan H. Murphy. 2022. "An Index Measuring State Capacity, 1789–2018." *Economica* 89 (355): 713–745. <https://doi.org/10.1111/ecca.12411>

The index is the first principal component of six indicators from the [Varieties of Democracy (V-Dem)](https://www.v-dem.net) dataset: rule of law, state authority over territory, rigorous and impartial public administration, particularistic vs. public goods spending, the state's fiscal source of revenue, and educational equality. There are three versions:

| Variable | Inputs | Coverage (original) |
|---|---|---|
| `c_nar` | rule of law, territory, impartial administration, public goods | 1789–2018, 194 polities |
| `c_fisc` | `c_nar` inputs + fiscal source of revenue | 1789–2018, 192 polities |
| `c_comp` | `c_fisc` inputs + educational equality | 1900–2018, 175 polities |

## The site

`index.html` is a static page (no server, no build step) with five views: compare countries over time, a world map with a year slider, rankings for any year with change since a base year, the six V-Dem components behind a country's score, and downloads. It reads `data/meta.json` and `data/<vintage>.json`.

To preview it locally:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk will not work, because browsers block `fetch` on `file://`.

### Hosting on GitHub Pages

1. Merge this branch into `main`.
2. In the repository, open **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. The site appears at `https://colinworeilly-coder.github.io/State-Capacity-Dataset/`.
4. To serve it from your own domain, for example `statecapacity.colinworeilly.com`, add a `CNAME` DNS record pointing to `colinworeilly-coder.github.io`. Then enter the domain under **Settings → Pages → Custom domain**. Alternatively, link to the GitHub Pages address from www.colinworeilly.com.

GitHub Pages is free for public repositories. A private repository needs a paid GitHub plan.

## Data files (`downloads/`)

| File | What it is |
|---|---|
| `statecap_vdem_v<NN>.{csv,dta,xlsx}` | **Latest vintage.** Fixed v9 loadings applied to V-Dem v*NN*. Adds `pca_*` columns with the component re-estimated on v*NN*. |
| `statecap_original_vdem_v9.{csv,dta,xlsx}` | **Replication.** The published series (V-Dem v9, 1789–2018). |
| `archive/statecap_vdem_v12.*`, `archive/statecap_vdem_v14.*` | Earlier update files (2022, 2024), standardised to the current variable names. |

Each file has the columns `country_name`, `country_text_id`, `country_id` (V-Dem identifiers), `iso3`, `year`, the indices, and the six V-Dem inputs. Earlier update files called the narrow indices `c_base` and `c_fiscal`. They are now `c_nar` and `c_fisc`, as in the paper. The values are identical.

## How the data are built (`pipeline/`)

```bash
pip install pandas numpy openpyxl pycountry
python pipeline/build.py extract --vdem path/to/V-Dem-CY-FullOthers-v16_csv.zip --version 16   # once per V-Dem release
python pipeline/build.py build
```

`build` does the following:

1. It re-estimates the PCA on the published v9 file. It checks that the result reproduces Table 2 (loadings) and the published scores (to within 10⁻⁶).
2. For every V-Dem extract in `pipeline/inputs/vintages/`, it applies the **fixed v9 loadings** to inputs standardised on that vintage's own estimation sample. It checks that this reproduces the released 2022 (v12) and 2024 (v14) files.
3. It writes `downloads/`, `data/`, and `pipeline/BUILD_REPORT.md`, which holds the replication checks and a Table 3-style summary. The build exits with an error if any check fails.

The newest extract becomes the "Latest" vintage on the site. Older ones go to `downloads/archive/`. When adding a release, also add its V-Dem citation to `VDEM_CITATION` in `build.py`. `pipeline/construct_index_fixed_loadings.do` does the same construction in Stata.

## Licence and attribution

The underlying indicators are from the V-Dem Project and are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The index data in this repository are a derivative work and are released under the same licence. See [LICENSE.md](LICENSE.md). If you use the data, please cite:

- the paper (above; a `CITATION.cff` is included), **and**
- the V-Dem dataset release matching the vintage you use (citations are listed on the site under *Method & citation*), **and**
- Pemstein, Daniel, Kyle L. Marquardt, Eitan Tzelgov, Yi-ting Wang, Juraj Medzihorsky, Joshua Krusell, Farhad Miri, and Johannes von Römer. "The V-Dem Measurement Model: Latent Variable Analysis for Cross-National and Cross-Temporal Expert-Coded Data." V-Dem Working Paper No. 21. Varieties of Democracy Institute, University of Gothenburg.

V-Dem does not endorse this index. Map boundaries are from Natural Earth via [world-atlas](https://github.com/topojson/world-atlas). The site's code (`index.html`, `assets/`, `pipeline/`) is MIT-licensed.
