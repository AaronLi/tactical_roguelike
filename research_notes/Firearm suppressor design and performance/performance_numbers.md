# Firearm suppressor performance numbers (sound levels and other measurable effects)

Reading notes for the whole file:

- **Source classes** are tagged on every row: `[ACAD]` peer-reviewed / government, `[IND]` independent test (media, third-party lab, multi-vendor summit), `[MFR]` manufacturer-claimed or manufacturer-affiliated presenter, `[RETAIL]` retailer/aggregator "typical" figures with no stated protocol, `[ANEC]` anecdote/forum.
- **Positions**: "MIL-STD left" = 1 m left of muzzle, 90 degrees to bore, 1.6 m above ground (industry variant of MIL-STD-1474D; the standard's own reference position is 2 m). "Ear" = about 15 cm from shooter's ear.
- **Weighting matters**: the same shot reads several dB differently in dBA, dBC and dBZ (unweighted). Do not mix rows without checking the weighting column.
- Research was limited by access: PEW Science puts its numeric dB tables in images / member-only pages, the ARL detection-range report (ARL-TR-9277) was offline (DTIC "under maintenance"), and several manufacturer pages returned 403/503. Those holes are listed under each Gaps heading.

## 1. Typical unsuppressed peak sound levels by cartridge and host

### Takeaway
Unsuppressed small arms sit in a fairly narrow band at 1 m: about 140-156 dB for .22 LR (rifle low, pistol high), 157-163 dB for service pistols, 162-167 dB for 5.56 and .308 rifles, and 170-180 dB for braked magnums and .50 BMG. Barrel length changes 5.56 by only a few dB in peak terms, but short barrels add a second blast wave that raises impulse (total energy) much more than the peak number suggests.

### Cited Findings

| Cartridge | Host / barrel | Level | Position / weighting | Class | Source |
|---|---|---|---|---|---|
| .22 LR standard velocity | Ruger MK II bull-barrel pistol | 152.4 dBA / 151.5 dBC / 155.8 dBZ | MIL-STD left, LD 800B, 5-rd avg | MFR-affiliated (Dater/Gemtech) | [Dater, Firearm Sound Briefing 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR standard velocity | Ruger 10/22 rifle | 138.6 dBA / 137.4 dBC / 142.4 dBZ | mic at 3 ft, LD 800B (data credited to Luke Haag) | IND | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR | 16.5" Volquartsen rifle | 141.0 dBA peak; 119.0 dBA Leq(10 ms) | MIL-STD left | IND (2024 Suppressor Summit, hosted by TBAC) | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| .22 LR | 16" rifle | 148 dB | 1 m, no protocol stated | IND (hobbyist table) | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| .22 LR | pistol | ~157 dB | "shooter's position", no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| .22 LR subsonic (CCI SV) | rifle | ~140 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like); [Silencer Central](https://www.silencercentral.com/blog/how-loud-is-a-gunshot-gun-db-levels-compared/) |
| 9x19 | SIG P228 pistol | 159-162 dB | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| 9x19 | Glock 17 | ~162 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| .40 S&W | SIG P229 | 161-162 dB | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .357 SIG | SIG P229 | 162-163 dB | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .357 Magnum | revolver | ~169 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 5.56x45 / .223 | AR-15 (rifle length) | 162-163 dB | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| 5.56x45 | M4 14.5" | 164 dB | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| 5.56x45 / .223 | AR-15 16" | ~165-166 dB | 1 m / unspecified | RETAIL, IND | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like); [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| 5.56x45 | SA80 (L85, 20.4" barrel) | 158.2 dB(C) mean at 1 m to the side; 161.2 dB(C) at 0.3 m | LCpeak, to the side of the firer, 77 rounds | ACAD | [SA80 study manuscript (Applied Acoustics 2016)](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf) |
| .308 Win | AI AX bolt action, 20", M118LR 175 gr | 166 dBA peak; 148 dBA Leq(10 ms) | MIL-STD left | IND | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| .308 Win | hunting rifle | ~167 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 6.5 Creedmoor | Lone Peak Fuzion bolt action, 145 gr at ~2800 fps | 165 dB bare muzzle | MIL-STD left, Larson Davis 821 | IND | [Outdoor Life recoil/sound test](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor with muzzle brake | same rifle | 165.7-168.9 dB (brakes add +0.7 to +3.9 dB at 1 m left) | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| .338 Lapua Mag | 25" barrel with brake | 177 dB | 1 m, no protocol stated | IND (hobbyist table) | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| .50 BMG | unspecified | "175 to 180 dB"; "up to 180" | unsourced | RETAIL | [Primary Arms blog](https://blog.primaryarms.com/?p=11195); [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 12 gauge | shotgun | ~161 dB (category range 155-165) | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |

Barrel length effects:

- Dater and Wong cut a 24" AR-15 barrel down 1" at a time to 5" (M855, MIL-STD-1474D, 5-round averages) and concluded "non-suppressed sound pressure level increases exponentially with decreasing barrel length", tracking muzzle ("uncorking") pressure almost perfectly; maximum velocity was at 20", and barrels of 10" or less may not reach 2,500 ft/s. The per-inch dB values are in charts that did not extract as text. `[MFR-affiliated]` — [Dater & Wong, NDIA 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- Suppressor entrance-chamber pressure with M855: 2,990 psi on a 10.5" barrel versus 1,978 psi on a 14.5" barrel (about 50% higher on the short barrel). — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- PEW Science: the primary blast of a 10.3" 5.56 MK18 is "coincidentally similar" in peak pressure to a 20" 7.62x51, but the MK18's afterburning secondary blast gives a positive-phase impulse "almost 30% more severe" than the 20" 7.62. `[IND]` — [PEW Science 6.51](https://pewscience.com/sound-signature-reviews-free/sss-6-51-research-supplement-unsuppressed-rifle-and-mk18)
- PEW Science: the 14.5" M4A1 primary blast has slightly less peak amplitude and duration than the 10.3" 5.56 and the 20" 7.62; both 5.56 barrels show a significant secondary blast wave. — [PEW Science 6.127](https://pewscience.com/sound-signature-reviews-free/sss-6-127-research-supplement-unsuppressed-rifle-and-m4a1)
- 9mm subguns (subsonic ammo): the 5.8" barrel (SP5K) has a more severe primary muzzle blast than the 8.9" barrel (SP5); both are less severe than an 8" subsonic .300 BLK. — [PEW Science 6.85](https://pewscience.com/sound-signature-reviews-free/sss-6-85-research-supplement-unsuppressed-subguns)
- Shooter-ear asymmetry: on the SA80, the ear in line with the muzzle read about 2.4 dB higher than the head-shadowed ear. `[ACAD]` — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- Indoor shots measure about 5-10 dB higher at the ear than the same shot outdoors. `[RETAIL]` — [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like)

### Inferences
- Peak-dB spread across 5.56 barrel lengths is small (Dater's 162-163 for a rifle versus 164 for an M4 is 1-2 dB). A reasonable design range is 20" about 162-164, 16" about 164-166, 14.5" about 164-166, 10.3" about 165-168 dB at 1 m, with the short barrel's real penalty expressed as a larger "blast energy" value, not just peak. This is an interpolation from the rows above, not a measured table.
- .22 LR rifle versus pistol is the largest barrel-length effect in the data set (about 13-14 dB between a 10/22 and a MK II pistol).
- Retailer "typical" figures agree with instrumented data to within about 3 dB for common cartridges, so they are usable as coarse game values.

### Gaps
- No protocol-stated unsuppressed figures found for .45 ACP (one aggregator chart quoted in search results lists 157 dB, source and method unknown), 7.62x39, .300 BLK supersonic/subsonic, 9mm SMG/PCC, or measured 10.3"/14.5"/16"/20" 5.56 values on a single test day. The Dater barrel-length chart and PEW Science figures hold them but only as images.
- .50 BMG and 12 gauge unsuppressed values are retailer statements with no test citation.
- ammo.com's "2025 analysis" table (reported in search results as 157-167 dB for 147 gr 9mm from pistols) could not be fetched (403).

## 2. Typical suppressed levels and dB reduction; which combinations are under 140 dB

### Takeaway
Measured reductions cluster at 17-35 dB at the muzzle reference position and are smaller and more variable at the shooter's ear on gas-operated guns. Rimfire, subsonic pistol/SMG, subsonic .300 BLK and full-size cans on bolt-action .308/6.5 land under 140 dB; short "K" cans, supersonic 5.56 on short barrels (at the ear) and magnums generally sit at or above 140 dB.

### Cited Findings

Reduction ranges:

- NIOSH-led study, 3 suppressors on 4 firearms: 17-24 dB peak reduction at the shooter's ear; 20-28 dB peak at an instructor position about 1 m behind the shooter; LAeq,8h reduced 9-21 dB (ear) and 11-26 dB (instructor); sound power reduced 2-23 dB, with larger reductions for low-velocity ammunition because supersonic bullets add N-waves. Authors conclude suppressed firearms "can still pose a significant hearing risk" and hearing protection should always be worn. `[ACAD]` — [Murphy et al., Int. J. Audiology 2018 (CDC Stacks)](https://stacks.cdc.gov/view/cdc/211059)
- Companion study, 14 firearms, high-velocity and subsonic ammo, 12-mic ring at 3 m plus 1 m left and both ears: peak reductions "between 3 and 28 dB", LAeq 2-24 dB. `[ACAD]` — [Murphy et al., Proc. Mtgs. Acoust. 2018 (CDC Stacks)](https://stacks.cdc.gov/view/cdc/221679)
- For an AAC .300 Blackout rifle in that data set, reductions were about 15-27 dB peak at 1 m and about 16-20 dB at the ear positions (as reported in a search summary of the paper's full text; not verified against the PDF). `[ACAD]` — [CDC Stacks PDF](https://stacks.cdc.gov/view/cdc/221679/cdc_221679_DS1.pdf)
- Finnish suppressor trials (Pääkkönen & Kyttälä 1999), as cited by the SA80 paper: a good rifle moderator reduces muzzle blast by 18-28 dB for the firer and people to the side or behind; the bullet shock wave downrange is not reduced. `[ACAD]` — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- Retail summary: quality suppressor reduces peak by about 25-40 dB; typical suppressed gunshot 125-140 dB. `[RETAIL]` — [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like)
- Peak dB alone under-describes loudness: two cans with equal peaks can differ in total energy; the 2024 Summit reports Leq(10 ms) alongside peak, and its author treats 2 dB as an audible difference for gunshots. `[IND]` — [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/)

Suppressed levels by system:

| Cartridge | Host / barrel | Suppressor | Suppressed level | Reduction | Position / weighting | Class | Source |
|---|---|---|---|---|---|---|---|
| .22 LR SV | Ruger MK II pistol | unnamed older can | 122.2 dBA / 118.8 dBC / 126.0 dBZ | 30.3 / 32.7 / 29.8 dB | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR SV | Ruger MK II pistol | Gemtech Outback-II | 118.1 dBA (LD 800B); 116.6 dBA (LxT1) | not given | MIL-STD left | MFR | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR SV | Ruger MK II pistol | Maxim 1910 (historic design) | 128.3 dBA | not given | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR | 16" rifle | unnamed | 126 dB | 22 dB (from 148) | 1 m | IND | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| .22 LR | pistol / subsonic rifle | "quality suppressor" | 115-125 dB / 108-118 dB | about 32-42 / 22-32 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 9x19 147 gr subsonic | HK MP5 (8.9") | Gemtech Raptor | 129.5 dBA (800B); 129.0 dBA (LxT1) | not given | MIL-STD left | MFR | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| 9x19 | pistol | "quality suppressor" | 120-128 dB | about 34-42 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 9x19 | pistol (several loads averaged) | not captured | 128.02 dBZ average | not given | not captured | IND (retailer ammo test) | [Target Barn](https://www.targetbarn.com/broad-side/?p=7225) |
| 5.56 M855 | M4 14.5" | Knight M4QD | 132.5 dBA (800B); 131.2 dBA (LxT1) | about 31.5 dB from 164 | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| 5.56 | 10.3" | SureFire SOCOM556-RC2 | 137.74 dB | not given | shooter's ear | MFR (SureFire, relayed by TFB) | [TFB Silencer Saturday #308](https://www.thefirearmblog.com/blog/2023/12/16/surefire-socom556-rc3/) |
| 5.56 | 14.5" | SureFire SOCOM556-RC2 | 136.40 dB | not given | shooter's ear | MFR | [TFB #308](https://www.thefirearmblog.com/blog/2023/12/16/surefire-socom556-rc3/) |
| 5.56 | 11.5" | SureFire RC2 / RC3 | "roughly 140 dB" | not metered | by ear, author's estimate | ANEC | [TFB #308](https://www.thefirearmblog.com/blog/2023/12/16/surefire-socom556-rc3/) |
| .223 | 16" | unnamed | 132 dB | 34 dB (from 166) | 1 m | IND | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| 5.56 | AR-15 16" | "quality suppressor" | 131-140 dB | about 25-34 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| .300 BLK subsonic 190 gr | Q mini FIX bolt action, 8" | DDC Enticer L-Ti | 136.7 dB (first shot, primary jetting peak) | n/a | 1.0 m left, unweighted pressure trace | IND | [PEW Science 6.88](https://pewscience.com/sound-signature-reviews-free/sss-6-88-ddc-enticer-l-minifix-300blk) |
| .300 BLK subsonic | Q mini FIX bolt action, 8" | two other cans | 132.0 dB and 147.5 dB first-shot peaks (different silencers) | n/a | 1.0 m left | IND (search summary of PEW 6.99 / 6.107) | [PEW Science 6.99](https://pewscience.com/sound-signature-reviews-free/sss-6-99-q-full-nelson-minifix-300blk); [PEW Science 6.107](https://pewscience.com/sound-signature-reviews-free/sss-6-107-sig-slh300ti-minifix-300blk) |
| .300 BLK (several loads) | not captured | not captured | 134.18 dBZ average | not given | not captured | IND (retailer ammo test) | [Target Barn](https://www.targetbarn.com/broad-side/?p=7225) |
| .308 Win M118LR | AI AX bolt, 20" | best 5" cans (Hydrogen K, Magnus K, Ultra 5, Lahar-30K) | about 20 dBA below bare-muzzle Leq at MIL-STD left; 131-136 dBA at ear | about 20 dBA (Leq) | MIL-STD left and ear | IND | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| .308 Win | same | Abel Biscuit S (4.87") | 142 dBA | n/a | ear | IND | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| .308 Win | same | 8" class cans | about 122-130 dBA (class range); SureFire SOCOM762-RC2 about 10 dBA behind class leader | n/a | MIL-STD left | IND | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| .308 Win | same | 9"+ cans | many peaks 132-134 dBA | about 32-34 dBA from 166 | MIL-STD left | IND | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| .308 Win | hunting rifle | "quality suppressor" | 130-138 dB | about 29-37 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 6.5 Creedmoor | bolt action | Tenet Reserve 6.5 (quietest tested) | 129.9 dB | 35.1 dB | MIL-STD left, 4-shot avg | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor | bolt action | PTR Vent 1 | 130.7 dB | 34.3 dB | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor | bolt action | TBAC Ultra 9 Gen 2 | 135.2 dB | 29.8 dB | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor | bolt action | SilencerCo Scythe Ti (factory cap) | 137.8 dB | 27.2 dB | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor | bolt action | TBAC Ultra 5 Gen 2 (short) | 147.4 dB | 17.6 dB | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor | bolt action | Mack Bros Zenith K (short) | 149.8 dB | 15.2 dB | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| 6.5 Creedmoor | bolt action | SilencerCo Omega 300 with brake end cap | 148.1 dB | 16.9 dB | MIL-STD left | IND | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| .338 Lapua Mag | 25" barrel | unnamed | 145 dB | 32 dB (from 177) | 1 m | IND | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| .50 BMG | unspecified | TBAC Ultra 50 | 136 dBA at ear; 140 dBA at mil-spec position | not given | ear / MIL-STD | MFR | [Paramount Tactical product page](https://paramounttactical.com/product/ultra-50-suppressor) |
| 12 gauge (inferred) | shotgun | modular shotgun suppressor at full 12" length | 136 dB | not given | not stated | MFR claim relayed by press | [Athlon Outdoors](https://athlonoutdoors.com/article/sots-11-big-bore-suppressors/) |

Host action type and ear-versus-muzzle:

- Same suppressor, M855, relative to a 14.5" M4 (1 m left of muzzle): HK416 +5 dB, Steyr AUG +9 dB, SIG 551 +14 dB, 20" bolt action equal, 20" AR-15 -2 dB. Piston guns vent gas ahead of the suppressor, which "cannot be addressed by a suppressor". `[MFR-affiliated]` — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- On a 20" bolt-action .308, the shooter's ear averaged about 8.9 dBA quieter than MIL-STD left across the Summit data. `[IND]` — [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/)
- Rearward-angled brake ports on a suppressor reverse that advantage: TBAC Magnus RR was 1.7 dBA quieter than the plain Magnus at MIL-STD left but 120 dBA versus 112.5 dBA at the ear (values appear to be Leq, not peak). `[IND]` — [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/)
- On semi-auto 5.56, the ear is the worse position: PEW Science rates the SureFire RC3 on a 10.3" MK18 at 27.2 at the muzzle versus 22.4 at the ear (lower is more hazardous); muzzle blast and ejection-port blast combine at the ear. `[IND]` — [PEW Science 6.151](https://pewscience.com/sound-signature-reviews-free/sss-6-151-surefire-556rc3-mk18-556)

Under / over 140 dB summary (peak, from the rows above):

| Under 140 dB in the cited data | At or over 140 dB in the cited data |
|---|---|
| .22 LR pistol or rifle with any modern can (116-128 dB) | Short "K" cans on 6.5 CM / .308 bolt guns (142-150 dB) |
| 9mm 147 gr subsonic from MP5 (about 129-130 dBA) | Suppressors with brake end caps (146-160 dB at 1 m left) |
| 5.56 M4 14.5" at 1 m left (131-133 dBA) | 5.56 from 11.5" at the ear, about 140 dB (anecdotal) |
| 5.56 10.3"/14.5" at ear with RC2 (136-138 dB, manufacturer; within 2-4 dB of the limit) | .338 Lapua suppressed, 145 dB |
| Subsonic .300 BLK bolt action with a good can (132-137 dB first shot) | Subsonic .300 BLK with a poorly matched can (147.5 dB first shot) |
| Full-size .30 cans on 20" .308 and 6.5 CM bolt guns (122-138 dB) | .50 BMG at the MIL-STD position (140 dBA, manufacturer) |

### Inferences
- "20-35 dB" is the right headline range: instrumented data here spans 15-35 dB at 1 m left, with 3 dB as the floor for bad pairings and about 35 dB as the ceiling for the best large rifle cans.
- A game model with two outputs per shot, "muzzle loudness" (heard by enemies) and "shooter exposure", would match the data: bolt guns are quieter at the ear than at the muzzle by about 9 dB, while gas guns can be louder at the ear than their muzzle number implies.
- Compact cans should cost about 10-17 dB of suppression versus full-size cans on the same host (Ultra 5 versus Ultra 9: 147.4 versus 135.2 dB).
- Piston or leaky actions should carry a +5 to +14 dB suppressed-loudness penalty versus direct impingement or manual actions.

### Gaps
- No protocol-stated suppressed figures found for .45 ACP, 7.62x39, supersonic .300 BLK, or 12 gauge (SilencerCo Salvo 12 data not retrieved). A vendor guide quoted in search results gives supersonic .300 BLK "132-138 dB" and subsonic "126-131 dB at the ear from a 9" barrel"; a SilencerCo blog claims 119.5 dB for its quietest subsonic .300 BLK build. Neither page could be opened to verify host or mic position, so treat as unverified manufacturer/vendor claims.
- A 2014 NDIA briefing on a .338 Norma Magnum machine-gun suppressor was summarized in search results as "about 10 dB reduction", but the quoted levels (123 versus 113 dB) are clearly not 1 m peak values; the mic distance was not confirmed. Not used.
- PEW Science per-shot dB tables for 5.56, 7.62 and 9mm are in images or members-only content.

## 3. Best-case quiet systems and everyday reference sounds

### Takeaway
The quietest verified firearm systems measure roughly 116-130 dB peak at 1 m (suppressed .22 LR pistol about 116-126 dB; subsonic 9mm MP5 about 129 dB; subsonic .300 BLK bolt action about 132-137 dB). That is still as loud, in peak terms, as hammering a nail (about 133 dB at 1 m) or an AR-15 bolt slamming shut (123 dB), and about 20-30 dB above a BB gun (97 dB).

### Cited Findings

| System | Level | Position | Class | Source |
|---|---|---|---|---|
| .22 LR SV, Ruger MK II + Gemtech Outback-II | 116.6-118.1 dBA | MIL-STD left | MFR | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR SV, Ruger MK II + older can | 122.2 dBA / 126.0 dBZ | MIL-STD left | MFR-affiliated | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR subsonic rifle, suppressed | 108-118 dB | no protocol | RETAIL | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| 9mm 147 gr subsonic, MP5 + Gemtech Raptor | 129.0-129.5 dBA | MIL-STD left | MFR | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .300 BLK 190 gr subsonic, bolt-action mini FIX 8" + Enticer L-Ti | 136.7 dB first-shot peak; Suppression Rating 65.5 | 1.0 m left | IND | [PEW Science 6.88](https://pewscience.com/sound-signature-reviews-free/sss-6-88-ddc-enticer-l-minifix-300blk) |
| HK MP5SD (integral) | estimated 120-130 dB (30-40 dB reduction); not a measurement | n/a | low-quality secondary | [History Rise](https://historyrise.com/article/the-development-of-the-mp5sd-integrating-suppression-technology-in-submachine-guns/) |

MP5SD design facts (relevant to velocity/damage stats):

- The MP5SD barrel is ported and shortened from 8.96" to 5.75" so that standard supersonic 9mm (about 1,300-1,400 ft/s for 124 gr NATO) leaves subsonic. — [Forgotten Weapons](https://www.forgottenweapons.com/hk-mp5sd-the-cadillac-of-suppressed-submachine-guns/); [History Rise](https://historyrise.com/article/the-development-of-the-mp5sd-integrating-suppression-technology-in-submachine-guns/)
- Dater calls the Soviet VSS (9x39) integral suppressor "simple and highly effective" but gives no dB value. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)

Wet suppressors and locked actions:

- Running a 9mm can wet gains "anywhere from 1 to 5 decibels", more on rimfire (single designer's estimate). — [Gun Digest](https://gundigest.com/gear-ammo/suppressors/making-cans-quieter/amp)
- A forum post reports 163 dB unsuppressed, 133 dB dry, 125 dB wet for one pistol can (8 dB wet gain). `[ANEC]` — [Sniper's Hide](https://www.snipershide.com/shooting/threads/dry-vs-wet-pistol-suppressor.75840)
- Locked-breech/manual actions do not vent gas at the action; a 20" bolt action measured the same as a 14.5" M4 with the same can at 1 m left, while piston guns measured 5-14 dB louder. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Standard-velocity and subsonic .22 LR produced no measurable or perceived bullet flight noise. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)

Reference sounds (peak or typical level; mixed methods):

| Sound | Level | Source |
|---|---|---|
| AR-15 bolt release / dry fire | 123 dB / 113 dB at 1 m | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| Ruger 10/22 bolt release / dry fire | 119 dB / 105 dB at 1 m | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| Steel hammer driving a nail, or on an anvil | 133 dB at 1 m | [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels) |
| Pneumatic nail gun | ~110 dB | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| BB gun | 97 dB | [Silencer Central](https://www.silencercentral.com/blog/how-loud-is-a-gunshot-gun-db-levels-compared/) |
| Police siren (close) | ~120 dB | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| Lawn mower / motorcycle | ~90-100 dB | [Silencer Central](https://www.silencercentral.com/blog/how-loud-is-a-gunshot-gun-db-levels-compared/); [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |
| Normal conversation | ~60 dB | [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like) |

### Inferences
- The floor for a suppressed firearm is set by mechanical noise: a semi-auto's action cycling (bolt release 119-123 dB peak at 1 m) is within a few dB of a good suppressed .22 shot, so "quieter than the action" is not achievable on a semi-auto. A manual or locked action is the only way below that.
- Impulse peaks are not comparable to continuous-noise figures. Dater notes gunshots "are not perceived as being as loud as a lower intensity continuous sound source" because they are so brief, so a 125 dB peak pop does not sound like a 125 dB siren. For game purposes, perceived loudness of a best-case suppressed shot is closer to a loud hand clap or staple gun than to the reference table's continuous sources.

### Gaps
- No instrumented dB measurement found for the HK MP5SD, AS Val / VSS (9x39), suppressed .45 ACP, De Lisle or Welrod-type locked-breech systems, or a controlled wet-versus-dry pistol test with stated mic position.
- No sourced dB figures found for door slam, jackhammer, or pellet air rifle.

## 4. Supersonic crack level and decay with distance

### Takeaway
The bullet's ballistic crack measures roughly 144-153 dB peak at 1 m from the flight path and is unchanged by a suppressor. It does not fall off with distance from the shooter (it is regenerated along the whole flight path): a 5.56 rifle bullet still produced about 147-151 dB(C) peaks for a listener beside the trajectory at 300 m.

### Cited Findings

| Cartridge | Crack level, unsuppressed | Crack level, suppressed | Position | Source |
|---|---|---|---|---|
| .308 | 151.9 dB | 152.6 dB | 55 yd downrange, 1 m beside flight path | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .223 M855 | 148.1 dB | 148.5 dB | same | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR high velocity | 144.1 dB | 143.5 dB | same | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| .22 LR subsonic / standard velocity | no measurable or perceived sound | same | same | [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf) |
| 5.56 SA80 | 150.1 / 151.3 / 147.2 / 148.4 dB(C) at 50 / 100 / 200 / 300 m downrange | n/a | microphones close beside the line of fire | [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf) |

- The crack's energy is centered around the 6.3 kHz band and stays fairly constant from 50 m to 300 m; the muzzle "thump" is centered at 250-315 Hz and falls steadily with distance, its peak band dropping to about 200 Hz at 300 m as high frequencies are absorbed. `[ACAD]` — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- Crack-to-thump delay for a listener beside the line of fire grows from 94 ms at 50 m to about 507 ms at 300 m; the bullet was still at 720 m/s (over Mach 2) between 200 m and 300 m. `[ACAD]` — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- The crack "is generated outside the weapon system and cannot be addressed by a suppressor"; it is perceived when the shock wave reaches or reflects toward the listener. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Speed of sound reference: 1,051 ft/s at 0 F, 1,087 at 32 F, 1,118 at 60 F, 1,139 at 80 F, 1,160 at 100 F. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)

### Inferences
- With supersonic ammunition, a suppressor removes about 30 dB of muzzle blast but leaves a 144-153 dB crack along the flight path, so targets and anyone near the bullet's path hear the shot at nearly full "volume". Only observers behind or well to the side of the shooter get the full benefit. This is the strongest argument for a separate "subsonic ammo" stat in the game.
- The crack's loudness depends on the listener's lateral distance from the trajectory (miss distance), not on range to the shooter. The cited data only fix the 1 m value; decay with miss distance is not measured in these sources.
- A cold day lowers the speed of sound by about 6% between 100 F and 0 F, so loads that are subsonic at 1,050-1,100 ft/s in warm weather can go transonic and crack in the cold.

### Gaps
- No measured curve of crack level versus lateral miss distance (for example 1 m, 10 m, 50 m from the trajectory) was found. Acoustic theory for N-waves predicts slower-than-spherical decay, but no source for that was retrieved here.

## 5. First round pop (FRP)

### Takeaway
The first shot through a cold, oxygen-filled suppressor is measurably louder, but the published independent data express it as impulse or hazard ratios, not a clean dB delta: on subsonic .300 BLK the first shot carried over 280% more peak impulse than follow-ups, and on a 5.56 MK18 the first-shot bystander hazard was over twice that of follow-up shots.

### Cited Findings
- Subsonic .300 BLK, bolt-action mini FIX 8", DDC Enticer L-Ti: shot 1 has "over 280% more peak impulse" than subsequent shots on average, and hearing damage potential is "over 120% more severe". First-shot pressure peaks at 1 m left: combustion 126.0 dB, precursor 129.5 dB, primary jetting 136.7 dB. `[IND]` — [PEW Science 6.88](https://pewscience.com/sound-signature-reviews-free/sss-6-88-ddc-enticer-l-minifix-300blk)
- 5.56 MK18 10.3", SureFire SOCOM556-RC3, XM193: bystander hearing damage risk during FRP is "over twice as severe as follow-up shots, on average". `[IND]` — [PEW Science 6.151](https://pewscience.com/sound-signature-reviews-free/sss-6-151-surefire-556rc3-mk18-556)
- Ammunition changes FRP: two subsonic .300 BLK loads differed by 41% in FRP severity 1 m left of the end cap in the same silencer. `[IND]` — [PEW Science 6.109](https://pewscience.com/sound-signature-reviews-members-only/sss-6-109-research-supplement-rugged-razor762-300blk-ammo-discreet-ballistics-sb-quietest)
- FRP "cannot always be shown by viewing only the peak sound pressure" (PEW Science, as summarized in search results); a RECOIL review says FRP makes little difference in overall noise on a short suppressed 5.56. — [PEW Science 6.56](https://pewscience.com/sound-signature-reviews-members-only/sss-6-56-research-supplement-quietest-308-rifle-silencers); [RECOIL](https://www.recoilweb.com/best-5-56-nato-suppressor-187116.html)
- Standard way to compute it: fire a 10-round string from a cold can and subtract the average of the following rounds from the first shot. — [Small Arms Defense Journal](https://sadefensejournal.com/the-sounds-of-silence-part-1/2)

### Inferences
- FRP matters most on low-pressure, subsonic systems (where the baseline is quiet) and least on short-barrel supersonic 5.56 (where every shot is already loud). A game rule such as "first shot after a pause is +3 to +6 dB on subsonic weapons, negligible on supersonic rifles" is consistent with this, but the dB figure itself is a design assumption, not a cited measurement.

### Gaps
- No independent source with a stated FRP in dB (first shot minus string average) was retrieved. Commonly repeated hobbyist figures of 2-10 dB could not be tied to a citable test in this session.

## 6. PEW Science Suppression Rating

### Takeaway
The Suppression Rating is a dimensionless 0-100 hearing-damage-risk score for one silencer on one host (higher is quieter), computed from full pressure waveforms at the muzzle and shooter's ear, not a dB value. Published examples run from the high 20s for a 5.56 can on a 10.3" MK18 to the mid 60s for subsonic .300 BLK and 9mm pistol systems.

### Cited Findings
- Scale: 0 to 100, dimensionless, linear; 0 is the most severe signature, 100 is "the quietest possible small arm weapon system". It can be shown with a non-linear "shot dose" scale that assumes occasional exposure (no more than one shooting session in a sliding 24 hours per week). — [PEW Science SSS.5](https://pewscience.com/silencer-sound-standard-suppression-rating)
- Inputs: peak pressure magnitude, pressure duration, and phase/frequency content at both the muzzle and the shooter's ear, combined through an inner-ear damage-risk model. Measured 1.0 m left of the muzzle and 0.15 m from the shooter's right ear. — [PEW Science SSS.5](https://pewscience.com/silencer-sound-standard-suppression-rating)
- It is a damage risk criterion: "a lower Suppression Rating indicates a higher personnel hazard in the free field"; each rating is specific to a silencer and host pair. — [PEW Science 6.169](https://pewscience.com/sound-signature-reviews-free/sss-6-169-research-supplement-low-back-pressure-556-silencers)
- It is PEW Science's own scale, not a government standard. — [Popular Suppressors explainer](https://popularsuppressors.com/articles/what-is-pew-science/)

Example ratings found:

| Silencer | Host / ammo | Rating | Source |
|---|---|---|---|
| SureFire SOCOM556-RC3, 3-prong mount | MK18 10.3", XM193 | composite 28.8; muzzle 27.2; ear 22.4 | [PEW Science 6.151](https://pewscience.com/sound-signature-reviews-free/sss-6-151-surefire-556rc3-mk18-556) |
| SureFire SOCOM556-RC3, WARCOMP mount | MK18 10.3", XM193 | composite 26.5 | [PEW Science 6.151](https://pewscience.com/sound-signature-reviews-free/sss-6-151-surefire-556rc3-mk18-556) |
| CAT WB | M4A1 14.5" 5.56 | muzzle 40.6; ear 28.7 | [PEW Science 6.130](https://pewscience.com/sound-signature-reviews-free/sss-6-130-cat-wb-m4a1-556) |
| DDC Enticer L-Ti | .308 bolt action 20", supersonic | 51.9 | [PEW Science 6.88](https://pewscience.com/sound-signature-reviews-free/sss-6-88-ddc-enticer-l-minifix-300blk) |
| DDC Enticer L-Ti | Q mini FIX 8", .300 BLK 190 gr subsonic | 65.5 | [PEW Science 6.88](https://pewscience.com/sound-signature-reviews-free/sss-6-88-ddc-enticer-l-minifix-300blk) |
| CAT SC (long configuration) | HK P30L 9mm pistol | 64.6 | [PEW Science 6.162](https://pewscience.com/sound-signature-reviews-free/sss-6-162-cat-sc-b1-p30l) |
| CAT SC (short configuration) | HK P30L 9mm pistol | 50.7 at shooter's head | [PEW Science 6.162](https://pewscience.com/sound-signature-reviews-free/sss-6-162-cat-sc-b1-p30l) |

- Peer groupings on the MK18: the RC3's free-field hazard reduction is similar to the Q Trash Panda, HUXWRX HX-QD 556, KAC QDSS-NT4 and Aero Lahar-30; its at-ear result is similar to the SOCOM556-RC2, CGS Helios QD, HUXWRX HX-QD 556k and KAC 5.56 QDC. — [PEW Science 6.151](https://pewscience.com/sound-signature-reviews-free/sss-6-151-surefire-556rc3-mk18-556)
- On the MK18, the SOCOM556-RC2 rates relatively high at the muzzle and the flow-through HUXWRX HX-QD 556 rates relatively high at the ear. — [PEW Science 6.65](https://pewscience.com/sound-signature-reviews-free/sss-6-65-research-supplement-taming-the-mk18)

### Inferences
- Because the scale is linear in hazard terms and spans about 22 (short 5.56 at the ear) to about 65 (subsonic systems) in published examples, it maps well onto a 0-100 game "stealth" stat: 20s-30s for short supersonic carbines, 40s-50s for full-size supersonic rifles, 60s and up for subsonic systems.
- The same can scoring 51.9 on supersonic .308 and 65.5 on subsonic .300 BLK shows that host and ammunition move the rating as much as the choice of suppressor does.

### Gaps
- The named bands on PEW Science's scale graphic and dose chart (what ranges count as minimal, moderate, high and so on) are published as images and could not be read. The full rankings table is generated by a script and was not retrievable.
- No rating for an unsuppressed weapon or for a .22 LR system was retrieved.

## 7. Other measurable effects: recoil, flash, velocity, POI, cyclic rate, back pressure, weight/length, heat, service life

### Takeaway
Independent sled testing puts recoil reduction from plain suppressors at roughly 0-30% (versus 38-58% for muzzle brakes), with a clear trade-off between quietness and recoil reduction. Velocity changes are within about plus or minus 30 fps (1%). Rifle cans add roughly 5-9" and 10-21 oz; sustained automatic fire drives them to about 800 F within 100 rounds and past 1,000 F after about 200.

### Cited Findings

Recoil (6.5 Creedmoor bolt action on a free-recoil sled; bare muzzle travel 39.5"; percentages are computed from the published sled-travel inches, and the article's rule of thumb is that 1" of travel is roughly 4% of felt recoil):

| Device | Sled travel | Reduction vs bare | Sound at 1 m left | Source |
|---|---|---|---|---|
| Bare muzzle | 39.5" | 0% | 165 dB | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| Muzzle brakes (range of 7 tested) | 16.5-24.2" | 39-58% | 165.7-168.9 dB | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| Quiet full-size cans: Tenet Reserve 6.5, Able Theorem L, TBAC Ultra 9 | 34.4-35.2" | 11-13% | 129.9-135.2 dB | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| PTR Vent 1 / Mack Bros Zenith L | 29.8" / 28.0" | 25% / 29% | 130.7 / 133.0 dB | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| Short/light cans: Zenith K, Airlock Zero Gravity 6.5, TBAC Ultra 5 | 37.8-39.3" | 0.5-4% | 135.7-149.8 dB | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |
| Suppressors with brake end caps (Scythe Ti, Omega 300, Hyperion K with Recoil X) | 20.5-22.1" | 44-48% | 142.3-157.3 dB | [Outdoor Life](https://www.outdoorlife.com/gear/suppressor-recoil-test.md) |

- .50 BMG: TBAC Ultra 50 claimed to reduce recoil by 65% versus a bare muzzle. `[MFR]` — [Paramount Tactical product page](https://paramounttactical.com/product/ultra-50-suppressor)

Muzzle velocity:

- .300 Win Mag, 24" barrel, four loads, three suppressors: effects on muzzle velocity "are small". One load (200 ELD-X) showed no significant change in any condition; one (190 ABLR) lost about 30 ft/s (about 1%) with a SilencerCo Omega; two loads showed a small increase with one 8" suppressor. Suppressors also reduced yaw and drag for yaw-prone bullets. `[ACAD]` — [Courtney et al., arXiv 1802.05748](https://arxiv.org/pdf/1802.05748)
- Vendor guidance: typical gain of 10-40 fps (other guides 10-30 fps, occasionally 50+). `[RETAIL]` — [Silencer Shop](https://www.silencershop.com/blog/do-suppressors-affect-accuracy); [Crate Club](https://crateclub.com/blogs/loadout/do-suppressors-increase-velocity-understanding-the-impact-on-muzzle-velocity-and-performance)
- Secondary reports of the Courtney study disagree on direction (10-20 fps faster per one article, 10-30 fps slower per another); the primary paper shows both occur depending on load. — [Athlon Outdoors](https://athlonoutdoors.com/article/ballistic-app-suppressor-pro-tip/); [Shoot On](https://shoot-on.com/?p=29582)
- Integral ported systems are the exception: the MP5SD's ported 5.75" barrel deliberately bleeds standard 9mm (about 1,300-1,400 ft/s) down to subsonic. — [History Rise](https://historyrise.com/article/the-development-of-the-mp5sd-integrating-suppression-technology-in-submachine-guns/)

Point of impact:

- POI "will almost certainly move - sometimes by a few tenths of an inch at 100 yards, sometimes by several inches"; the shift is repeatable and most often downward from the added muzzle weight. `[RETAIL]` — [Silencer Shop](https://www.silencershop.com/blog/do-suppressors-affect-accuracy); [Creedmoor Sports](https://www.creedmoorsports.com/do-suppressors-affect-accuracy/)
- One user test: 1" high and 2.5" left at 100 yd with the can on. `[ANEC]` — [Long Range Hunting forum](https://longrangehunting.com/threads/suppressor-impact-on-velocity-and-poi-tested.278065)

Cyclic rate and back pressure:

- TBAC Spiro: about 50% increase in back pressure and 5% increase in cyclic rate; closest competitor 48% and 3%. `[MFR]` — [Athlon Outdoors](https://athlonoutdoors.com/article/thunderbeasts-new-spiro-suppressor/)
- POF full-auto rifle: about 1,097 rpm with a conventional suppressor versus about 847-850 rpm with POF's flow-through MAXFLO 3D (PACT timer). `[MFR]` — [Athlon Outdoors](https://athlonoutdoors.com/article/pof-rifles-maxflo-3d-suppressors/)
- Independent small test on a machine gun: only about 10-22 rpm difference across suppressor configurations, within the gun's margin of error. `[IND]` — [TFB Silencer Saturday #402](https://www.thefirearmblog.com/blog/silencer-saturday-402-suppressor-impact-on-machine-gun-rate-of-fire-44823388)
- Forum claim: high-back-pressure cans raise M4 cyclic rate by 200-300 rpm. `[ANEC]` — [AR15.com](https://www.ar15.com/forums/ar-15/Several_suppressor_related_AR_questions_from_a_newbie/118-198847/)
- Suppressor entrance-chamber pressure, M855: 2,990 psi (10.5" barrel) versus 1,978 psi (14.5"). — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)

Weight and length (manufacturer specs unless noted):

| Suppressor | Class | Length | Weight | Source |
|---|---|---|---|---|
| SilencerCo Osprey 9 | 9mm pistol | 7.06" | 8.8 oz | [SilencerCo](https://silencerco.com/silencers/osprey/) |
| SilencerCo Osprey 45 | .45 pistol | 8.06" | 9.2 oz (an earlier model reviewed at 11.1 oz) | [Scheels listing](https://www.scheels.com/p/silencerco-osprey-45-pistol-suppressor/817272-SU5185/); [Handguns Magazine](https://www.handgunsmag.com/editorial/silencerco-osprey-suppressor-review/137962) |
| SureFire SOCOM556-RC2 | 5.56 | 6.4" x 1.5" dia | not captured | [TFB #308](https://www.thefirearmblog.com/blog/2023/12/16/surefire-socom556-rc3/) |
| SureFire SOCOM556-RC3 | 5.56 | 6.3" overall, 3.8" added to gun | 16.9-17 oz; 20.8 oz with 3-prong mount (PEW-measured) | [Guns & Ammo](https://www.gunsandammo.com/editorial/surefire-socom556-rc3-full-review/517304); [PEW Science 6.151](https://pewscience.com/sound-signature-reviews-free/sss-6-151-surefire-556rc3-mk18-556) |
| SilencerCo Omega 300 | .30 cal | 6.98" (older review: 7.09") | 12.6 oz (older review: 14.0 oz) | [SilencerCo 2024 catalog](https://woodev.silencerco.com/wp-content/uploads/2024/01/CATALOG-2024.pdf); [Shooting Illustrated](https://www.shootingillustrated.com/content/review-silencerco-omega-300-suppressor) |
| DDC Enticer L-Ti | .30 cal titanium | 8.5" x 1.625" dia | 9.7 oz (10.7 oz with mount) | [PEW Science 6.88](https://pewscience.com/sound-signature-reviews-free/sss-6-88-ddc-enticer-l-minifix-300blk) |
| B&T Monoblock 762 | .30 cal, longest tested | 12.63" | not captured | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| 2024 Summit, 9"+ .30 cal class | .30 cal | 8.5"+ | average 18 oz, some near 2 lb | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |
| 2024 Summit, top 25 .30 cal overall | .30 cal | average 7.09" (range 5.0-9.3") | n/a | [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/) |

Heat and service life:

- 100 rounds of full-auto raises a 5.56 suppressor to about 800 F, at which 300-series stainless retains about 62% of its room-temperature yield strength; the suppressor's pressure safety factor falls from 2.90 to 1.8 on a 14.5" barrel and from 1.92 to 1.19 on a 10.5" barrel. — [Dater & Wong 2010](https://ndia.dtic.mil/wp-content/uploads/2010/armament/WednesdayCumberlandPhilipDater.pdf)
- After about 200 rounds of sustained automatic fire, roughly 900-1,200+ F; over 1,000 F under repeated mag dumps. `[RETAIL]` — [Primary Arms](https://blog.primaryarms.com/guide/suppressor-heat-management/); [Crate Club](https://crateclub.com/blogs/loadout/how-hot-do-suppressors-get-a-comprehensive-guide-for-tactical-enthusiasts)
- Rough per-shot heating: about 7-10 F per round. `[RETAIL]` — [Silencer Central](https://www.silencercentral.com/blog/suppressor-temperature-how-hot-do-they-get/)
- SureFire SOCOM manual firing schedule: avoid more than 90 rounds of sustained fire, then let it cool; high-rate fire beyond 120 rounds can create cook-off conditions. `[MFR]` — [SureFire SOCOM manual](https://www.silencercentral.com/wp-content/uploads/2023/09/71-01-863_Socom-Sound-Suppressor-System_Rev-G.pdf)
- Service life: one user reports about 15,000 mostly full-auto rounds from a 10.5" barrel through a SureFire can still in good shape `[ANEC]`; SilencerCo says some Velos LBP units have passed 18,000 rounds without issues `[MFR]`. — [Sniper's Hide](https://www.snipershide.com/shooting/threads/surefire-socom-or-similiar-suppressor-life-on-mk18-style-rifles.194521); [TFB](https://www.thefirearmblog.com/blog/low-back-pressure-suppressors-do-they-really-make-a-difference-44817520)

Flash:

- Only qualitative claims found: SureFire says the RC3 "virtually eliminates explosive flash"; open-tine (3-prong) mounts are preferred when flash under night vision matters. `[MFR]` — [RECOIL](https://www.recoilweb.com/surefire-launches-the-latest-rc3-silencer-182005.html); [TFB Silencer Saturday #315](https://www.thefirearmblog.com/blog/2024/02/10/flash-hiding-surefire-rc3-suppressor/)

### Inferences
- Quietness and recoil reduction trade against each other: the quietest cans cut recoil 11-13%, while brake-capped cans cut 44-48% but give up 10-25 dB. That supports two distinct attachment archetypes ("stealth can" versus "recoil can").
- Suggested stat ranges derived from the tables: recoil -10 to -30% for plain rifle cans; velocity 0 to plus or minus 1%; added length +4 to +9" (QD cans add less than their overall length because they overlap the muzzle device); added weight +9 to +21 oz for rifle cans, +9 to +11 oz for pistol cans; cyclic rate +3 to +30% on gas guns with conventional cans and about 0% with flow-through cans.
- Heat: at about 7-10 F per round, a 30-round magazine adds 200-300 F, consistent with about 800 F at 100 rounds; a game overheat threshold around 90-120 rounds of rapid fire matches SureFire's schedule.

### Gaps
- No measured flash-reduction figures (percent or candela) were found.
- No controlled, independent cyclic-rate measurement for an M4 with a specific conventional can. TBAC's back-pressure page returned 503.
- No rimfire can weight/length specs retrieved (the SilencerCo Sparrow search returned nothing usable).
- No formal manufacturer service-life rating in rounds was found; the round counts above are an anecdote and a manufacturer remark.
- POI shift has no instrumented MOA data set here, only vendor guidance and one anecdote.

## 8. Audibility, detection distance, and localization

### Takeaway
Muzzle blast decays close to 6 dB per doubling of distance (measured: 158 dB at 1 m to 128 dB at 32 m for an unsuppressed 5.56 rifle), so a 30 dB suppressor makes a shot at 1 m as loud as an unsuppressed shot at about 32 m. The US Army's ARL has a detection-range model for suppressed versus unsuppressed M4 fire, but its tables could not be retrieved; the only figures seen (17.8 km and 3.1 km) are unverified.

### Cited Findings

Measured decay, unsuppressed SA80 5.56, to the side of the firer (mean LCpeak / LAE):

| Distance to side | LCpeak dB(C) | Sound exposure level LAE dB(A) |
|---|---|---|
| 0.3 m | 161.2 | 124.7 |
| 0.5 m | 159.5 | 123.9 |
| 1 m | 158.2 | 122.6 |
| 2 m | 155.5 | 119.3 |
| 4 m | 152.9 | 114.8 |
| 8 m | 143.9 | 105.7 |
| 16 m | 136.0 | 99.4 |
| 32 m | 128.1 | 90.9 |

Source: [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf) `[ACAD]`

- From the same study: peak levels exceed 137 dB(C) within about 20 m to the side of an unsuppressed rifle and 135 dB(C) within about 25 m; shot-to-shot variation grows with distance (0.2% at 0.3 m versus 2.1% at 32 m). — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- Dater's inverse-square illustration for a downrange observer: unsuppressed 164 / 158 / 152 / 146 / 140 dB at 1 / 2 / 4 / 8 / 16 m; suppressed 136 / 130 / 124 / 118 / 112 dB at the same distances. "Each doubling of distance reduces sound level by 6 dB." — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Ground surface: readings over concrete run about 2+ dB higher than over grass. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Low frequencies carry farther: the muzzle thump's dominant band shifts from 315 Hz at 50 m to 200 Hz at 300 m. — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- ARL-TR-9277, "Quantitative Human Factors for Small Arms: Suppression Field Effects" (Fedele, Ericson, Fluitt et al., Aug 2021): models detection by splitting the gunshot into frequency bands and finding the distance at which each band drops to the listener's hearing threshold; "the band that can be heard at the farthest distance establishes the detection range". It accounts for atmospheric propagation, listener hearing loss and background noise, and includes tables for unsuppressed versus suppressed M4 and for average detection ranges at three background-noise levels, plus sections on localization, front-back reversals and the precedence effect. A search excerpt showed detection distances of 17.8 km and 3.1 km without confirming which condition each belongs to. `[ACAD]` — [ARL-TR-9277 (DTIC AD1147939)](https://apps.dtic.mil/sti/trecms/pdf/AD1147939.pdf)

Localization:

- "The crack points at the path of the bullet, while the muzzle blast locates the shooter" (US Army/NDIA briefing, as summarized in search results). — [NDIA 2009 small arms briefing](https://ndia.dtic.mil/wp-content/uploads/2009/infantrysmallarms/thursdaysessionxi8453.pdf)
- The muzzle blast may indicate the distance of the firer and the thump the direction; the crack can be localized separately "but does not indicate the direction of the firer". — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- Listener studies with recorded M4 fire found localization accuracy significantly affected by azimuth and amplitude differences but not by timing differences. `[ACAD]` — [Univ. of Maryland thesis (MD-SOAR)](https://mdsoar.org/handle/11603/2045)
- No tested hearing-protection or enhancement device preserved "normal" localization of blank gunfire in a field study. — [CDC Stacks](https://stacks.cdc.gov/view/cdc/111710/cdc_111710_DS1.pdf)

### Inferences
- Rule of thumb for design: every 6 dB of suppression halves the distance at which the shot reaches a given loudness, and every 20 dB cuts it tenfold. A 30 dB reduction therefore cuts "equal loudness" distance by a factor of about 32 in free field (10^(30/20)), which matches both the SA80 table (1 m to 32 m is 30.1 dB) and Dater's table. Real outdoor ranges fall short of the free-field figure because atmospheric absorption, terrain and background noise add losses at long range.
- If the 17.8 km and 3.1 km ARL figures are unsuppressed and suppressed detection ranges in quiet conditions (unconfirmed), the ratio is about 5.7 to 1, far less than the free-field factor of about 32 for 30 dB. That would be consistent with long-range audibility being governed by low-frequency content and atmospheric absorption, not by peak level alone. Treat as a hypothesis until the report is read.
- With supersonic ammunition a suppressed shooter is still heard by the target (crack about 148 dB near the path), but the listener loses the muzzle thump that gives the shooter's bearing and range. The practical effect of suppression is therefore "they know they are being shot at, but not from where", which a game can model as detection without localization. With subsonic ammunition both cues are reduced.
- Background noise sets the audibility floor: a suppressed peak of 130 dB at 1 m falls to roughly 70 dB by about 1 km in free field (60 dB of spreading loss), in the range of ordinary daytime ambient noise, whereas an unsuppressed 160 dB shot would still be about 100 dB. This is arithmetic on the inverse-square rule, not a measurement.

### Gaps
- ARL-TR-9277's tables (detection ranges by background noise; suppressed versus unsuppressed M4; localization error and front-back reversal rates) could not be read: DTIC returned 403 and then a maintenance page. This is the single most valuable missing source for game detection-range tuning.
- No measured data found on how far suppressed subsonic systems (.22 LR, .300 BLK, 9mm) are audible in real terrain, and no listener study comparing localization error for suppressed versus unsuppressed fire was retrieved.
- Atmospheric absorption coefficients (dB per km by frequency) were not sourced in this session.

## 9. Reference thresholds and how decibels scale

### Takeaway
Both OSHA and NIOSH set 140 dB peak as the ceiling for impulse noise, which is where the "hearing safe" label comes from; researchers stress it is a design limit, not a guarantee of safety. Decibels are logarithmic: +3 dB doubles sound energy, +10 dB is ten times the energy and roughly twice the perceived loudness, and +6 dB doubles sound pressure (and is what one halving of distance gives).

### Cited Findings
- OSHA: "Exposure to impulsive or impact noise should not exceed 140 dB peak sound pressure level." — [OSHA 29 CFR 1910.95](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.95)
- NIOSH recommends the same 140 dB peak ceiling, an 85 dBA 8-hour limit, and a 3 dB exchange rate (OSHA uses 5 dB). — [NIOSH 98-126, ch. 2 (archived)](https://webarchive.library.unt.edu/eot2008/20090115041105/http:/www.cdc.gov/niosh/docs/98-126/chap2.html)
- MIL-STD-1474D (1997) uses 140 dB peak for firearm sound before hearing protection is required; small arms are covered in Requirement 4. Its reference position is 2 m to the side, 1.6 m high, no reflecting surfaces within 10 m; the industry uses 1 m left with peak detection and (historically) A-weighting. Required meter rise time is 20 microseconds or less; modern digital meters manage about 28. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- Weighting changes the number: the same suppressed .22 pistol shot read 122.2 dBA, 118.8 dBC and 126.0 dBZ. Dater argues A-weighting was adopted because "the numbers looked better" and that unweighted is more appropriate above 130 dB. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- The 140 dB criterion is contested: studies cited by Dater (Price 2005; Patterson 1994; Chan 2003) found 10-20 dB errors in MIL-STD hearing-damage assessment. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- NIOSH authors: suppressed firearms can still pose significant hearing risk; always wear hearing protection. — [Murphy et al. 2018](https://stacks.cdc.gov/view/cdc/211059)
- UK/EU action values for comparison: 135 dB(C) lower action value, 137 dB(C) upper action value, 140 dB(C) exposure limit. — [SA80 study](https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/SA80-manuscript.pdf)
- Standard noise dosimeters clip gunfire at about 146 dB, so consumer-grade meters under-read unsuppressed shots. — [NIOSH (CDC Stacks)](https://stacks.cdc.gov/view/cdc/196595/cdc_196595_DS1.pdf)
- 0 dB is 20 micropascals; 1 psi is 6,895 Pa. — [Dater 2014](https://www.larsondavis.com/ContentStore/mktg/LD_Docs/Firearm_Sound_Briefing.pdf)
- A 10 dB increase is perceived as roughly twice as loud; 20 dBA quieter is about a quarter of the perceived loudness. — [Precision Rifle Blog](https://precisionrifleblog.com/2024/09/14/2024-suppressor-summit-hard-data-to-compare-250-suppresors/); [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like)
- Extreme end of the scale at 1 m: tissue damage observed at 185 dB; 1 lb of TNT about 203 dB; 99% lethal overpressure 205 dB. — [Bookstaber](https://david.bookstaber.com/Interests/2017/08/introduction-to-shots-pops-and-sound-pressure-levels)
- Hearing protection: muffs are rated NRR 25-33 dB; doubling plugs and muffs adds about 8 dB. `[RETAIL]` — [Silencer Shop](https://www.silencershop.com/blog/post/what-does-a-gunshot-sound-like)

### Inferences
- A good suppressor (25-35 dB) provides about the same reduction as one layer of good hearing protection (NRR 25-33), which is the comparison most sources draw.
- Worked conversions (arithmetic on the definitions above): 140 dB is 200 Pa (0.029 psi); 165 dB is about 3,560 Pa (0.52 psi); 170 dB is about 6,325 Pa (0.92 psi). A 30 dB reduction is a 1,000-fold cut in sound energy and about a 32-fold cut in pressure, but only about an eighth of the perceived loudness.
- Dater's slide gives the decibel formula as 10 log10(P1/P0) and says doubling pressure is 3 dB. For sound pressure the conventional form is 20 log10, which makes a pressure doubling 6 dB; the 3 dB figure applies to doubling energy or intensity. Use 3 dB = 2x energy, 6 dB = 2x pressure, 10 dB = about 2x perceived loudness.

### Gaps
- No primary source was retrieved for the threshold of pain (commonly given as 120-140 dB) or for the psychoacoustic "10 dB is twice as loud" rule; the latter is cited here only via shooting-industry sources.
- MIL-STD-1474E (2015) and its newer impulse metrics were not retrieved; all standard details above are for 1474D as described by Dater.
