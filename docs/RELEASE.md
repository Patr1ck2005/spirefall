# Release checklist (v0.1.0)

Everything below that touches GitHub's web UI is a paste-ready operation; the
repository itself ships all code artifacts.

## Repository About panel (GitHub → About → gear)

- **Description** (one line, 350 char limit):
  > Clean-room browser arena shooter — server-authoritative 60Hz combat, dismemberment, hazards, and AI pilots across a decaying brutalist spire. Phaser 3 + TypeScript client, Node.js WebSocket server.
- **Website**: leave unset (no public hosting by design).
- **Topics**:
  > browser-game, phaser, typescript, websocket, multiplayer, arena-shooter, nodejs, clean-room

## Tagging a release

```powershell
# after the release commit is approved and merged to master
git tag -a v0.1.0 -m "Spirefall v0.1.0 — first public release"
git push origin v0.1.0   # push requires separate approval
```

Then GitHub → Releases → "Draft a new release" → choose the tag.

## Release notes template

```markdown
# Spirefall v0.1.0 — first public release

A clean-room browser arena shooter set inside a decaying brutalist
megastructure. Four pilots battle across three sectors of one vertical
spire with server-authoritative physics, weapons, hazards, and
dismemberment.

## Highlights
- Authoritative 60Hz simulation: every shot, limb, hazard, and crate is
  resolved server-side and streamed at 20Hz.
- Limb integrity instead of health bars: damage arms to slow your fire,
  legs to slow your sprint; bleed-outs and charged-rail executions included.
- Seven weapons, fourteen attacks with honest ballistics — enforced ranges,
  distance damage falloff, and solid cover that blocks every projectile.
- Echo Shard ricochet gun: geometry-rewarding bouncing shards (new in M20).
- Host-controlled AI pilots at three skill tiers with real weapon management.
- Procedural WebAudio sound design — zero audio assets.
- Combat feedback: kill feed, hit-direction indicators, and low-health vignette.

## Running it
Windows: double-click `Spirefall.bat`. Anywhere else: `npm install && npm run dev`.

## Verification
Seven repeatable suites: `npm run test:logic|smoke|ai|browser|visual|performance`.
CI runs all of them on every push (performance is report-only on CI runners).
```

## Post-release checks

- [ ] CI green on the release commit
- [ ] LICENSE renders on GitHub (MIT, Wang Keren)
- [ ] About description + topics applied
- [ ] Release published against the v0.1.0 tag
- [ ] README badges link to the correct repo (`Patr1ck2005/spirefall`)
