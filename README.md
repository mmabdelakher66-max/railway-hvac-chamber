# TC-01 · Railway HVAC Test Chamber — conceptual SCADA/HMI

Conceptual operator interface for a railway HVAC environmental & performance test chamber
(UPEI Cairo Sustainable Design Engineering × EOG International graduation project).

**Live demo:** https://mmabdelakher66-max.github.io/railway-hvac-chamber/

> Conceptual demonstrator. The process is simulated (simplified first-order thermal model, ×30 speed)
> and is not connected to hardware. Final architecture, ranges and limits are subject to EOG requirements,
> engineering calculations and validation.

## Screens
| Key | Screen | What it shows |
|---|---|---|
| F1 | Process overview | P&ID-style mimic of both zones, the unit under test, instruments (ISA 5.1 tags), test control and E-stop |
| F2 | Test setup | Test recipes and setpoints, downloaded to the controller |
| F3 | Trends | Historian trends (temperatures, capacity, power) with CSV export |
| F4 | Alarms & events | Prioritised alarm list with acknowledge, and event journal |
| F5 | Interlocks | Cause-and-effect table, latching trips, reset, and fault simulation for demos |
| F6 | System | Proposed control architecture and instrument index |

## Mobile remote screen
F6 System → **Remote access** shows a QR code. Scanning it opens a phone-optimised operator screen that
receives live data from the HMI over MQTT (secure WebSocket): setpoints vs actual values, damper position,
passengers, supply air, capacity, power/COP, alarms and a temperature trend. When the local operator selects
**Allow control**, the phone can start/stop tests, change setpoints and acknowledge alarms. Emergency stop and
interlock reset stay local-only. Every remote action is logged in the event journal as "Remote (phone)".
The demo uses a public MQTT test broker (HiveMQ, with EMQX as fallback); production would use a private broker
with TLS, authentication and a VPN.

Design follows high-performance HMI principles (ISA-101): neutral screens, colour reserved for abnormal
states, redundant alarm coding (colour + shape + number), analog indicators showing normal range.

## Run locally
Requires Node 22.
```bash
npm install
npm run dev      # http://localhost:5173/railway-hvac-chamber/
```

## Deploy to GitHub Pages
```bash
npm run deploy   # builds and publishes dist/ to the gh-pages branch
```
