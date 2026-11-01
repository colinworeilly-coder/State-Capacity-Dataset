# Licence

## Data (`downloads/`, `data/`, `pipeline/inputs/`)

The Index of State Capacity data are a derivative of the Varieties of Democracy
(V-Dem) dataset, which is licensed under the Creative Commons
Attribution-ShareAlike 4.0 International licence (CC BY-SA 4.0). The index data
are therefore released under the same licence:

**Creative Commons Attribution-ShareAlike 4.0 International**
<https://creativecommons.org/licenses/by-sa/4.0/>

You may share and adapt the data for any purpose, including commercially, as
long as you (1) give appropriate credit and (2) distribute any adaptations
under the same licence.

Credit means citing:

* O'Reilly, Colin, and Ryan H. Murphy. 2022. "An Index Measuring State
  Capacity, 1789–2018." *Economica* 89 (355): 713–745.
  https://doi.org/10.1111/ecca.12411
* The V-Dem Country-Year dataset release matching the vintage you use
  (Coppedge et al., Varieties of Democracy Project), and Pemstein et al.,
  "The V-Dem Measurement Model," V-Dem Working Paper No. 21.

The six input variables (`v2x_rule`, `v2svstterr`, `v2clrspct`, `v2dlencmps`,
`v2stfisccap`, `v2peedueq`) are reproduced unchanged from V-Dem. V-Dem does not
endorse this index.

## Code (`index.html`, `assets/app.js`, `assets/style.css`, `pipeline/*.py`, `pipeline/*.do`)

MIT License

Copyright (c) 2026 Colin O'Reilly and Ryan H. Murphy

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Third-party components

* d3 v7.9.0 (ISC licence) and topojson-client v3.1.0 (ISC licence), vendored in `assets/vendor/`.
* World boundaries from Natural Earth (public domain) via world-atlas v2.0.2 (`assets/world-atlas-LICENSE.txt`).
