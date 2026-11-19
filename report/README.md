# report/

The project's two reports and presentations, one folder per phase.

| Path                                | What it is                                           |
| :---------------------------------- | :--------------------------------------------------- |
| `phase2/phase2-report.tex`          | Phase 2 report source                                |
| `phase2/phase2-report.pdf`          | Phase 2 report, built by `npm run report`            |
| `phase2/figures/`                   | Phase 2 screenshots (`p2-*.jpg`)                     |
| `phase2/slides/`                    | Phase 2 deck (`.pptx`, `.pdf`, generator) and script |
| `phase1/phase1-report.tex` / `.pdf` | Phase 1 report                                       |
| `phase1/figures/`                   | Phase 1 screenshots                                  |
| `phase1/slides/`                    | Phase 1 deck (`epaData-slides.pptx`) and its outline |
| `shared/preamble.tex`, `refs.bib`   | LaTeX preamble and bibliography used by both reports |

Build from the repository root with `npm run report` (Phase 2) or `npm run report:phase1`.
Each report finds its own `figures/` folder.
