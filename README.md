# P. brassicae Simulator

A browser app that simulates how *Plasmodiophora brassicae* (clubroot) spreads in a field over
a crop rotation. Everything runs in your browser. There is no server, and no data leaves your computer.

**Try it:** https://stkolll.github.io/pbrassicae-spread-simulator/

## What it does

- Simulates resting-spore concentration in the topsoil of a 2D field over several years
  (diffusion, water-driven transport, natural decay, spore release from infected plants).
- Tracks plants on a planting grid. A plant gets infected when the spore concentration in its
  root area exceeds a threshold. Galls mature and burst, and release new spores.
- Crop rotation editor: crops, growth windows per month, volunteer hosts, pesticide events.
- Two presets based on the thesis scenarios: *autumn-sown canola every 4th year* (cereal in
  between) and *spring-sown canola every 2nd year* (fallow in between, with pesticide).
- Results as a map or rotatable 3D surface with playback, a season timeline and time-series charts.
- Built-in safety limits stop runs that would freeze the browser.

## Background

The model comes from my MSc thesis *Modelling and numerical Simulation of Plasmodiophora
brassicae* (University of Innsbruck, 2020). This app is a new implementation and corrects
the model in several places. Examples: a spore decay rate that no longer depends on the simulation length, a mass-conserving form of the
transport term, and an infection threshold that doesn't depend on grid resolution. Results
will therefore differ from the ones in the thesis.

The default parameter values are order-of-magnitude estimates. They aren't calibrated against
field data, so use the tool to explore scenarios, not to make quantitative predictions.

## Run it locally

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev       # development server at http://localhost:5173
npm run build     # static build in dist/, can be hosted anywhere
npm test          # run the tests (analytic solutions, mass conservation, plant logic)
```

## Project structure

```
src/
  model/      the simulation itself, independent of the user interface
    simulate.ts     main loop: time steps, plant events, snapshots
    operators.ts    diffusion, transport and decay as a sparse matrix
    ros2.ts         time integration (Rosenbrock method)
    banded.ts       exact banded LU solver
    amf.ts          faster approximate solver
    plants.ts       plant grid, infection threshold, gall bursts
    calendar.ts     crops, growth months, crop rotation
    velocity.ts     water-flow presets
    presets.ts      the two thesis scenarios
    limits.ts       cost estimate and safety limits
  worker/     runs the simulation in a Web Worker
  ui/         React interface: parameter panels, editors, plots
tests/        checks against analytic solutions and conservation laws
```

The model in `src/model/` has no browser dependencies. You can use it on its own, for example
from a Node.js script.

## Numerics in short

- Finite volumes on a regular grid, upwind advection, Dirichlet boundary (spores leaving the
  field are lost).
- Time integration with a 2-stage Rosenbrock method (ROS2, order 2, L-stable) and a banded
  LU solver. Optionally, a faster approximate factorisation is available for small diffusion numbers.
- The solver runs in a Web Worker, so the page stays responsive.

## License

This project is licensed under the MIT License, see [LICENSE](LICENSE).
