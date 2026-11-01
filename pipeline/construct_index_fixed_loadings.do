* =============================================================================
* Index of State Capacity (O'Reilly and Murphy, Economica 2022)
* Construct the index for a NEW V-Dem release using the FIXED v9 loadings.
*
* Stata equivalent of `python pipeline/build.py`. The Python build is the one
* that produces the published files and checks itself against the paper and the
* 2022/2024 releases; use this do-file if you prefer to work in Stata, and
* compare its output with downloads/statecap_vdem_v<NN>.csv.
*
* Method: for each index, take the country-years with all of its inputs
* non-missing, z-score each input on that sample, and weight by the v9
* loadings (Table 2, full precision below). This reproduces the c_base /
* c_fiscal / c_comp variables in the 2022 (v12) and 2024 (v14) update files.
* pca_* re-estimates the first principal component on the new data (robustness).
* =============================================================================
version 16
clear all

* ---- edit these two lines -------------------------------------------------- *
local vdem "V-Dem-CY-Full+Others-v16.dta"
local ver  16
* --------------------------------------------------------------------------- *

use country_name country_text_id country_id year ///
    v2x_rule v2svstterr v2clrspct v2dlencmps v2stfisccap v2peedueq ///
    using "`vdem'", clear

* Inputs and fixed loadings (first principal component, V-Dem v9)
local in_nar   v2x_rule v2svstterr v2clrspct v2dlencmps
local w_nar    0.555788 0.386763 0.549989 0.488903
local in_fisc  v2x_rule v2svstterr v2clrspct v2dlencmps v2stfisccap
local w_fisc   0.518025 0.358135 0.512148 0.433611 0.391250
local in_comp  v2x_rule v2svstterr v2clrspct v2dlencmps v2stfisccap v2peedueq
local w_comp   0.463074 0.316590 0.460860 0.412545 0.371240 0.406115

foreach k in nar fisc comp {
    local vars `in_`k''
    local nv : word count `vars'
    tempvar nn touse
    egen `nn' = rownonmiss(`vars')
    gen byte `touse' = (`nn' == `nv')

    * fixed loadings, own-vintage standardisation
    gen double c_`k' = 0 if `touse'
    forvalues j = 1/`nv' {
        local v : word `j' of `vars'
        local w : word `j' of `w_`k''
        quietly summarize `v' if `touse'
        quietly replace c_`k' = c_`k' + `w' * (`v' - r(mean)) / r(sd) if `touse'
    }

    * robustness: PCA re-estimated on this vintage (sign aligned with c_`k')
    quietly pca `vars' if `touse', components(1)
    quietly predict double pca_`k' if `touse', score
    quietly correlate c_`k' pca_`k'
    if r(rho) < 0 quietly replace pca_`k' = -pca_`k'
    drop `nn' `touse'
}

label var c_nar    "State capacity: narrow index (4 inputs)"
label var c_fisc   "State capacity: narrow index with fiscal capacity (5 inputs)"
label var c_comp   "State capacity: comprehensive index (6 inputs)"
label var pca_nar  "Robustness: narrow index, PCA re-estimated on this vintage"
label var pca_fisc "Robustness: narrow+fiscal index, PCA re-estimated on this vintage"
label var pca_comp "Robustness: comprehensive index, PCA re-estimated on this vintage"

order country_name country_text_id country_id year c_* pca_* v2*
sort country_id year
label data "Index of State Capacity, V-Dem v`ver' (fixed v9 loadings)"
save "statecap_vdem_v`ver'_stata.dta", replace
xtsum c_nar c_fisc c_comp
