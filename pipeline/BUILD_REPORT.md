# Build report

## 1. Replication of the published v9 index

| Index | N | Eigenvalue | Share | Max abs. diff. vs published scores | Loadings (this build) | Loadings (Table 2) |
|---|---|---|---|---|---|---|
| c_nar | 18,248 | 2.719 | 0.680 | 2.1e-07 | 0.5558, 0.3868, 0.5500, 0.4889 | 0.5558, 0.3868, 0.55, 0.4889 |
| c_fisc | 17,307 | 3.068 | 0.614 | 2.3e-07 | 0.5180, 0.3581, 0.5121, 0.4336, 0.3912 | 0.518, 0.3581, 0.5121, 0.4336, 0.3912 |
| c_comp | 12,127 | 3.765 | 0.627 | 2.4e-07 | 0.4631, 0.3166, 0.4609, 0.4125, 0.3712, 0.4061 | 0.4631, 0.3166, 0.4609, 0.4125, 0.3712, 0.4061 |

## 2. Updated vintages (fixed v9 loadings, own-vintage standardisation)

- **V-Dem v12**: 27,380 rows, 1789-2021. Reproduces the released update file: max abs. diff. c_nar 2.6e-07, c_fisc 3.4e-07, c_comp 3.3e-07. Correlation with original on overlapping years: c_nar 0.994, c_fisc 0.991, c_comp 0.993.
- **V-Dem v14**: 27,734 rows, 1789-2023. Reproduces the released update file: max abs. diff. c_nar 3.1e-07, c_fisc 2.6e-07, c_comp 2.9e-07. Correlation with original on overlapping years: c_nar 0.991, c_fisc 0.988, c_comp 0.990.
- **V-Dem v16**: 28,092 rows, 1789-2025. Correlation with original on overlapping years: c_nar 0.991, c_fisc 0.987, c_comp 0.990.

## 3. Summary statistics (compare Table 3)

| Vintage | Index | N | n | T̄ | SD | SD between | SD within | Min | Max | Years |
|---|---|---|---|---|---|---|---|---|---|---|
| v16 | c_nar | 19,784 | 195 | 101.5 | 1.646 | 1.307 | 0.866 | -4.416 | 3.511 | 1789-2025 |
| v16 | c_fisc | 19,291 | 193 | 100.0 | 1.77 | 1.404 | 0.95 | -5.2 | 3.912 | 1789-2025 |
| v16 | c_comp | 13,793 | 175 | 78.8 | 1.951 | 1.659 | 0.896 | -5.815 | 4.313 | 1900-2025 |
| v9 | c_nar | 18,248 | 194 | 94.1 | 1.649 | 1.316 | 0.855 | -4.459 | 3.536 | 1789-2018 |
| v9 | c_fisc | 17,307 | 192 | 90.1 | 1.752 | 1.423 | 0.921 | -4.982 | 3.922 | 1789-2018 |
| v9 | c_comp | 12,127 | 175 | 69.3 | 1.94 | 1.663 | 0.878 | -5.663 | 4.214 | 1900-2018 |

**All checks passed.**
