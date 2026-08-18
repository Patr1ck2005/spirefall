# Original behavior baseline

This document separates confirmed observations from design choices. It is not a claim that the original implementation has been recovered exactly.

## Confirmed observations

- Reference title: Gun Mayhem Redux.
- Reference file: `temp_folder/english.swf`.
- Stage: approximately 1000 x 560 pixels.
- Timeline: 35 FPS, ActionScript 2 / AVM1.
- The SWF contains embedded animation, audio, UI, AI, map, weapon, challenge, and local-save resources.
- No original online transport was found. Persistence uses local `SharedObject` data.
- The game supports four player slots, multiple maps, crates, lives, and a broad weapon set.
- The input model has multiple action channels. In the clean-room version, `J` and `K` are preserved as distinct primary and secondary attacks.

## High-priority feel targets

These are tuned by repeated play and outcome comparison rather than by copying hidden constants:

1. Fast horizontal acceleration with useful air control.
2. Immediate jump response and readable landing timing.
3. Weapon recoil that affects both aim rhythm and movement.
4. Knockback as the main route to losing a life; ordinary hits do not use a health bar.
5. Short death/respawn downtime and temporary spawn protection.
6. Distinct primary and secondary attack cadence on every weapon.
7. Maps with clear horizontal routes, vertical contest points, and fall hazards.

## Current clean-room tuning

- Simulation tick: 60 Hz.
- Network snapshots: 20 Hz.
- Horizontal speed cap: 250 px/s.
- Jump velocity: 515 px/s upward.
- Gravity: 1150 px/s squared.
- Respawn delay: 1.5 seconds while lives remain.
- Spawn protection: 1.4 seconds.
- Disconnection slot retention: 30 seconds.

All high-salience values live in shared configuration or the authoritative simulation and should be adjusted from playtest evidence. Exact sprite timing, particles, background decoration, and other low-salience details may follow modern design judgment.

## Acceptance comparison

For each tuning pass, compare the reference and clean-room build on:

- Time and distance to reach maximum horizontal speed.
- Jump height, air-turn response, and time to land.
- Primary/secondary attack interval and recoil displacement.
- Knockback distance from representative weapons.
- Time from falling out to regaining control.
- Frequency of useful encounters on each platform route.

Changes are accepted when the result feels at least as responsive and readable as the reference, even if internal values differ.

